const { chromium, firefox } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'test-results/album-review');
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
        width: img.getBoundingClientRect().width,
        height: img.getBoundingClientRect().height,
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

async function visibleFocus(page) {
    const focus = await page.evaluate(() => {
        const el = document.activeElement;
        const css = getComputedStyle(el);
        return { visible: el.matches(':focus-visible'), style: css.outlineStyle, width: parseFloat(css.outlineWidth) };
    });
    assert(focus.visible && focus.style !== 'none' && focus.width >= 2, JSON.stringify(focus));
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
                    await page.goto(`${base}/pages/album-review.html?demo=true`);
                    await page.waitForSelector('.album-review-card');

                    assert.equal(await page.locator('.album-summary-name').textContent(), 'Neon Horizons');
                    assert.equal(await page.locator('.rating-badge').textContent(), '4,5');
                    const assets = await loadedAssets(page);
                    await noOverflow(page, width);

                    // Verify half-star click, keyboard focus-visible, and arrow navigation.
                    await page.locator('.star-hit[data-rating-value="3.5"]').click();
                    assert.equal(await page.locator('.rating-badge').textContent(), '3,5');

                    await page.keyboard.press('Tab');
                    await page.keyboard.press('Shift+Tab');
                    await visibleFocus(page);

                    await page.keyboard.press('ArrowRight');
                    assert.equal(await page.locator('.rating-badge').textContent(), '4,0');

                    await page.screenshot({ path: path.join(output, `${name}-${width}-${theme}-form.png`), fullPage: true });

                    // Publish and verify modal + favorite toggle.
                    await page.locator('[data-review-submit]').click();
                    await page.waitForSelector('#review-success-dialog[open]');
                    await loadedAssets(page);
                    await noOverflow(page, width);

                    const favBtn = page.locator('[data-toggle-favorite]');
                    assert.equal(await favBtn.textContent(), 'Favoritar álbum');
                    await favBtn.click();
                    assert.equal(await favBtn.textContent(), 'Desfavoritar álbum');
                    assert.equal(await favBtn.getAttribute('aria-pressed'), 'true');

                    await page.screenshot({ path: path.join(output, `${name}-${width}-${theme}-published.png`), fullPage: true });
                    await page.getByRole('button', { name: 'Fechar confirmação' }).click();
                    await page.waitForURL(/\/pages\/feed\.html\?demo=true/);
                    assert.equal(await page.locator('#review-success-dialog[open]').count(), 0);
                    assert.equal(await page.locator('body.profile-modal-open').count(), 0);
                    await page.goto(`${base}/pages/album-review.html?demo=true`);
                    await page.locator('[data-review-submit]').click();
                    await page.locator('#review-success-dialog[open]').waitFor();
                    await page.keyboard.press('Escape');
                    await page.waitForFunction(() => !document.querySelector('#review-success-dialog').open);
                    assert(await page.locator('[data-review-submit]').evaluate(el => el === document.activeElement));
                    await page.locator('[data-review-submit]').click();
                    await page.locator('#review-success-dialog[open]').waitFor();
                    await page.locator('[data-success-another]').click();
                    await page.waitForURL(/\/pages\/album-review\.html\?demo=true/);
                    await page.waitForSelector('.album-review-card');

                    if (width === 390) {
                        await page.locator('#open-menu').click();
                        await page.waitForSelector('#profile-drawer[open]');
                        assert.equal(await page.locator('#profile-drawer').evaluate(el => getComputedStyle(el).width), '296px');
                        await page.keyboard.press('Escape');
                        assert.equal(await page.locator('#profile-drawer[open]').count(), 0);
                    }

                    // Exercise real HTTP adapters with simulated backend contracts and no Spotify personal connection.
                    const albumId = '4aawyAB9vmqN3uQ7FjRGTy';
                    const album = { spotifyId: albumId, name: 'Random Access Memories', artist: { name: 'Daft Punk' }, coverUrl: null, releaseOn: '2013', totalTracks: 13 };
                    const calls = [];
                    let searchFailure = true, detailFailure = true, exists = false, created = false;
                    const review = { reviewId: 42, album, rating: 8.5, reviewText: 'Minha avaliação anterior' };
                    await page.route('http://localhost:8080/api/**', async route => {
                        const request = route.request(), url = new URL(request.url());
                        const headers = { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-expose-headers': 'Retry-After', 'access-control-allow-headers': 'Authorization, Content-Type', 'access-control-allow-methods': 'GET, POST, PUT, OPTIONS' };
                        const reply = (status, body = {}, extras = {}) => route.fulfill({ status, headers: { ...headers, ...extras }, body: JSON.stringify(body) });
                        if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
                        calls.push(`${request.method()} ${url.pathname}`);
                        assert.equal(request.headers().authorization, 'Bearer test-token');
                        if (url.pathname === '/api/profile/me') return reply(200, { identity: { id: 1, handle: 'teste', displayName: 'Teste' }, viewer: { isSelf: true }, statistics: {} });
                        if (url.pathname === '/api/feed') return reply(200, { items: [], followingCount: 0, nextCursor: null });
                        if (url.pathname === '/api/albums/search') {
                            if (url.searchParams.get('q') === 'Vazio') return reply(200, { items: [], nextOffset: null });
                            if (searchFailure) { searchFailure = false; return reply(503, {}, { 'Retry-After': '30' }); }
                            const more = url.searchParams.get('offset') === '10';
                            return reply(200, { items: [more ? { ...album, spotifyId: '0'.repeat(22), name: 'Outro álbum' } : album], nextOffset: more ? null : 10 });
                        }
                        if (url.pathname === `/api/albums/${albumId}`) {
                            if (detailFailure) { detailFailure = false; return reply(503); }
                            return reply(200, album);
                        }
                        if (url.pathname.endsWith('/reviews/me')) return reply(exists ? 200 : 404, exists ? review : {});
                        if (request.method() === 'POST' && url.pathname.endsWith('/reviews')) {
                            exists = true;
                            if (!created) { created = true; return reply(201, { ...review, ...request.postDataJSON() }); }
                            return reply(409);
                        }
                        if (request.method() === 'PUT' && url.pathname === '/api/reviews/42') {
                            assert.deepEqual(request.postDataJSON(), { rating: 9, reviewText: 'Minha avaliação atualizada' });
                            return reply(200, { ...review, ...request.postDataJSON() });
                        }
                        throw new Error(`Unexpected API request: ${request.method()} ${url.pathname}`);
                    });
                    await page.evaluate(() => localStorage.setItem('sonarfy_token', 'test-token'));
                    await page.goto(`${base}/pages/album-review.html`);
                    assert.equal(await page.locator('.album-summary').count(), 0);
                    await page.locator('#album-query').fill('Vazio');
                    assert.equal(await page.locator('.album-search-form button').count(), 0);
                    await page.waitForFunction(() => document.querySelector('[data-search-status]').textContent.includes('Nenhum álbum'));
                    await page.locator('#album-query').fill('Daft Punk');
                    await page.waitForFunction(() => document.querySelector('[data-search-status]').textContent.includes('30 segundos'));
                    await page.locator('[data-search-retry]').click();
                    await page.locator('.album-search-result').waitFor();
                    await page.locator('[data-search-more]').click();
                    await page.waitForFunction(() => document.querySelectorAll('.album-search-result').length === 2);
                    await noOverflow(page, width);
                    await page.screenshot({ path: path.join(output, `${name}-${width}-${theme}-search.png`), fullPage: true });
                    await page.locator('.album-search-result').first().focus();
                    await page.keyboard.press('Tab');
                    await page.keyboard.press('Shift+Tab');
                    await visibleFocus(page);
                    await page.keyboard.press('Enter');
                    await page.locator('[data-review-retry]').waitFor();
                    assert.equal(await page.locator('[data-review-submit]').count(), 0);
                    await page.locator('[data-review-retry]').click();
                    await page.locator('.album-summary-name').waitFor();
                    assert.equal(await page.locator('.album-summary-name').textContent(), album.name);
                    assert(calls.indexOf(`GET /api/albums/${albumId}`) < calls.indexOf(`GET /api/albums/${albumId}/reviews/me`));
                    await page.locator('[data-rating-value="4.5"]').click();
                    await page.locator('[data-review-submit]').click();
                    await page.locator('#review-success-dialog[open]').waitFor();
                    // Start a separate fixture scenario where a concurrent publication causes POST to conflict.
                    exists = false;
                    await page.goto(`${base}/pages/album-review.html?albumId=${albumId}`);
                    await page.locator('[data-rating-value="4.5"]').click();
                    await page.locator('[data-review-submit]').click();
                    await page.waitForFunction(() => document.querySelector('[data-review-submit]').textContent === 'Salvar alterações');
                    assert.equal(await page.locator('#review-text').inputValue(), review.reviewText);
                    await page.locator('[data-rating-value="4.5"]').click();
                    await page.locator('#review-text').fill('Minha avaliação atualizada');
                    await page.locator('[data-review-submit]').click();
                    await page.locator('#review-success-dialog[open]').waitFor();
                    await noOverflow(page, width);
                    await page.getByRole('button', { name: 'Fechar confirmação' }).click();
                    await page.waitForURL(/\/pages\/feed\.html$/);
                    await page.locator('.feed-empty').waitFor();
                    await page.goto(`${base}/pages/album-review.html`);
                    await page.locator('#album-query').waitFor();

                    // The shared CTA always selects another album, independently of each page's local actions.
                    for (const source of ['profile', 'account', 'echoes', 'album', 'album-review']) {
                        await page.goto(`${base}/pages/${source}.html?demo=true`);
                        await page.locator('#profile-sidebar .review-cta').waitFor({ state: 'attached' });
                        if (width === 390) await page.locator('#open-menu').click();
                        const cta = page.locator(`${width === 390 ? '#profile-drawer' : '#profile-sidebar'} .review-cta`);
                        await cta.waitFor({ state: 'visible' });
                        assert.equal(await cta.getAttribute('href'), 'album-review.html?demo=true');
                        assert.equal(await cta.evaluate(el => Math.round(el.getBoundingClientRect().height)), width === 390 ? 48 : 52);
                        await noOverflow(page, width);
                        if (source === 'profile') await page.screenshot({ path: path.join(output, `${name}-${width}-${theme}-global-cta.png`), fullPage: true });
                        await cta.click();
                        await page.waitForURL(/\/pages\/album-review\.html\?demo=true$/);
                        await page.locator('.album-summary-name').waitFor();
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
