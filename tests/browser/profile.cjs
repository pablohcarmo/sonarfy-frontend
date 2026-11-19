const { chromium, firefox } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'test-results/profile');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (error, bytes) => { res.writeHead(error ? 404 : 200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); res.end(error ? 'Página não encontrada' : bytes); });
});
async function noOverflow(page, width) {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, 'Sem overflow horizontal');
}
async function focusContained(page, dialog) {
    for (let i = 0; i < 12; i++) { await page.keyboard.press('Tab'); assert(await dialog.evaluate(el => el.contains(document.activeElement))); }
}
(async () => {
    fs.mkdirSync(output, { recursive: true });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const results = [];
    for (const name of ['edge', 'firefox']) {
        const browser = name === 'edge' ? await chromium.launch({ channel: 'msedge', headless: true }) : await firefox.launch({ headless: true });
        try {
            for (const width of [1440, 390]) for (const theme of ['light', 'dark']) for (const friend of [false, true]) {
                const context = await browser.newContext({ viewport: { width, height: 900 } });
                const page = await context.newPage(); const errors = [];
                page.on('pageerror', error => errors.push(error.message));
                await page.addInitScript(theme => {
                    localStorage.setItem('sonarfy_theme', theme);
                    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.copiedURL = text; } } });
                }, theme);
                const prefix = `${name}-${width}-${theme}-${friend ? 'friend' : 'own'}`;
                const url = `${base}/pages/profile.html${friend ? '?handle=lucas_vinyl' : ''}`;
                await page.goto(url);
                await page.locator('.profile-card').waitFor(); await page.evaluate(() => document.fonts.ready);
                assert.equal(await page.locator('h1').textContent(), friend ? 'Lucas Andrade' : 'Display Name');
                assert.equal(await page.locator('[data-action="edit"]').count(), friend ? 0 : 1);
                assert.equal(await page.locator('.profile-sidebar [aria-current]').count(), friend ? 0 : 1);
                const avatar = await page.locator('.main-avatar').boundingBox(); assert.equal(avatar.width, width === 1440 ? 120 : 96); assert.equal(avatar.height, avatar.width);
                const small = await page.locator('.activity-avatar').first().boundingBox(); assert.equal(small.width, width === 1440 ? 48 : 44);
                await noOverflow(page, width);
                assert(await page.locator('.profile-footer').evaluate(el => el.getBoundingClientRect().top >= document.querySelector('.activity-feed').getBoundingClientRect().bottom));
                const assets = await page.locator('img').evaluateAll(imgs => imgs.filter(img => img.getBoundingClientRect().width > 0).map(img => ({ src: img.src, loaded: img.complete && img.naturalWidth > 0 })));
                assert(assets.every(asset => asset.loaded), JSON.stringify(assets));
                await page.screenshot({ path: `${output}/${prefix}-activities.png`, fullPage: true });
                const like = page.locator('#panel-activities [data-like]').first();
                const before = await like.textContent(); await like.click();
                await page.waitForFunction(() => !document.querySelector('#panel-activities [data-like]').disabled);
                assert.notEqual(await page.locator('#panel-activities [data-like]').first().textContent(), before);
                if (friend) {
                    await page.locator('[data-action="follow"]').click();
                    await page.waitForFunction(() => document.querySelector('[data-action="follow"]').textContent === 'Seguindo');
                    await page.locator('#theme-toggle').click();
                    assert.equal(await page.locator('[data-action="follow"]').textContent(), 'Seguindo');
                    await page.locator('#theme-toggle').click();
                }
                await page.locator('#tab-activities').focus(); await page.keyboard.press('ArrowRight');
                assert.equal(await page.locator('#tab-replies').getAttribute('aria-selected'), 'true');
                assert.equal(await page.locator('#panel-replies .profile-stars').count(), 0);
                assert((await page.locator('#panel-replies .activity-author > a').allTextContents()).every(text => text === (friend ? 'Lucas Andrade' : 'Display Name')));
                await page.screenshot({ path: `${output}/${prefix}-replies.png`, fullPage: true });
                await page.locator('#tab-collection').click(); assert.equal(await page.locator('.collection-card').count(), 8);
                const columns = await page.locator('.collection-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length); assert.equal(columns, width === 1440 ? 4 : 2);
                await page.locator('#sort-trigger').click(); await page.locator('[data-sort="highest"]').click();
                await page.waitForFunction(() => document.querySelector('#sort-trigger').textContent.includes('Maior avaliação'));
                assert.match(await page.locator('.collection-card .profile-stars').first().getAttribute('aria-label'), /^5/);
                await page.screenshot({ path: `${output}/${prefix}-collection.png`, fullPage: true });
                await page.locator('.collection-preview:not(.no-review)').first().click();
                const dialog = page.locator('#profile-dialog'); assert(await dialog.isVisible());
                assert.equal(await dialog.locator('footer').count(), 0); await focusContained(page, dialog);
                assert((await dialog.locator('.expanded-review').textContent()).length > 0);
                await page.screenshot({ path: `${output}/${prefix}-review.png` });
                await page.keyboard.press('Escape'); assert.equal(await dialog.isVisible(), false);
                await page.locator('[data-action="share"]').click();
                assert.equal((await dialog.locator('.share-avatar').boundingBox()).width, 60);
                assert((await dialog.locator('.share-preview').textContent()).includes(friend ? 'Lucas Andrade' : 'Display Name'));
                await dialog.locator('#copy-profile').click(); await page.waitForFunction(() => document.querySelector('#copy-profile').textContent.includes('Copiado!'));
                assert.equal(await page.evaluate(() => window.copiedURL), `${base}/pages/profile.html?handle=${friend ? 'lucas_vinyl' : 'username_123456'}`);
                await page.screenshot({ path: `${output}/${prefix}-share.png` });
                await page.keyboard.press('Escape');
                assert.equal(await page.locator('[data-action="share"]').evaluate(el => el === document.activeElement), true);
                if (!friend) {
                    await page.locator('[data-action="edit"]').click();
                    assert.equal((await dialog.locator('.edit-avatar').boundingBox()).width, 96);
                    await dialog.locator('#display-name').fill('Nome público atualizado');
                    await dialog.locator('#profile-bio').fill('Bio atualizada');
                    assert.equal(await dialog.locator('#bio-count').textContent(), '14 / 150');
                    await page.screenshot({ path: `${output}/${prefix}-edit.png` });
                    await dialog.locator('[data-close]').first().click();
                    assert.equal(await page.locator('h1').textContent(), 'Display Name');
                    await page.locator('[data-action="edit"]').click();
                    await dialog.locator('#display-name').fill('Nome público atualizado');
                    await dialog.locator('#save-profile').click(); await dialog.waitFor({ state: 'hidden' });
                    assert.equal(await page.locator('h1').textContent(), 'Nome público atualizado');
                    await page.locator('[data-action="share"]').click();
                    assert((await dialog.locator('.share-preview').textContent()).includes('Nome público atualizado'));
                    await page.keyboard.press('Escape');
                }
                if (width === 390) {
                    await page.locator('#open-menu').click(); const drawer = page.locator('#profile-drawer');
                    assert.equal((await drawer.boundingBox()).width, 296); assert.equal(await drawer.locator('.profile-navigation > *').count(), 7);
                    await focusContained(page, drawer); await page.screenshot({ path: `${output}/${prefix}-drawer.png` });
                    await page.keyboard.press('Escape'); assert.equal(await page.locator('#open-menu').evaluate(el => el === document.activeElement), true);
                }
                await noOverflow(page, width); assert.deepEqual(errors, []);
                results.push({ browser: name, version: browser.version(), width, theme, profile: friend ? 'friend' : 'own', assets: assets.length });
                await context.close();
            }
        } finally { await browser.close(); }
    }
    fs.writeFileSync(`${output}/results.json`, JSON.stringify(results, null, 2)); console.log(JSON.stringify(results, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
