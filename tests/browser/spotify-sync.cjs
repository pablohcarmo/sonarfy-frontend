const { chromium, firefox } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'test-results/spotify-sync');
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (error, bytes) => {
        res.writeHead(error ? 404 : 200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
        res.end(error ? 'Página não encontrada' : bytes);
    });
});

(async () => {
    fs.mkdirSync(output, { recursive: true });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const results = [];
    for (const name of ['edge', 'firefox']) {
        const browser = name === 'edge' ? await chromium.launch({ channel: 'msedge', headless: true }) : await firefox.launch({ headless: true });
        try {
            for (const width of [1440, 390]) for (const theme of ['light', 'dark']) {
                const context = await browser.newContext({ viewport: { width, height: 900 } });
                const page = await context.newPage();
                const errors = [];
                page.on('pageerror', error => errors.push(error.message));
                await page.addInitScript(theme => {
                    localStorage.setItem('sonarfy_theme', theme);
                    localStorage.setItem('sonarfy_token', 'browser-test-token');
                }, theme);
                let authCalls = 0;
                await context.route('**/api/spotify/authorization', async route => {
                    const req = route.request();
                    if (req.method() === 'OPTIONS') {
                        return route.fulfill({
                            status: 200,
                            headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization' }
                        });
                    }
                    assert.equal(req.method(), 'POST');
                    assert.equal(req.headers().authorization, 'Bearer browser-test-token');
                    authCalls += 1;
                    if (authCalls === 1) {
                        return route.fulfill({ status: 429, headers: { 'Access-Control-Allow-Origin': '*' } });
                    }
                    return route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        headers: { 'Access-Control-Allow-Origin': '*' },
                        body: JSON.stringify({ authorizationUrl: 'https://accounts.spotify.com/authorize?response_type=code&state=browser-state' })
                    });
                });
                await context.route('**/api/spotify/connection', async route => {
                    const req = route.request();
                    if (req.method() === 'OPTIONS') {
                        return route.fulfill({
                            status: 200,
                            headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization' }
                        });
                    }
                    return route.fulfill({
                        status: req.method() === 'DELETE' ? 204 : 200,
                        contentType: 'application/json',
                        headers: { 'Access-Control-Allow-Origin': '*' },
                        ...(req.method() === 'GET' ? { body: JSON.stringify({ status: 'DISCONNECTED', connectedAt: null }) } : {})
                    });
                });
                await context.route('**/api/users/me', async route => {
                    return route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        headers: { 'Access-Control-Allow-Origin': '*' },
                        body: JSON.stringify({
                            id: 1, name: 'Ana', surname: 'Ribeiro', handle: 'ana_ribeiro',
                            email: 'ana@sonarfy.com', city: 'São Paulo', country: 'Brasil', birthDate: '1999-08-15', active: true
                        })
                    });
                });
                await context.route('https://accounts.spotify.com/**', route => route.fulfill({
                    status: 200,
                    contentType: 'text/html',
                    body: '<html lang="pt-BR"><title>Spotify OAuth Mock</title></html>'
                }));
                // Intercept profile destination to keep this script focused on Spotify onboarding and OAuth.
                await page.route('**/pages/profile.html', route => route.fulfill({ contentType: 'text/html', body: '<html lang="pt-BR"><title>Perfil de teste</title></html>' }));
                await page.goto(`${base}/pages/spotify-sync.html`);
                await page.evaluate(() => document.fonts.ready);
                assert.equal(await page.title(), 'Sincronizar Spotify – Sonarfy');
                assert.equal(await page.locator('footer').count(), 0);
                const geometry = await page.evaluate(() => ({
                    width: document.documentElement.scrollWidth,
                    card: document.querySelector('.spotify-card').getBoundingClientRect().toJSON(),
                    font: document.fonts.check('15px Inter'),
                    background: getComputedStyle(document.body).backgroundColor,
                    assets: [...document.images].filter(img => img.getBoundingClientRect().width > 0).map(img => ({
                        src: img.getAttribute('src'), loaded: img.complete && img.naturalWidth > 0,
                        width: img.getBoundingClientRect().width, height: img.getBoundingClientRect().height,
                        naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight
                    }))
                }));
                assert.equal(geometry.width, width);
                assert.equal(geometry.card.width, width === 1440 ? 560 : 350);
                assert.equal(geometry.background, theme === 'dark' ? 'rgb(26, 26, 26)' : 'rgb(255, 255, 255)');
                assert(geometry.font, 'Inter must load');
                assert(geometry.assets.every(asset => asset.loaded && Math.abs(asset.width - asset.naturalWidth) < 1 && Math.abs(asset.height - asset.naturalHeight) < 1), JSON.stringify(geometry.assets));
                await page.screenshot({ path: `${output}/${name}-${width}-${theme}.png`, fullPage: true });
                // First authorization attempt returns 429 and reports error without claiming synchronization.
                await page.locator('#spotify-connect').click();
                await page.locator('#spotify-error').waitFor({ state: 'visible' });
                assert.equal(await page.evaluate(() => localStorage.getItem('sonarfy_spotify_synced')), null);
                await page.locator('#theme-toggle').click();
                assert.notEqual(await page.locator('html').getAttribute('data-theme'), theme);
                await page.locator('#spotify-skip').click();
                await page.waitForURL('**/profile.html');
                assert(Date.now() - Number(await page.evaluate(() => localStorage.getItem('sonarfy_spotify_skipped_at'))) < 5000);
                await page.goto(`${base}/pages/spotify-sync.html`);
                await page.waitForURL('**/profile.html');
                await page.goto(`${base}/pages/account.html?spotify=denied`);
                const manual = page.locator('a[href="spotify-sync.html?source=account"]');
                await manual.waitFor({ state: 'visible' });
                assert.match(await page.locator('#account-status').innerText(), /cancelada/);
                assert.equal(new URL(page.url()).searchParams.has('spotify'), false);
                await page.screenshot({ path: `${output}/${name}-${width}-${theme}-account.png`, fullPage: true });
                await manual.click();
                await page.waitForURL('**/spotify-sync.html?source=account');
                await page.locator('#spotify-connect').waitFor({ state: 'visible' });
                await page.locator('#spotify-connect').click();
                await page.waitForURL('https://accounts.spotify.com/authorize**');
                assert.equal(authCalls, 2);
                // Exercise the real module-based login script and post-login route.
                for (const state of ['first', 'synced', 'recent', 'expired']) {
                    await page.goto(`${base}/pages/login.html?redirect=https://example.com`);
                    await page.evaluate(state => {
                        localStorage.removeItem('sonarfy_spotify_synced');
                        localStorage.removeItem('sonarfy_spotify_skipped_at');
                        if (state === 'synced') localStorage.setItem('sonarfy_spotify_synced', 'true');
                        if (state === 'recent' || state === 'expired') localStorage.setItem('sonarfy_spotify_skipped_at', String(Date.now() - (state === 'expired' ? 7 * 86400000 : 1000)));
                    }, state);
                    await page.route('**/auth/login', route => route.fulfill({ json: { token: 'test-token' } }));
                    await page.locator('#loginField').fill('usuario');
                    await page.locator('#passwordField').fill('Senha@123');
                    await page.locator('#btnSubmitLogin').click();
                    await page.waitForURL(`**/${state === 'first' || state === 'expired' ? 'spotify-sync.html' : 'profile.html'}`);
                }
                assert.deepEqual(errors, []);
                results.push({ browser: name, version: browser.version(), width, theme, geometry });
                await context.close();
            }
        } finally { await browser.close(); }
    }
    fs.writeFileSync(`${output}/results.json`, JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results.map(({ geometry, ...result }) => ({ ...result, card: geometry.card, font: geometry.font })), null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
