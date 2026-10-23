const { chromium, firefox } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'test-results/profile-states');
const server = http.createServer((req, res) => {
    const file = path.resolve(root, `.${new URL(req.url, 'http://localhost').pathname}`);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };
    fs.readFile(file, (error, bytes) => { res.writeHead(error ? 404 : 200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); res.end(error ? 'Não encontrado' : bytes); });
});

// A host adapter injected only by the test exercises pending/error/success contracts.
async function installAdapter(page, { theme, mode, width }) {
    await page.addInitScript(({ theme, mode, width }) => {
        localStorage.setItem('sonarfy_theme', theme);
        let data;
        let attempt = 0;
        window.sonarfyProfileAdapter = {
            async load(handle) {
                attempt++;
                if (mode === 'error' && attempt === 1) throw new Error('Falha de conexão');
                if (mode === 'loading') await new Promise(resolve => { window.resolveProfile = resolve; });
                const { createFixtures } = await import('/js/profile-fixtures.js');
                data = createFixtures(handle);
                if (mode === 'empty') { data.collection = []; data.activities = []; data.replies = []; }
                if (mode === 'row') data.collection = data.collection.slice(0, width === 1440 ? 4 : 2);
                if (mode === 'long') {
                    data.profile.displayName = 'N'.repeat(50); data.profile.handle = 'h'.repeat(15);
                    data.profile.bio = 'Bio '.repeat(37) + 'ok'; data.profile.avatar = '/missing-avatar.png';
                    data.activities[2].review = 'a'.repeat(255);
                }
                return data;
            },
            async collection(sort) {
                if (window.failSort) throw new Error('Falha ao ordenar');
                const { sortCollection } = await import('/js/profile-utils.js'); return sortCollection(data.collection, sort);
            },
            async follow() { throw new Error('Falha ao seguir'); },
            async like() { throw new Error('Falha ao curtir'); },
            async updateProfile(values) {
                if (window.failSave) throw new Error('Falha ao salvar');
                return Object.assign(data.profile, values);
            },
            uploadPolicy: { types: ['image/png'], maxBytes: 1024 },
            async upload(file, field) {
                if (window.failUpload) throw new Error('Falha no upload');
                window.uploadedField = field; return URL.createObjectURL(file);
            }
        };
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Permissão negada'); } } });
        Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    }, { theme, mode, width });
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
                for (const mode of ['empty', 'row', 'long', 'loading', 'error']) {
                    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
                    const page = await context.newPage(); const errors = [];
                    page.on('pageerror', error => errors.push(error.message));
                    await installAdapter(page, { theme, mode, width });
                    await page.goto(`${base}/pages/profile.html?tab=collection`);
                    if (mode === 'loading') {
                        await page.waitForFunction(() => typeof window.resolveProfile === 'function');
                        assert.equal(await page.locator('#panel-collection .collection-card').count(), 8);
                        assert.equal(await page.locator('#panel-collection .profile-stars, #panel-collection img').count(), 0);
                        assert.equal(await page.locator('.skeleton').first().evaluate(el => getComputedStyle(el).animationName), 'none');
                        await page.screenshot({ path: `${output}/${name}-${width}-${theme}-loading.png`, fullPage: true });
                        await page.evaluate(() => window.resolveProfile());
                    }
                    if (mode === 'error') {
                        await page.getByText('Tentar novamente', { exact: true }).click();
                    }
                    await page.locator('.profile-card').waitFor();
                    if (mode === 'empty') {
                        assert.equal(await page.locator('#sort-trigger').count(), 0);
                        assert((await page.locator('#panel-collection').textContent()).includes('@username_123456 ainda não avaliou'));
                        assert.equal(await page.locator('.skeleton').count(), 0);
                    }
                    if (mode === 'row') assert.equal(await page.locator('.collection-card').count(), width === 1440 ? 4 : 2);
                    if (mode === 'long') {
                        assert.equal((await page.locator('h1').textContent()).length, 50);
                        assert.equal(await page.locator('.main-avatar img').count(), 0);
                        await page.locator('#tab-activities').click();
                        const like = page.locator('#panel-activities [data-like]').first(); const before = await like.textContent();
                        await like.click(); await page.getByRole('status').filter({ hasText: 'Falha ao curtir' }).waitFor();
                        assert.equal(await page.locator('#panel-activities [data-like]').first().textContent(), before);
                        await page.locator('#tab-collection').click();
                        await page.evaluate(() => { window.failSort = true; });
                        await page.locator('#sort-trigger').click(); await page.locator('[data-sort="oldest"]').click();
                        await page.getByRole('status').filter({ hasText: 'Falha ao ordenar' }).waitFor();
                        assert.equal(await page.locator('.collection-card').count(), 8);
                        assert((await page.locator('#sort-trigger').textContent()).includes('Mais recentes'));
                        await page.locator('.collection-preview[data-review$="neon-horizons"]').click();
                        assert.equal((await page.locator('.expanded-review').textContent()).length, 255);
                        await page.keyboard.press('Escape');
                    }
                    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
                    assert(await page.locator('footer').evaluate(el => el.getBoundingClientRect().bottom <= document.documentElement.scrollHeight));
                    await page.screenshot({ path: `${output}/${name}-${width}-${theme}-${mode}.png`, fullPage: true });
                    if (mode === 'row') {
                        await page.locator('[data-action="share"]').click();
                        await page.locator('#copy-profile').click();
                        await page.getByText('Não foi possível copiar.', { exact: false }).waitFor();
                        assert.equal(await page.getByText('Copiado!', { exact: true }).count(), 0);
                        await page.locator('#share-more').click();
                        await page.getByText('Selecione e copie o link', { exact: false }).waitFor();
                        await page.keyboard.press('Escape');
                        await page.locator('[data-action="edit"]').click();
                        const input = page.locator('input[name="avatar"]');
                        await input.setInputFiles({ name: 'invalido.txt', mimeType: 'text/plain', buffer: Buffer.from('x') });
                        await page.getByText('Formato ou tamanho', { exact: false }).waitFor();
                        const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j34kAAAAASUVORK5CYII=', 'base64');
                        await input.setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: png });
                        await page.locator('#display-name').fill('Alterado');
                        await page.evaluate(() => { window.failUpload = true; });
                        await page.locator('#save-profile').click(); await page.getByText('Falha no upload', { exact: true }).waitFor();
                        assert.equal(await page.locator('h1').textContent(), 'Display Name');
                        await page.evaluate(() => { window.failUpload = false; window.failSave = true; });
                        await page.locator('#save-profile').click(); await page.getByText('Falha ao salvar', { exact: true }).waitFor();
                        assert.equal(await page.evaluate(() => window.uploadedField), 'avatar');
                        await page.evaluate(() => { window.failSave = false; });
                        await page.locator('#save-profile').click(); await page.locator('#profile-dialog').waitFor({ state: 'hidden' });
                        assert.equal(await page.locator('h1').textContent(), 'Alterado');
                        await page.evaluate(() => localStorage.setItem('sonarfy_token', 'test-token'));
                        if (width === 390) await page.locator('#open-menu').click();
                        await page.locator(width === 390 ? '#profile-drawer [data-navigation="logout"]' : '#profile-sidebar [data-navigation="logout"]').click();
                        await page.waitForURL('**/pages/login.html');
                        assert.equal(await page.evaluate(() => localStorage.getItem('sonarfy_token')), null);
                    }
                    assert.deepEqual(errors, []); await context.close();
                    results.push({ browser: name, version: browser.version(), width, theme, mode });
                }
            }
        } finally { await browser.close(); }
    }
    fs.writeFileSync(`${output}/results.json`, JSON.stringify(results, null, 2)); console.log(`${results.length} cenários de estados aprovados.`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
