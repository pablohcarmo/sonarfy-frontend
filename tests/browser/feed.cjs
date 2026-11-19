const { chromium, firefox } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'test-results/feed');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (error, bytes) => { res.writeHead(error ? 404 : 200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); res.end(error ? 'Not found' : bytes); });
});
async function noOverflow(page, width) {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, 'No horizontal overflow');
}
async function loadedAssets(page) {
    await page.waitForFunction(() => [...document.images].every(img => img.complete && img.naturalWidth > 0));
    const images = await page.locator('img').evaluateAll(images => images.map(img => ({ src: img.src, width: img.getBoundingClientRect().width, height: img.getBoundingClientRect().height, loaded: img.complete && img.naturalWidth > 0 })));
    assert(images.every(img => img.loaded));
    // External SVG sprite assets are not HTMLImageElements: check their network body too.
    for (const href of await page.locator('svg use').evaluateAll(nodes => nodes.map(node => node.getAttribute('href').split('#')[0]))) {
        const response = await page.request.get(new URL(href, page.url()).href); assert(response.ok()); assert((await response.body()).length > 0);
    }
    return images;
}
async function visibleFocus(page) {
    const focus = await page.evaluate(() => { const el = document.activeElement; const css = getComputedStyle(el); return { visible: el.matches(':focus-visible'), style: css.outlineStyle, width: parseFloat(css.outlineWidth) }; });
    assert(focus.visible && focus.style !== 'none' && focus.width >= 2, JSON.stringify(focus));
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
                const page = await context.newPage(); const errors = [];
                page.on('pageerror', error => errors.push(error.message));
                await page.addInitScript(theme => {
                    localStorage.setItem('sonarfy_theme', theme);
                    const scenario = new URL(location.href).searchParams.get('scenario');
                    if (!scenario) return;
                    let failed = false;
                    window.sonarfyFeedAdapter = {
                        async load(tab) {
                            const { createFeedFixtures } = await import('/js/feed-fixtures.js');
                            const data = createFeedFixtures();
                            if (scenario === 'loading') await new Promise(resolve => { window.releaseFeed = resolve; });
                            if (scenario === 'empty' && tab === 'following') data.followingCount = 0;
                            if (scenario === 'long') data.publications[0].review = '𝄞'.repeat(255);
                            if (scenario === 'retry' && !failed) { failed = true; throw new Error('Falha de conexão de teste'); }
                            return data;
                        },
                        async like() { throw new Error('Falha de curtida de teste'); }
                    };
                }, theme);
                const prefix = `${name}-${width}-${theme}`;
                const url = `${base}/pages/feed.html`;
                await page.goto(url); await page.locator('.activity-author').first().waitFor(); await page.evaluate(() => document.fonts.ready);
                assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
                assert.equal(await page.locator('.activity-card').count(), 4);
                assert.equal((await page.locator('.site-header').boundingBox()).height, width === 1440 ? 88 : 80);
                const card = await page.locator('.activity-card').first().boundingBox(); assert.equal(card.width, width === 1440 ? 1080 : 358);
                assert.equal(await page.locator('.profile-sidebar [aria-current="page"]').textContent(), 'Home');
                assert.equal(await page.locator('.profile-sidebar .profile-navigation > *').count(), 7);
                assert(await page.locator('.profile-footer').evaluate(el => el === document.body.lastElementChild && el.getBoundingClientRect().top >= document.querySelector('.activity-feed').getBoundingClientRect().bottom));
                const assets = await loadedAssets(page); await noOverflow(page, width);
                const geometry = await page.locator('.activity-card').first().evaluate(el => {
                    const avatar = el.querySelector('.activity-avatar').getBoundingClientRect(); const album = el.querySelector('.album-cover').getBoundingClientRect();
                    const stars = el.querySelector('.profile-stars').getBoundingClientRect(); const social = el.querySelector('.activity-social').getBoundingClientRect();
                    return { avatar: avatar.width, album: album.width, aligned: stars.left === social.left, gap: getComputedStyle(el.parentElement).gap };
                });
                assert.deepEqual(geometry, { avatar: width === 1440 ? 48 : 44, album: width === 1440 ? 112 : 84, aligned: true, gap: '16px' });
                await page.screenshot({ path: `${output}/${prefix}-feed.png`, fullPage: true });
                await page.keyboard.press('Tab'); await visibleFocus(page);
                await page.locator('#tab-following').focus(); await page.keyboard.press('ArrowRight');
                await page.waitForFunction(() => document.querySelector('#panel-for-you .activity-card'));
                assert.equal(new URL(page.url()).searchParams.get('tab'), 'for-you'); await visibleFocus(page);
                const firstId = await page.locator('#panel-for-you [data-like]').first().getAttribute('data-like');
                const like = page.locator(`#panel-for-you [data-like="${firstId}"]`);
                const before = await like.textContent(); await like.click();
                await page.waitForFunction(id => !document.querySelector(`#panel-for-you [data-like="${id}"]`).disabled, firstId);
                const after = await like.textContent(); assert.notEqual(after, before);
                await page.locator('#tab-following').click();
                assert.equal(await page.locator(`#panel-following [data-like="${firstId}"]`).textContent(), after);
                await page.goBack(); assert.equal(await page.locator('#tab-for-you').getAttribute('aria-selected'), 'true');
                await page.locator('#theme-toggle').click(); assert.equal(await page.locator('html').getAttribute('data-theme'), theme === 'light' ? 'dark' : 'light'); await page.locator('#theme-toggle').click();
                await page.locator('#tab-following').click();
                const links = await page.locator('#panel-following .activity-card').nth(1).locator('a').evaluateAll(links => links.map(a => a.href));
                assert.equal(links.length, 3); assert(links.every(href => href === `${base}/pages/profile.html?handle=lucas_vinyl`));
                await page.locator('#panel-following .activity-avatar-link').nth(1).click(); await page.waitForURL('**/profile.html?handle=lucas_vinyl');
                await page.locator('.profile-card').waitFor();
                assert.equal(await page.locator('.profile-sidebar .profile-navigation a').first().getAttribute('href'), 'feed.html');
                if (width === 390) { await page.locator('#open-menu').click(); await page.locator('#profile-drawer .profile-navigation a').first().click(); }
                else await page.locator('.profile-sidebar .profile-navigation a').first().click();
                await page.waitForURL('**/feed.html**'); await page.locator('.activity-author').first().waitFor();
                if (width === 390) {
                    await page.locator('#open-menu').click(); const drawer = page.locator('#profile-drawer');
                    assert.equal((await drawer.boundingBox()).width, 296); assert.equal((await drawer.boundingBox()).height, 900);
                    assert.equal(await drawer.locator('[aria-current="page"]').textContent(), 'Home');
                    for (let i = 0; i < 14; i++) { await page.keyboard.press('Tab'); assert(await drawer.evaluate(el => el.contains(document.activeElement))); }
                    await visibleFocus(page); await loadedAssets(page); await page.screenshot({ path: `${output}/${prefix}-drawer.png` });
                    await page.keyboard.press('Escape'); assert(await page.locator('#open-menu').evaluate(el => el === document.activeElement));
                }
                for (const scenario of ['loading', 'empty', 'long', 'retry']) {
                    await page.goto(`${url}?scenario=${scenario}`);
                    if (scenario === 'loading') {
                        await page.locator('.skeleton').first().waitFor();
                        assert.equal(await page.locator('#panel-following').getAttribute('aria-busy'), 'true');
                        assert.equal(await page.locator('.skeleton').first().evaluate(el => getComputedStyle(el).animationName), 'none');
                        await noOverflow(page, width); await page.screenshot({ path: `${output}/${prefix}-loading.png`, fullPage: true });
                        await page.waitForFunction(() => Boolean(window.releaseFeed)); await page.evaluate(() => window.releaseFeed());
                        await page.locator('.activity-author').first().waitFor();
                    } else if (scenario === 'empty') {
                        await page.locator('.feed-empty').waitFor(); assert.equal(await page.locator('#quick-review').isVisible(), false);
                        await page.screenshot({ path: `${output}/${prefix}-empty.png`, fullPage: true });
                        await page.locator('[data-explore]').click(); await page.locator('.activity-author').first().waitFor();
                        assert.equal(new URL(page.url()).searchParams.get('tab'), 'for-you');
                    } else if (scenario === 'retry') {
                        await page.locator('[data-retry]').click(); await page.locator('.activity-author').first().waitFor();
                        const like = page.locator('[data-like]').first(); const before = await like.textContent(); await like.click();
                        await page.locator('#feed-status').filter({ hasText: 'Falha de curtida' }).waitFor(); assert.equal(await like.textContent(), before); assert.equal(await like.isDisabled(), false);
                    } else {
                        await page.locator('.activity-author').first().waitFor();
                        assert.equal(await page.locator('.activity-review').first().evaluate(el => Array.from(el.textContent).length), 255);
                        await page.screenshot({ path: `${output}/${prefix}-long.png`, fullPage: true });
                    }
                    await noOverflow(page, width);
                }
                await page.evaluate(() => localStorage.setItem('sonarfy_token', 'browser-demo'));
                if (width === 390) await page.locator('#open-menu').click();
                await page.locator(`${width === 390 ? '#profile-drawer' : '#profile-sidebar'} [data-navigation="logout"]`).click();
                await page.waitForURL('**/login.html'); assert.equal(await page.evaluate(() => localStorage.getItem('sonarfy_token')), null);
                assert.deepEqual(errors, []);
                results.push({ browser: name, version: browser.version(), width, theme, scenarios: ['demo', 'loading', 'empty', 'long', 'retry', 'logout'], assets: assets.length, passed: true });
                await context.close(); console.log(`PASS ${prefix}`);
            }
        } finally { await browser.close(); }
    }
    fs.writeFileSync(`${output}/results.json`, JSON.stringify(results, null, 2)); console.log(JSON.stringify(results, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());

