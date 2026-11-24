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

                    await page.addInitScript(t => {
                        localStorage.setItem('sonarfy_theme', t);
                        localStorage.setItem('sonarfy_token', 'test-jwt-token');
                    }, theme);

                    // Intercept HTTP API endpoints for integrated Album Page verification.
                    let deletedReview = false;
                    const corsHeaders = {
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
                        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                        'Access-Control-Expose-Headers': 'Retry-After'
                    };
                    await page.route('**/api/**', async route => {
                        const reqUrl = new URL(route.request().url());
                        const method = route.request().method();
                        const pathname = reqUrl.pathname;

                        if (method === 'OPTIONS') {
                            return route.fulfill({ status: 204, headers: corsHeaders, body: '' });
                        }
                        if (pathname === '/api/profile/me' && method === 'GET') {
                            return route.fulfill({
                                status: 200,
                                headers: corsHeaders,
                                contentType: 'application/json',
                                body: JSON.stringify({ identity: { id: 1, handle: 'usuario', displayName: 'Nome Sobrenome' } })
                            });
                        }
                        if (pathname === '/api/albums/4aawyAB9vmqN3uQ7FjRGTy' && method === 'GET') {
                            return route.fulfill({
                                status: 200,
                                headers: corsHeaders,
                                contentType: 'application/json',
                                body: JSON.stringify({
                                    spotifyId: '4aawyAB9vmqN3uQ7FjRGTy',
                                    name: 'Album One',
                                    coverUrl: null,
                                    artist: { spotifyId: 'artist1', name: 'Artist One' },
                                    releaseOn: '2024-05',
                                    releasePrecision: 'mes',
                                    totalTracks: 18,
                                    averageRating: deletedReview ? null : 8.25,
                                    reviewCount: deletedReview ? 0 : 2
                                })
                            });
                        }
                        if (pathname === '/api/albums/4aawyAB9vmqN3uQ7FjRGTy/reviews/me' && method === 'GET') {
                            if (deletedReview) {
                                return route.fulfill({ status: 404, headers: corsHeaders, body: '' });
                            }
                            return route.fulfill({
                                status: 200,
                                headers: corsHeaders,
                                contentType: 'application/json',
                                body: JSON.stringify({
                                    reviewId: 42,
                                    rating: 10,
                                    reviewText: 'Excelente disco para ouvir sem pular faixas.',
                                    createdAt: '2026-11-24T05:00:00Z',
                                    updatedAt: '2026-11-24T05:00:00Z'
                                })
                            });
                        }
                        if (pathname === '/api/reviews/42' && method === 'DELETE') {
                            deletedReview = true;
                            return route.fulfill({ status: 204, headers: corsHeaders, body: '' });
                        }
                        if (pathname === '/api/albums/0000000000000000000000' && method === 'GET') {
                            return route.fulfill({
                                status: 200,
                                headers: corsHeaders,
                                contentType: 'application/json',
                                body: JSON.stringify({
                                    spotifyId: '0000000000000000000000',
                                    name: 'Zero Average Album',
                                    coverUrl: null,
                                    artist: { spotifyId: 'artist2', name: 'Artist Two' },
                                    releaseOn: '2021',
                                    releasePrecision: 'ano',
                                    totalTracks: 10,
                                    averageRating: 0,
                                    reviewCount: 1
                                })
                            });
                        }
                        if (pathname === '/api/albums/0000000000000000000000/reviews/me' && method === 'GET') {
                            return route.fulfill({ status: 404, headers: corsHeaders, body: '' });
                        }
                        if (pathname === '/api/albums/4040000000000000000000' && method === 'GET') {
                            return route.fulfill({ status: 404, headers: corsHeaders, body: '' });
                        }
                        if (pathname === '/api/albums/5030000000000000000000' && method === 'GET') {
                            return route.fulfill({ status: 503, headers: { ...corsHeaders, 'Retry-After': '30' }, body: '' });
                        }
                        return route.fulfill({ status: 404, headers: corsHeaders, body: '' });
                    });

                    // 1. Integrated HTTP mode: loaded album + own review + unavailable community list + delete refresh.
                    await page.goto(`${base}/pages/album.html?albumId=4aawyAB9vmqN3uQ7FjRGTy`);
                    await page.waitForSelector('.album-my-review-card');
                    assert.equal(await page.locator('#album-demo').isHidden(), true, 'Demo banner hidden in HTTP mode');
                    assert.equal(await page.locator('.album-title').textContent(), 'Album One');
                    assert.equal(await page.locator('.album-submeta').textContent(), 'Mai 2024 · 18 faixas');
                    assert.equal(await page.locator('.album-rating-average').textContent(), '4.1');
                    assert.equal(await page.locator('[data-community-unavailable]').count(), 1);
                    const spotifyIcon = await page.locator('.album-spotify-cta img').boundingBox();
                    assert(spotifyIcon && spotifyIcon.width >= 21 && spotifyIcon.height >= 21, `Spotify icon >= 21px: ${JSON.stringify(spotifyIcon)}`);
                    assert(Math.abs(spotifyIcon.width - spotifyIcon.height) < 0.5, `Spotify icon 1:1 aspect ratio: ${JSON.stringify(spotifyIcon)}`);
                    const assets = await loadedAssets(page);
                    await noOverflow(page, width);
                    await page.screenshot({ path: path.join(output, `${name}-${width}-${theme}-http-rated.png`), fullPage: true });

                    // Expand cover modal.
                    await page.locator('[data-expand-cover]').click();
                    await page.waitForSelector('#album-cover-dialog[open]');
                    await noOverflow(page, width);
                    await page.locator('[data-close-cover]').click();
                    assert.equal(await page.locator('#album-cover-dialog[open]').count(), 0);

                    // Delete own review and verify aggregate refreshes to null/unrated.
                    await page.locator('[data-request-delete]').click();
                    await page.locator('[data-confirm-delete]').click();
                    await page.waitForSelector('.album-rating-empty-label');
                    assert.equal(await page.locator('.album-my-review-card').count(), 0);
                    assert.equal(await page.locator('.album-primary-cta').textContent(), 'Avaliar este álbum');
                    await noOverflow(page, width);

                    // 2. Zero average rating vs null + 404 own review does not fail album.
                    await page.goto(`${base}/pages/album.html?albumId=0000000000000000000000`);
                    await page.waitForSelector('.album-rating-average');
                    assert.equal(await page.locator('.album-rating-average').textContent(), '0.0');
                    assert.equal(await page.locator('.album-rating-count').textContent(), '(1 avaliação)');
                    await noOverflow(page, width);

                    // 3. 404 album not found and 503 Retry-After cooldown.
                    await page.goto(`${base}/pages/album.html?albumId=4040000000000000000000`);
                    await page.waitForSelector('.album-error-card');
                    assert.equal(await page.locator('.album-error-card h2').textContent(), 'Álbum não encontrado');
                    await noOverflow(page, width);

                    await page.goto(`${base}/pages/album.html?albumId=5030000000000000000000`);
                    await page.waitForSelector('[data-retry-album]');
                    assert.equal(await page.locator('[data-retry-album]').isDisabled(), true);
                    await noOverflow(page, width);

                    // 4. Explicit demo mode visual check & loading skeleton.
                    await page.goto(`${base}/pages/album.html?demo=true&scenario=loading`);
                    await page.waitForSelector('.album-sk-cover');
                    await noOverflow(page, width);

                    // 5. Mobile drawer check.
                    if (width === 390) {
                        await page.goto(`${base}/pages/album.html?albumId=0000000000000000000000`);
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
