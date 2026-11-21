const { chromium, firefox } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'test-results/email-change');
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
                await page.addInitScript(t => {
                    localStorage.setItem('sonarfy_theme', t);
                    if (location.pathname.endsWith('/account.html') || location.pathname.endsWith('/confirm-email-change.html')) {
                        localStorage.setItem('sonarfy_token', 'browser-email-token');
                    }
                }, theme);

                let reqCalls = 0, confirmCalls = 0;
                const cors = { 'Access-Control-Allow-Origin': '*' };
                const preflight = methods => ({
                    status: 200,
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': methods,
                        'Access-Control-Allow-Headers': 'Authorization, Content-Type'
                    }
                });

                await context.route('**/api/users/me', async route => {
                    if (route.request().method() === 'OPTIONS') return route.fulfill(preflight('GET, OPTIONS'));
                    await route.fulfill({
                        status: 200, contentType: 'application/json', headers: cors,
                        body: JSON.stringify({ id: 1, name: 'Ana', surname: 'Ribeiro', handle: 'ana', email: 'ana@sonarfy.com', city: 'SP', country: 'BR', birthDate: '1999-08-15', active: true })
                    });
                });
                await context.route('**/api/spotify/connection', async route => {
                    await route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ status: 'DISCONNECTED', connectedAt: null }) });
                });
                await context.route('**/api/users/me/email-change-request', async route => {
                    if (route.request().method() === 'OPTIONS') return route.fulfill(preflight('POST, OPTIONS'));
                    assert.equal(route.request().headers().authorization, 'Bearer browser-email-token');
                    reqCalls += 1;
                    const payload = JSON.parse(route.request().postData() || '{}');
                    if (payload.newEmail === 'ocupado@sonarfy.com') {
                        return route.fulfill({ status: 409, headers: cors });
                    }
                    await route.fulfill({
                        status: 202, contentType: 'application/json', headers: cors,
                        body: JSON.stringify({ message: 'Email change request accepted for delivery.', expiresInSeconds: 900 })
                    });
                });
                await context.route('**/api/auth/email-change-confirmation', async route => {
                    if (route.request().method() === 'OPTIONS') return route.fulfill(preflight('POST, OPTIONS'));
                    assert.equal(route.request().headers().authorization, undefined);
                    confirmCalls += 1;
                    const payload = JSON.parse(route.request().postData() || '{}');
                    assert.equal(payload.token, 'browser-confirm-tok');
                    await route.fulfill({
                        status: 200, contentType: 'application/json', headers: cors,
                        body: JSON.stringify({ message: 'Email changed successfully. Please log in again.', requiresLogin: true })
                    });
                });

                // 1. Account modal: 409 shows accessible error, then 202 closes modal and starts cooldown.
                await page.goto(`${base}/pages/account.html`);
                await page.waitForFunction(() => document.getElementById('first-name')?.value === 'Ana');
                await page.click('#change-email-btn');
                await page.locator('#email-change-form').waitFor({ state: 'visible' });
                await page.fill('#email-change-new', 'ocupado@sonarfy.com');
                await page.fill('#email-change-password', 'SenhaAtual@2026');
                await page.click('#account-dialog [data-confirm]');
                await page.waitForFunction(() => document.querySelector('#account-dialog .account-dialog-status')?.textContent.includes('já está em uso'));

                await page.fill('#email-change-new', 'novo.ana@sonarfy.com');
                await page.click('#account-dialog [data-confirm]');
                await page.waitForFunction(() => !document.getElementById('account-dialog').open);
                assert.equal(reqCalls, 2);
                assert.equal(await page.locator('#change-email-btn').isDisabled(), true);

                // 2. Public confirm-email-change.html#token=... -> explicit confirmation -> clears sonarfy_token.
                await page.goto(`${base}/pages/confirm-email-change.html#token=browser-confirm-tok`);
                await page.locator('#confirm-state').waitFor({ state: 'visible' });
                assert.equal(new URL(page.url()).hash, '');
                assert.equal(confirmCalls, 0);
                assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
                await page.screenshot({ path: path.join(output, `${name}-${width}-${theme}-confirm.png`), fullPage: true });
                await page.click('#btnConfirmEmailChange');
                await page.locator('#success-state').waitFor({ state: 'visible' });
                assert.equal(confirmCalls, 1);
                assert.equal(await page.evaluate(() => localStorage.getItem('sonarfy_token')), null);
                assert.equal(await page.evaluate(() => localStorage.getItem('sonarfy_theme')), theme);

                assert.deepEqual(errors, []);
                results.push({ browser: name, version: browser.version(), width, theme, passed: true });
                await context.close();
            }
        } finally {
            await browser.close();
        }
    }

    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results));
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
}).finally(() => server.close());
