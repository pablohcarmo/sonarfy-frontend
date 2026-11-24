const { chromium, firefox } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'test-results/album');
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

async function noOverflow(page, width) {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, 'No horizontal overflow');
}

async function loadedAssets(page) {
    await page.waitForFunction(() => [...document.images].every(img => img.complete && img.naturalWidth > 0));
    const images = await page.locator('img').evaluateAll(imgs => imgs.map(img => ({
        src: img.src,
        loaded: img.complete && img.naturalWidth > 0
    })));
    assert(images.every(img => img.loaded), 'All img assets loaded');
    for (const href of await page.locator('svg use').evaluateAll(nodes => nodes.map(node => node.getAttribute('href').split('#')[0]))) {
        const response = await page.request.get(new URL(href, page.url()).href);
        assert(response.ok(), `SVG sprite ${href} ok`);
        assert((await response.body()).length > 0, `SVG sprite ${href} non-empty`);
    }
    return images;
}

(async () => {
    fs.mkdirSync(output, { recursive: true });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const results = [];

    for (const name of ['edge', 'firefox']) {
        const browser = name === 'edge'
            ? await chromium.launch({ channel: 'msedge', headless: true })
            : await firefox.launch({ headless: true });
        try {
            for (const width of [1440, 390]) {
                for (const theme of ['light', 'dark']) {
                    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
                    const page = await context.newPage();
                    const errors = [];
                    page.on('pageerror', error => errors.push(error.message));

                    await page.addInitScript(t => localStorage.setItem('sonarfy_theme', t), theme);

                    // 1. Rated state + sort + expanded cover modal.
                    await page.goto(`${base}/pages/album.html?demo=true&scenario=rated`);
                    await page.waitForSelector('.album-hero-card');
                    assert.equal(await page.locator('.album-title').textContent(), 'Neon Horizons');
                    const spotifyIcon = await page.locator('.album-spotify-cta img').boundingBox();
                    assert(spotifyIcon && spotifyIcon.width >= 21 && spotifyIcon.height >= 21, `Spotify icon >= 21px: ${JSON.stringify(spotifyIcon)}`);
                    assert(Math.abs(spotifyIcon.width - spotifyIcon.height) < 0.5, `Spotify icon 1:1 aspect ratio: ${JSON.stringify(spotifyIcon)}`);
                    const assets = await loadedAssets(page);
                    await noOverflow(page, width);
                    await page.screenshot({ path: path.join(output, `${name}-${width}-${theme}-rated.png`), fullPage: true });

                    await page.locator('[data-expand-cover]').click();
                    await page.waitForSelector('#album-cover-dialog[open]');
                    await noOverflow(page, width);
                    await page.screenshot({ path: path.join(output, `${name}-${width}-${theme}-cover.png`), fullPage: false });
                    await page.locator('[data-close-cover]').click();
                    assert.equal(await page.locator('#album-cover-dialog[open]').count(), 0);

                    // 2. Already-rated state.
                    await page.goto(`${base}/pages/album.html?demo=true&scenario=already-rated`);
                    await page.waitForSelector('.album-my-review-card');
                    await loadedAssets(page);
                    await noOverflow(page, width);
                    await page.screenshot({ path: path.join(output, `${name}-${width}-${theme}-already-rated.png`), fullPage: true });

                    // 3. Empty state.
                    await page.goto(`${base}/pages/album.html?demo=true&scenario=empty`);
                    await page.waitForSelector('.album-empty-card');
                    await noOverflow(page, width);

                    // 4. Loading skeleton state.
                    await page.goto(`${base}/pages/album.html?demo=true&scenario=loading`);
                    await page.waitForSelector('.album-sk-cover');
                    await noOverflow(page, width);

                    // 5. Mobile drawer check.
                    if (width === 390) {
                        await page.goto(`${base}/pages/album.html?demo=true&scenario=rated`);
                        await page.waitForSelector('.album-hero-card');
                        await page.locator('#open-menu').click();
                        await page.waitForSelector('#profile-drawer[open]');
                        assert.equal(await page.locator('#profile-drawer').evaluate(el => getComputedStyle(el).width), '296px');
                        await page.keyboard.press('Escape');
                        assert.equal(await page.locator('#profile-drawer[open]').count(), 0);
                    }

                    assert.deepEqual(errors, [], `${name} ${width} ${theme} page errors: ${errors.join('; ')}`);
                    results.push({ browser: name, version: browser.version(), width, theme, assetsCount: assets.length, errors });
                    await context.close();
                }
            }
        } finally {
            await browser.close();
        }
    }

    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(results, null, 2));
    server.close();
    console.log(`Verified ${results.length} browser matrices in ${output}`);
})().catch(error => {
    console.error(error);
    server.close();
    process.exit(1);
});
