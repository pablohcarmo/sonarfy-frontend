const { chromium, firefox } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.json': 'application/json'
};

// Serve the static workspace locally so ES modules and SVG sprites resolve over HTTP.
function startServer(root = process.cwd()) {
    const server = http.createServer((req, res) => {
        const cleanUrl = (req.url || '/').split('?')[0];
        const filePath = path.join(root, cleanUrl === '/' ? 'index.html' : cleanUrl);
        if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
            res.writeHead(404);
            res.end('Not found');
            return;
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        fs.createReadStream(filePath).pipe(res);
    });
    return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({
        server,
        baseUrl: `http://127.0.0.1:${server.address().port}`
    })));
}

(async () => {
    const output = process.env.OUTPUT_DIR || 'test-results/logout';
    fs.mkdirSync(output, { recursive: true });
    const { server, baseUrl } = await startServer();
    const results = [];

    try {
        for (const name of ['edge', 'firefox']) {
            const browser = name === 'edge'
                ? await chromium.launch({ channel: 'msedge', headless: true })
                : await firefox.launch({
                    headless: true,
                    ...(process.env.FIREFOX_EXECUTABLE_PATH ? { executablePath: process.env.FIREFOX_EXECUTABLE_PATH } : {})
                });
            try {
                for (const width of [1440, 390]) {
                    for (const theme of ['light', 'dark']) {
                        const context = await browser.newContext({
                            viewport: { width, height: width === 1440 ? 900 : 844 },
                            deviceScaleFactor: 1
                        });
                        const page = await context.newPage();
                        const errors = [];
                        page.on('pageerror', error => errors.push(error.message));

                        await page.addInitScript(selectedTheme => {
                            localStorage.setItem('sonarfy_theme', selectedTheme);
                        }, theme);

                        await page.goto(`${baseUrl}/pages/logout.html?from=profile.html`);
                        await page.evaluate(() => document.fonts.ready);

                        const metrics = await page.evaluate(() => {
                            const card = document.querySelector('.logout-card');
                            const cardRect = card.getBoundingClientRect();
                            const badgeRect = document.querySelector('.logout-badge').getBoundingClientRect();
                            const headerRect = document.querySelector('.site-header').getBoundingClientRect();
                            const images = Array.from(document.images)
                                .filter(img => getComputedStyle(img).display !== 'none' && img.getBoundingClientRect().width > 0)
                                .map(img => ({
                                    src: img.currentSrc.split('/').pop(),
                                    loaded: img.complete && img.naturalWidth > 0
                                }));
                            const brandUseLoaded = Array.from(document.querySelectorAll('.brand svg'))
                                .filter(svg => getComputedStyle(svg).display !== 'none')
                                .every(svg => svg.querySelector('use')?.getBBox().width > 0);
                            return {
                                scrollWidth: document.documentElement.scrollWidth,
                                innerWidth,
                                cardWidth: Math.round(cardRect.width),
                                badgeWidth: Math.round(badgeRect.width),
                                badgeHeight: Math.round(badgeRect.height),
                                headerHeight: Math.round(headerRect.height),
                                images,
                                brandUseLoaded
                            };
                        });

                        assert.equal(metrics.scrollWidth, width);
                        assert.equal(metrics.cardWidth, width === 1440 ? 480 : 342);
                        assert.equal(metrics.badgeWidth, 64);
                        assert.equal(metrics.badgeHeight, 64);
                        assert.equal(metrics.headerHeight, width === 1440 ? 88 : 80);
                        assert(metrics.images.length > 0 && metrics.images.every(img => img.loaded));
                        assert(metrics.brandUseLoaded);

                        // Verify keyboard focus reaches the primary CTA and secondary cancel action.
                        await page.locator('#btnConfirmLogout').focus();
                        assert.equal(await page.evaluate(() => document.activeElement.id), 'btnConfirmLogout');
                        await page.locator('#btnCancelLogout').focus();
                        assert.equal(await page.evaluate(() => document.activeElement.id), 'btnCancelLogout');

                        await page.screenshot({ path: `${output}/${name}-${width}-${theme}.png`, fullPage: true });

                        // Verify cancel returns to the validated internal origin page.
                        await page.locator('#btnCancelLogout').click();
                        await page.waitForURL('**/pages/profile.html');

                        // Return to logout page and verify confirm clears token while preserving theme.
                        await page.goto(`${baseUrl}/pages/logout.html?from=https://evil.com`);
                        await page.evaluate(() => localStorage.setItem('sonarfy_token', 'browser-demo-token'));
                        assert.equal(await page.locator('#btnCancelLogout').getAttribute('href'), 'feed.html');
                        await page.locator('#btnConfirmLogout').click();
                        await page.waitForURL('**/pages/login.html');
                        assert.equal(await page.evaluate(() => localStorage.getItem('sonarfy_token')), null);
                        assert.equal(await page.evaluate(() => localStorage.getItem('sonarfy_theme')), theme);

                        assert.deepEqual(errors, []);
                        results.push({
                            browser: name,
                            version: browser.version(),
                            width,
                            theme,
                            cardWidth: metrics.cardWidth,
                            headerHeight: metrics.headerHeight,
                            assets: metrics.images.map(i => i.src),
                            passed: true
                        });
                        await context.close();
                    }
                }
            } finally {
                await browser.close();
            }
        }
    } finally {
        server.close();
    }

    fs.writeFileSync(`${output}/results.json`, JSON.stringify(results, null, 2));
    console.log(`${results.length} logout browser combinations passed.`);
})().catch(error => {
    console.error(error);
    process.exit(1);
});
