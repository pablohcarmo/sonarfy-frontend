const { chromium, firefox } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'test-results/account');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (error, bytes) => {
        res.writeHead(error ? 404 : 200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
        res.end(error ? 'Not found' : bytes);
    });
});

// Verify zero horizontal overflow for the target viewport width.
async function noOverflow(page, width) {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, 'No horizontal overflow');
}

// Verify every visible image and external SVG sprite asset loaded cleanly.
async function loadedAssets(page) {
    await page.waitForFunction(() => [...document.images].filter(img => img.offsetParent !== null).every(img => img.complete && img.naturalWidth > 0));
    const images = await page.locator('img').evaluateAll(imgs => imgs.filter(img => img.offsetParent !== null).map(img => ({
        src: img.src,
        loaded: img.complete && img.naturalWidth > 0
    })));
    assert(images.length > 0 && images.every(img => img.loaded), 'Visible SVG/image assets must load');
    for (const href of await page.locator('svg use').evaluateAll(nodes => nodes.map(node => node.getAttribute('href').split('#')[0]))) {
        const response = await page.request.get(new URL(href, page.url()).href);
        assert(response.ok() && (await response.body()).length > 0, `SVG sprite loaded: ${href}`);
    }
    return images.length;
}

(async () => {
    fs.mkdirSync(output, { recursive: true });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const results = [];

    for (const name of ['edge', 'firefox']) {
        const browser = name === 'edge' ? await chromium.launch({ channel: 'msedge', headless: true }) : await firefox.launch({ headless: true });
        try {
            for (const width of [1440, 390]) for (const theme of ['light', 'dark']) {
                const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
                const page = await context.newPage();
                const errors = [];
                page.on('pageerror', error => errors.push(error.message));
                await page.addInitScript(t => {
                    localStorage.setItem('sonarfy_theme', t);
                    if (location.pathname.endsWith('/account.html')) {
                        localStorage.setItem('sonarfy_token', 'test-token');
                    }
                }, theme);

                const prefix = `${name}-${width}-${theme}`;
                let accountState = {
                    id: 7,
                    name: 'Ana',
                    surname: 'Ribeiro',
                    handle: 'ana_ribeiro',
                    email: 'ana@sonarfy.com',
                    city: 'São Paulo',
                    country: 'Brasil',
                    birthDate: '1999-08-15',
                    active: true
                };
                let lastPutBody = null;
                let spotifyStatus = 'CONNECTED';
                let spotifyDisconnectCalls = 0;
                await context.route('**/api/spotify/connection', async route => {
                    const req = route.request();
                    if (req.method() === 'OPTIONS') {
                        return route.fulfill({
                            status: 200,
                            headers: {
                                'Access-Control-Allow-Origin': '*',
                                'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
                                'Access-Control-Allow-Headers': 'Authorization'
                            }
                        });
                    }
                    assert.equal(req.headers().authorization, 'Bearer test-token');
                    const cors = { 'Access-Control-Allow-Origin': '*' };
                    if (req.method() === 'DELETE') {
                        spotifyDisconnectCalls += 1;
                        spotifyStatus = 'DISCONNECTED';
                        return route.fulfill({ status: 204, headers: cors });
                    }
                    return route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        headers: cors,
                        body: JSON.stringify({ status: spotifyStatus, connectedAt: spotifyStatus === 'CONNECTED' ? '2026-11-10T03:00:00Z' : null, recentListensAuthorized: spotifyStatus === 'CONNECTED' })
                    });
                });
                await context.route('**/api/locations/cities**', async route => {
                    const req = route.request();
                    assert.equal(req.headers().authorization, undefined, 'Public city search must not send Bearer');
                    const q = new URL(req.url()).searchParams.get('q') || '';
                    const list = q.toLowerCase().includes('lisb')
                        ? [{ cityId: 2267057, name: 'Lisboa', region: 'Lisboa', country: 'Portugal' }]
                        : [];
                    await route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        headers: { 'Access-Control-Allow-Origin': '*' },
                        body: JSON.stringify(list)
                    });
                });
                await context.route('**/api/users/me', async route => {
                    const req = route.request();
                    if (req.method() === 'OPTIONS') {
                        return route.fulfill({
                            status: 200,
                            headers: {
                                'Access-Control-Allow-Origin': '*',
                                'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
                                'Access-Control-Allow-Headers': 'Authorization, Content-Type'
                            }
                        });
                    }
                    assert.equal(req.headers().authorization, 'Bearer test-token');
                    const cors = { 'Access-Control-Allow-Origin': '*' };
                    if (req.method() === 'GET') {
                        return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(accountState) });
                    }
                    if (req.method() === 'PUT') {
                        lastPutBody = JSON.parse(req.postData() || '{}');
                        if (lastPutBody.handle === 'lucas_vinyl') {
                            return route.fulfill({ status: 409, headers: cors });
                        }
                        accountState = {
                            ...accountState,
                            name: lastPutBody.name,
                            surname: lastPutBody.surname,
                            handle: lastPutBody.handle.toLowerCase(),
                            birthDate: lastPutBody.birthDate,
                            ...(lastPutBody.cityId === 2267057 ? { city: 'Lisboa', country: 'Portugal' } : {})
                        };
                        return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(accountState) });
                    }
                });

                await context.route('**/api/users/me/account-deactivation-request', async route => {
                    const req = route.request();
                    if (req.method() === 'OPTIONS') {
                        return route.fulfill({
                            status: 200,
                            headers: {
                                'Access-Control-Allow-Origin': '*',
                                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                                'Access-Control-Allow-Headers': 'Authorization, Content-Type'
                            }
                        });
                    }
                    assert.equal(req.headers().authorization, 'Bearer test-token');
                    const payload = JSON.parse(req.postData() || '{}');
                    assert.equal(payload.currentPassword, 'SenhaAtual@2026');
                    return route.fulfill({
                        status: 202,
                        contentType: 'application/json',
                        headers: { 'Access-Control-Allow-Origin': '*' },
                        body: JSON.stringify({ message: 'Account deactivation request accepted for delivery.', expiresInSeconds: 900 })
                    });
                });

                await page.goto(`${base}/pages/account.html`);
                await page.waitForFunction(() => document.getElementById('first-name')?.value === 'Ana');
                await page.evaluate(() => document.fonts.ready);

                assert.equal(await page.locator('#account-demo').isVisible(), false);
                assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
                assert.equal((await page.locator('.site-header').boundingBox()).height, width === 1440 ? 88 : 80);
                assert(await page.locator('.profile-footer').evaluate(el => el === document.body.lastElementChild));
                assert.equal(await page.locator('.profile-sidebar [aria-current="page"]').textContent(), 'Configurações');
                const assets = await loadedAssets(page);
                await noOverflow(page, width);
                await page.screenshot({ path: `${output}/${prefix}-view.png`, fullPage: true });

                if (width === 390) {
                    await page.click('#open-menu');
                    await page.locator('#profile-drawer[open]').waitFor();
                    assert.equal(Math.round((await page.locator('#profile-drawer').boundingBox()).width), 296);
                    assert.equal(await page.locator('#profile-drawer [aria-current="page"]').textContent(), 'Configurações');
                    await page.screenshot({ path: `${output}/${prefix}-drawer.png` });
                    await page.keyboard.press('Escape');
                    await page.waitForFunction(() => !document.getElementById('profile-drawer').open);
                }

                // Edit mode + 409 conflict on taken handle + city autocomplete (/locations/cities) + PUT /users/me.
                await page.click('#edit-account-btn');
                assert.equal(await page.locator('#handle-input').isDisabled(), false);
                assert.equal(await page.locator('#country-input').isDisabled(), true);
                await page.fill('#handle-input', 'lucas_vinyl');
                await page.click('#save-account-btn');
                await page.locator('#handle-feedback.is-error').waitFor();

                await page.fill('#handle-input', 'ana_nova');
                await page.fill('#city-input', 'Lisboa');
                await page.locator('#city-suggestions button').first().click();
                assert.equal(await page.locator('#country-input').inputValue(), 'Portugal');
                await noOverflow(page, width);
                await page.screenshot({ path: `${output}/${prefix}-edit.png`, fullPage: true });

                await page.click('#save-account-btn');
                await page.locator('#account-dialog[open]').waitFor();
                assert((await page.locator('#account-dialog').textContent()).includes('Sucesso'));
                assert.equal(lastPutBody.cityId, 2267057);
                assert.equal(lastPutBody.handle, 'ana_nova');
                await page.click('#account-dialog [data-close]');
                await page.waitForFunction(() => !document.getElementById('account-dialog').open);

                // Verify Spotify connected state and DELETE /api/spotify/connection disconnect flow.
                await page.locator('#spotify-disconnect-btn').waitFor();
                await page.click('#spotify-disconnect-btn');
                await page.locator('#spotify-sync-link').waitFor();
                assert.equal(spotifyDisconnectCalls, 1);
                assert.match(await page.locator('#account-status').innerText(), /painel de aplicativos conectados/);

                // Deactivate modal in HTTP mode collects currentPassword, sends 202 request, and preserves sonarfy_token.
                await page.click('#deactivate-account-btn');
                await page.locator('#account-dialog[open]').waitFor();
                assert((await page.locator('#account-dialog').textContent()).includes('Desativar sua conta?'));
                await loadedAssets(page);
                await page.screenshot({ path: `${output}/${prefix}-deactivate.png` });
                await page.fill('#deactivate-password', 'SenhaAtual@2026');
                await page.click('#account-dialog [data-confirm]');
                await page.waitForFunction(() => document.querySelector('#account-dialog')?.open && document.querySelector('#account-dialog button[data-close]')?.textContent.trim() === 'OK');
                assert.equal(await page.locator('#account-dialog button').count(), 1);
                await page.click('#account-dialog [data-close]');
                await page.waitForFunction(() => !document.getElementById('account-dialog').open);
                assert.equal(await page.locator('#deactivate-account-btn').isDisabled(), true);
                assert.equal(await page.evaluate(() => localStorage.getItem('sonarfy_token')), 'test-token');

                // Delete modal in HTTP mode reports unavailability without clearing token.
                await page.click('#delete-account-btn');
                await page.locator('#account-dialog[open]').waitFor();
                assert((await page.locator('#account-dialog').textContent()).includes('Deletar conta permanentemente?'));
                await loadedAssets(page);
                await page.screenshot({ path: `${output}/${prefix}-delete.png` });
                await page.click('#account-dialog [data-confirm]');
                await page.waitForFunction(() => document.querySelector('#account-dialog .account-dialog-status')?.textContent.includes('não está disponível'));
                assert.equal(await page.evaluate(() => localStorage.getItem('sonarfy_token')), 'test-token');
                await page.keyboard.press('Escape');
                await page.waitForFunction(() => !document.getElementById('account-dialog').open);

                assert.deepEqual(errors, [], `No page errors for ${prefix}`);

                results.push({ browser: name, version: browser.version(), width, theme, assets, passed: true });
                console.log(`PASS ${prefix}`);
                await context.close();
            }
        } finally {
            await browser.close();
        }
    }

    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));
    server.close();
})().catch(error => {
    console.error(error);
    server.close();
    process.exit(1);
});
