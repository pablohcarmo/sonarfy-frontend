const { chromium, firefox } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'test-results/profile-following');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (error, bytes) => { res.writeHead(error ? 404 : 200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); res.end(error ? 'Página não encontrada' : bytes); });
});
const dto = (own, following = false, followers = 3) => ({
    identity: { id: own ? 25 : 26, handle: own ? 'own' : 'other', displayName: own ? 'Conta atual' : 'Perfil real',
        avatarUrl: null, coverUrl: null, biography: 'Bio pública', joinedAt: '2026-11-01T12:00:00Z', location: { city: 'São Paulo', country: 'Brasil' } },
    viewer: { isSelf: own, canEdit: own, isFollowing: own ? false : following }, statistics: { followers: own ? 0 : followers, following: own ? 1 : 0 }
});
(async () => {
    fs.mkdirSync(output, { recursive: true });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`, results = [];
    for (const name of ['edge', 'firefox']) {
        const browser = name === 'edge' ? await chromium.launch({ channel: 'msedge', headless: true }) : await firefox.launch({ headless: true });
        try {
            for (const width of [1440, 390]) for (const theme of ['light', 'dark']) {
                const context = await browser.newContext({ viewport: { width, height: 900 } });
                await context.addInitScript(theme => { localStorage.setItem('sonarfy_theme', theme); if (location.pathname.endsWith('/profile.html')) localStorage.setItem('sonarfy_token', 'browser-test-only'); }, theme);
                let following = false, followers = 3, mutations = 0, failRead = false, networkError = false, unavailable = false, unauthorized = false;
                let activeToken = 'browser-test-only', refreshMode = 'fail', refreshCalls = 0;
                let ownDisplayName = 'Conta atual', ownBio = 'Bio pública', ownAvatarUrl = null, failEditOnce = false, editCalls = 0, avatarCalls = 0, failAvatarOnce = false;
                const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAYAAAB/qH1jAAAAEklEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC', 'base64');
                await context.route('**/api/auth/refresh', async route => {
                    const req = route.request();
                    if (req.method() === 'OPTIONS') {
                        return route.fulfill({
                            status: 200,
                            headers: {
                                'Access-Control-Allow-Origin': base,
                                'Access-Control-Allow-Credentials': 'true',
                                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                                'Access-Control-Allow-Headers': 'X-Sonarfy-CSRF'
                            }
                        });
                    }
                    assert.equal(req.method(), 'POST');
                    assert.equal(req.headers()['x-sonarfy-csrf'], '1');
                    refreshCalls += 1;
                    const cors = { 'Access-Control-Allow-Origin': base, 'Access-Control-Allow-Credentials': 'true' };
                    if (refreshMode === 'ok') {
                        activeToken = 'browser-refreshed-token';
                        return route.fulfill({
                            status: 200,
                            contentType: 'application/json',
                            headers: cors,
                            body: JSON.stringify({ accessToken: activeToken, tokenType: 'Bearer', expiresInSeconds: 900 })
                        });
                    }
                    return route.fulfill({ status: 401, headers: cors });
                });
                await context.route('**/api/profile/**', async route => {
                    const request = route.request(), pathname = new URL(request.url()).pathname;
                    if (request.method() === 'OPTIONS') {
                        return route.fulfill({
                            status: 200,
                            headers: {
                                'Access-Control-Allow-Origin': '*',
                                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                                'Access-Control-Allow-Headers': 'Authorization, Content-Type'
                            }
                        });
                    }
                    if (networkError) return route.abort('failed');
                    const reply = (status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, ...(body ? { body: JSON.stringify(body) } : {}) });
                    if (unauthorized || request.headers().authorization !== `Bearer ${activeToken}`) return reply(401);
                    if (pathname.endsWith('/following')) {
                        mutations++; assert.equal(request.postData(), null);
                        following = request.method() === 'PUT'; followers = following ? 4 : 3;
                        await new Promise(resolve => setTimeout(resolve, 180)); return reply(204);
                    }
                    if (pathname.endsWith('/me/avatar') && request.method() === 'POST') {
                        avatarCalls += 1;
                        assert.match(request.headers()['content-type'] || '', /^multipart\/form-data; boundary=/);
                        const raw = request.postDataBuffer()?.toString('latin1') || '';
                        assert.match(raw, /name="file"/);
                        assert.match(raw, /name="cropX"/);
                        assert.match(raw, /name="cropY"/);
                        assert.match(raw, /name="cropSize"/);
                        if (failAvatarOnce) { failAvatarOnce = false; return reply(503); }
                        ownAvatarUrl = `${base}/assets/images/sonarfy-symbol.png`;
                        const updated = dto(true);
                        updated.identity.displayName = ownDisplayName;
                        updated.identity.biography = ownBio;
                        updated.identity.avatarUrl = ownAvatarUrl;
                        return reply(200, updated);
                    }
                    if (pathname.endsWith('/me') && request.method() === 'PUT') {
                        editCalls += 1;
                        if (failEditOnce) { failEditOnce = false; return reply(400); }
                        const payload = JSON.parse(request.postData() || '{}');
                        assert.equal(Object.keys(payload).sort().join(','), 'biography,displayName');
                        ownDisplayName = payload.displayName;
                        ownBio = payload.biography;
                        const updated = dto(true);
                        updated.identity.displayName = ownDisplayName;
                        updated.identity.biography = ownBio;
                        updated.identity.avatarUrl = ownAvatarUrl;
                        return reply(200, updated);
                    }
                    if (pathname.endsWith('/me')) {
                        const selfDto = dto(true);
                        selfDto.identity.displayName = ownDisplayName;
                        selfDto.identity.biography = ownBio;
                        selfDto.identity.avatarUrl = ownAvatarUrl;
                        return reply(200, selfDto);
                    }
                    if (unavailable) return reply(404);
                    if (failRead) { failRead = false; return reply(500); }
                    return reply(200, dto(false, following, followers));
                });
                const page = await context.newPage(), errors = [];
                page.on('pageerror', error => errors.push(error.message));
                await page.goto(`${base}/pages/profile.html?handle=other`);
                const button = page.locator('[data-action="follow"]'); await button.waitFor();
                assert.equal(await page.locator('#profile-demo').isVisible(), false);
                assert.equal(await page.locator('.activity-card').count(), 0);
                assert.equal((await page.locator('.profile-statistics').innerText()).replace(/\s+/g, ' '), '3 Seguidores 0 Seguindo');
                assert.equal(await page.locator('.profile-navigation [aria-current]').count(), 0);
                await button.evaluate(el => { el.click(); el.click(); });
                assert.equal(await button.isDisabled(), true);
                await page.getByRole('button', { name: 'Seguindo', exact: true }).waitFor();
                assert.equal(mutations, 1); assert.equal(await button.getAttribute('aria-pressed'), 'true');
                assert.equal((await page.locator('.profile-statistics').innerText()).replace(/\s+/g, ' '), '4 Seguidores 0 Seguindo');
                failRead = true; await button.click(); await page.getByRole('button', { name: 'Atualizar estado' }).waitFor();
                assert.equal(mutations, 2); assert.match(await page.locator('#profile-status').innerText(), /confirmar/);
                await button.click(); await page.getByRole('button', { name: 'Seguir', exact: true }).waitFor();
                assert.equal(mutations, 2); assert.equal(await button.getAttribute('aria-pressed'), 'false');
                assert.equal((await page.locator('.profile-statistics').innerText()).replace(/\s+/g, ' '), '3 Seguidores 0 Seguindo');
                assert.equal(await button.evaluate(el => el === document.activeElement), true);
                if (width === 390) {
                    await page.locator('#open-menu').click(); assert.equal(await page.locator('#profile-drawer .profile-navigation > *').count(), 7);
                    await page.keyboard.press('Escape');
                }
                assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
                await page.screenshot({ path: path.join(output, `${name}-${width}-${theme}.png`), fullPage: true });
                await page.goto(`${base}/pages/profile.html`); await page.locator('.profile-card').waitFor();
                assert.equal(await button.count(), 0); assert.equal(await page.locator('[data-action="edit"]').count(), 1);
                assert.equal(await page.locator('.profile-navigation [aria-current="page"]').innerText(), 'Perfil');
                // Edit own profile text: verify draft preserved on 400 and reconciled on 200.
                failEditOnce = true;
                await page.locator('[data-action="edit"]').click();
                await page.locator('#edit-profile-form').waitFor();
                await page.fill('#display-name', 'Conta Editada 🎵');
                await page.fill('#profile-bio', 'Nova bio integrada.');
                await page.click('#save-profile');
                await page.waitForFunction(() => document.querySelector('#profile-dialog .dialog-status')?.textContent.includes('Verifique os dados'));
                assert.equal(await page.locator('#display-name').inputValue(), 'Conta Editada 🎵');
                await page.click('#save-profile');
                await page.waitForFunction(() => !document.getElementById('profile-dialog').open);
                assert.equal(editCalls, 2);
                assert.match(await page.locator('#profile-header').innerText(), /Conta Editada 🎵/);
                assert.match(await page.locator('#profile-header').innerText(), /Nova bio integrada\./);
                // Upload avatar with circular crop preview: 503 preserves current avatar, retry 200 reconciles avatarUrl.
                failAvatarOnce = true;
                await page.locator('[data-action="edit"]').click();
                await page.locator('#edit-profile-form').waitFor();
                await page.locator('#edit-profile-form input[name="avatar"]').setInputFiles({
                    name: 'avatar.png', mimeType: 'image/png', buffer: tinyPng
                });
                await page.locator('#avatar-crop-panel').waitFor({ state: 'visible' });
                await page.locator('#avatar-zoom').fill('1.5');
                await page.locator('#avatar-zoom').dispatchEvent('input');
                await page.click('#save-profile');
                await page.waitForFunction(() => document.querySelector('#profile-dialog .dialog-status')?.textContent.includes('indisponível'));
                assert.equal(avatarCalls, 1);
                await page.click('#save-profile');
                await page.waitForFunction(() => !document.getElementById('profile-dialog').open);
                assert.equal(avatarCalls, 2);
                assert.equal(await page.locator('#profile-header .profile-avatar img').getAttribute('src'), `${base}/assets/images/sonarfy-symbol.png`);
                unavailable = true; await page.goto(`${base}/pages/profile.html?handle=missing`);
                await page.getByRole('button', { name: 'Tentar novamente' }).waitFor();
                assert.match(await page.locator('#profile-status').innerText(), /indisponível/); assert.equal(await page.locator('.profile-card').count(), 0);
                unavailable = false; await page.getByRole('button', { name: 'Tentar novamente' }).click(); await button.waitFor();
                networkError = true; await page.goto(`${base}/pages/profile.html?handle=other`);
                await page.getByRole('button', { name: 'Tentar novamente' }).waitFor();
                const networkStatus = await page.locator('#profile-status').innerText();
                assert.match(networkStatus, /Não foi possível conectar ao servidor\. Verifique sua conexão e tente novamente\./);
                assert.doesNotMatch(networkStatus, /NetworkError|Failed to fetch|TypeError/i);
                assert.equal(await page.locator('.profile-card').count(), 0);
                assert.equal(await page.locator('#profile-demo').isVisible(), false);
                networkError = false; await page.getByRole('button', { name: 'Tentar novamente' }).click(); await button.waitFor();
                assert.equal((await page.locator('#profile-status').innerText()).trim(), '');
                assert.equal(await page.locator('#profile-demo').isVisible(), false);
                assert.equal((await page.locator('.profile-statistics').innerText()).replace(/\s+/g, ' '), '3 Seguidores 0 Seguindo');
                activeToken = 'expired-before-refresh'; refreshMode = 'ok';
                await page.reload(); await button.waitFor();
                assert.equal(refreshCalls, 1);
                assert.equal(await page.evaluate(() => localStorage.getItem('sonarfy_token')), 'browser-refreshed-token');
                unauthorized = true; refreshMode = 'fail'; await page.reload(); await page.waitForURL('**/login.html');
                assert.equal(refreshCalls, 2);
                assert.equal(await page.evaluate(() => localStorage.getItem('sonarfy_token')), null);
                assert.deepEqual(errors, []); results.push({ browser: name, version: browser.version(), width, theme, passed: true });
                await context.close();
            }
        } finally { await browser.close(); }
    }
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(results, null, 2)); console.log(JSON.stringify(results));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
