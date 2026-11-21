const { chromium, firefox } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'test-results/password-flows');
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
                    if (location.pathname.endsWith('/account.html')) {
                        localStorage.setItem('sonarfy_token', 'browser-pwd-token');
                    }
                }, theme);

                let forgotCalls = 0, resetCalls = 0, changeReqCalls = 0, changePutCalls = 0;
                const cors = { 'Access-Control-Allow-Origin': '*' };
                const preflight = methods => ({
                    status: 200,
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': methods,
                        'Access-Control-Allow-Headers': 'Authorization, Content-Type'
                    }
                });

                await context.route('**/api/auth/forgot-password', async route => {
                    if (route.request().method() === 'OPTIONS') return route.fulfill(preflight('POST, OPTIONS'));
                    forgotCalls += 1;
                    await route.fulfill({ status: 200, headers: cors, body: 'If an eligible account exists...' });
                });
                await context.route('**/api/auth/reset-password', async route => {
                    if (route.request().method() === 'OPTIONS') return route.fulfill(preflight('POST, OPTIONS'));
                    resetCalls += 1;
                    const payload = JSON.parse(route.request().postData() || '{}');
                    assert.equal(payload.token, 'browser-reset-tok');
                    await route.fulfill({ status: 200, headers: cors, body: 'Password reset successfully.' });
                });
                await context.route('**/api/users/me/password-change-request', async route => {
                    if (route.request().method() === 'OPTIONS') return route.fulfill(preflight('POST, OPTIONS'));
                    assert.equal(route.request().headers().authorization, 'Bearer browser-pwd-token');
                    changeReqCalls += 1;
                    await route.fulfill({ status: 200, headers: cors, body: 'Password change authorization email sent.' });
                });
                await context.route('**/api/users/me/password', async route => {
                    if (route.request().method() === 'OPTIONS') return route.fulfill(preflight('PUT, OPTIONS'));
                    assert.equal(route.request().headers().authorization, 'Bearer browser-pwd-token');
                    changePutCalls += 1;
                    const payload = JSON.parse(route.request().postData() || '{}');
                    assert.equal(payload.token, 'browser-change-tok');
                    await route.fulfill({ status: 200, headers: cors, body: 'Password updated successfully.' });
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

                // 1. Login -> Esqueci minha senha -> forgot-password.
                await page.goto(`${base}/pages/login.html`);
                await page.click('a[href="recuperar-senha.html"]');
                await page.waitForURL('**/pages/recuperar-senha.html');
                assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
                await page.fill('#recoveryEmail', 'ana@sonarfy.com');
                await page.click('#btnForgotSubmit');
                await page.locator('#recoverySuccess').waitFor({ state: 'visible' });
                assert.equal(forgotCalls, 1);

                // 2. Public reset-password via ?token=... -> redirects to login.html?reset=true.
                await page.goto(`${base}/pages/recuperar-senha.html?token=browser-reset-tok`);
                await page.locator('#resetPasswordForm').waitFor({ state: 'visible' });
                assert.equal(new URL(page.url()).searchParams.has('token'), false);
                assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
                await page.screenshot({ path: path.join(output, `${name}-${width}-${theme}-reset.png`), fullPage: true });
                await page.fill('#newPassword', 'NovaSenha@2026');
                await page.fill('#confirmNewPassword', 'NovaSenha@2026');
                await page.click('#btnResetSubmit');
                await page.waitForURL('**/pages/login.html?reset=true');
                assert.equal(resetCalls, 1);

                // 3. Account password-change-request button + authenticated PUT via #password-change-token=...
                await page.goto(`${base}/pages/account.html`);
                await page.waitForFunction(() => document.getElementById('first-name')?.value === 'Ana');
                await page.click('#reset-password-btn');
                await page.locator('#account-dialog[open]').waitFor();
                assert.equal(changeReqCalls, 1);
                await page.click('#account-dialog [data-close]');

                await page.goto(`${base}/pages/account.html#password-change-token=browser-change-tok`);
                await page.locator('#password-change-form').waitFor({ state: 'visible' });
                assert.equal(new URL(page.url()).hash, '');
                await page.fill('#pwd-current', 'SenhaAtual@2026');
                await page.fill('#pwd-new', 'NovaSenha@2026');
                await page.fill('#pwd-confirm', 'NovaSenha@2026');
                await page.click('#account-dialog [data-confirm]');
                await page.waitForURL('**/pages/login.html?reset=true');
                assert.equal(changePutCalls, 1);
                assert.equal(await page.evaluate(() => localStorage.getItem('sonarfy_token')), null);

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
