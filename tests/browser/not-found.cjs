const { chromium, firefox } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'test-results/not-found');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (error, bytes) => {
        if (error) {
            fs.readFile(path.join(root, '404.html'), (err404, html404) => {
                res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(err404 ? 'Not found' : html404);
            });
            return;
        }
        res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
        res.end(bytes);
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

                    // Navigate from index to a nested nonexistent route so back navigation and root-relative assets are both verified.
                    await page.goto(`${base}/index.html`);
                    const response = await page.goto(`${base}/pages/em-construcao.html`);
                    assert.equal(response.status(), 404, 'Nonexistent route returns HTTP 404');
                    await page.waitForSelector('.not-found-card');

                    assert.equal(await page.locator('#not-found-title').textContent(), 'Página não encontrada ou em construção');
                    assert.equal(await page.locator('.not-found-pill').textContent(), 'Erro 404');
                    const cardBox = await page.locator('.not-found-card').boundingBox();
                    assert.equal(Math.round(cardBox.width), width === 1440 ? 480 : 342, 'Card matches Figma width');

                    const assets = await loadedAssets(page);
                    await noOverflow(page, width);
                    await page.screenshot({ path: path.join(output, `${name}-${width}-${theme}.png`), fullPage: true });

                    // Verify primary back button returns to index.html.
                    await page.locator('#btnGoBack').click();
                    await page.waitForURL(/\/index\.html$/);

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
