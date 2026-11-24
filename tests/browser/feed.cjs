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

// Garante ausência de overflow horizontal no viewport testado.
async function noOverflow(page, width) {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, 'No horizontal overflow');
}

// Verifica carregamento de imagens e sprites SVG externos.
async function loadedAssets(page) {
    await page.waitForFunction(() => [...document.images].every(img => img.complete && img.naturalWidth > 0));
    const images = await page.locator('img').evaluateAll(images => images.map(img => ({ src: img.src, loaded: img.complete && img.naturalWidth > 0 })));
    assert(images.every(img => img.loaded));
    for (const href of await page.locator('svg use').evaluateAll(nodes => nodes.map(node => node.getAttribute('href').split('#')[0]))) {
        const response = await page.request.get(new URL(href, page.url()).href);
        assert(response.ok());
        assert((await response.body()).length > 0);
    }
    return images;
}

// Verifica foco visível por teclado.
async function visibleFocus(page) {
    const focus = await page.evaluate(() => {
        const el = document.activeElement;
        const css = getComputedStyle(el);
        return { visible: el.matches(':focus-visible'), style: css.outlineStyle, width: parseFloat(css.outlineWidth) };
    });
    assert(focus.visible && focus.style !== 'none' && focus.width >= 2, JSON.stringify(focus));
}

function makeFeedItem(reviewId, { authorId = 7, handle = 'marina_som', displayName = 'Marina Costa', rating = 8.5, reviewText = 'Ótimo álbum!', spotifyId = `album-${reviewId}` } = {}) {
    return {
        author: { id: authorId, handle, displayName, avatarUrl: null },
        reviewId,
        album: { spotifyId, name: `Album ${reviewId}`, coverUrl: null, artist: { spotifyId: `artist-${reviewId}`, name: 'Artista Teste' } },
        rating,
        reviewText,
        createdAt: new Date(Date.now() - 45 * 60000).toISOString(),
        updatedAt: new Date(Date.now() - 45 * 60000).toISOString()
    };
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
                const page = await context.newPage();
                const errors = [];
                page.on('pageerror', error => errors.push(error.message));
                const apiRequests = [];
                page.on('request', request => {
                    if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url());
                });

                let mode = 'populated';
                let retryFailedOnce = false;
                let releaseLoading = null;

                await page.route('**/api/**', async route => {
                    const url = new URL(route.request().url());
                    const headers = { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*' };
                    if (route.request().method() === 'OPTIONS') {
                        await route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'Authorization, Content-Type', 'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS' } });
                        return;
                    }
                    if (url.pathname === '/api/profile/me') {
                        await route.fulfill({ status: 200, headers, body: JSON.stringify({ identity: { id: 1, handle: 'meu_perfil', displayName: 'Meu Perfil', avatarUrl: null }, viewer: { isSelf: true, isFollowing: false, canEdit: true }, statistics: { followers: 2, following: 1 } }) });
                        return;
                    }
                    if (url.pathname === '/api/feed') {
                        const cursor = url.searchParams.get('cursor');
                        if (mode === 'loading') {
                            await new Promise(resolve => { releaseLoading = resolve; });
                        }
                        if (mode === 'empty-zero') {
                            await route.fulfill({ status: 200, headers, body: JSON.stringify({ items: [], followingCount: 0, nextCursor: null }) });
                            return;
                        }
                        if (mode === 'empty-following') {
                            await route.fulfill({ status: 200, headers, body: JSON.stringify({ items: [], followingCount: 3, nextCursor: null }) });
                            return;
                        }
                        if (mode === 'error' && !retryFailedOnce) {
                            retryFailedOnce = true;
                            await route.fulfill({ status: 500, headers, body: JSON.stringify({ message: 'Erro interno' }) });
                            return;
                        }
                        if (!cursor) {
                            const items = [
                                makeFeedItem(42, { authorId: 1, handle: 'meu_perfil', displayName: 'Meu Perfil', rating: 8.5, reviewText: 'Avaliação própria com quartos de estrela.' }),
                                makeFeedItem(41, { authorId: 7, handle: 'lucas_vinyl', displayName: 'Lucas Andrade', rating: 0, reviewText: null })
                            ];
                            await route.fulfill({ status: 200, headers, body: JSON.stringify({ items, followingCount: 1, nextCursor: 'cursor-page-2' }) });
                            return;
                        }
                        if (cursor === 'cursor-page-2') {
                            const items = [
                                makeFeedItem(40, { authorId: 8, handle: 'bia_indie', displayName: 'Beatriz Lima', rating: 10, reviewText: '𝄞'.repeat(255) })
                            ];
                            await route.fulfill({ status: 200, headers, body: JSON.stringify({ items, followingCount: 1, nextCursor: null }) });
                            return;
                        }
                        await route.fulfill({ status: 400, headers, body: JSON.stringify({ message: 'Cursor inválido' }) });
                        return;
                    }
                    if (url.pathname === '/api/auth/logout') {
                        await route.fulfill({ status: 204, headers });
                        return;
                    }
                    await route.fulfill({ status: 404, headers, body: '{}' });
                });

                await page.addInitScript(themeValue => {
                    localStorage.setItem('sonarfy_theme', themeValue);
                    localStorage.setItem('sonarfy_token', 'browser-test-token');
                }, theme);

                const prefix = `${name}-${width}-${theme}`;
                const url = `${base}/pages/feed.html`;

                // 1. Feed único paginado + carregamento adicional + geometria + ausência de abas/sociais.
                await page.goto(url);
                await page.locator('.activity-author').first().waitFor();
                await page.evaluate(() => document.fonts.ready);
                assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
                assert.equal(await page.locator('[role="tab"]').count(), 0);
                assert.equal(await page.locator('#feed-refresh').count(), 0);
                assert.equal(await page.locator('[data-edit-review], [data-delete-review]').count(), 0);
                assert.equal(await page.locator('.activity-card [data-album]').count(), 2);
                assert.equal(await page.locator('.activity-card').count(), 2);
                assert.equal(await page.locator('.activity-social.is-unavailable [data-like][aria-disabled="true"]').count(), 2);
                assert.equal(await page.locator('.activity-social.is-unavailable [data-comments][aria-disabled="true"]').count(), 2);
                assert.equal(await page.locator('.activity-social button > span:not(.profile-icon)').count(), 0);
                assert.equal((await page.locator('.site-header').boundingBox()).height, width === 1440 ? 88 : 80);
                assert.equal((await page.locator('.activity-card').first().boundingBox()).width, width === 1440 ? 1080 : 358);
                assert.equal(await page.locator('.profile-sidebar [aria-current="page"]').textContent(), 'Home');
                assert(await page.locator('.profile-footer').evaluate(el => el === document.body.lastElementChild));
                const assets = await loadedAssets(page);
                await noOverflow(page, width);
                await page.screenshot({ path: `${output}/${prefix}-feed.png`, fullPage: true });

                // Carregar mais via cursor opaco até o fim da lista.
                await page.locator('[data-feed-load-more]').click();
                await page.waitForFunction(() => document.querySelectorAll('.activity-card').length === 3);
                assert.equal(await page.locator('.feed-end').isVisible(), true);
                assert.equal(await page.locator('.activity-review').last().evaluate(el => Array.from(el.textContent).length), 255);
                await noOverflow(page, width);

                // Foco por teclado e drawer mobile.
                await page.keyboard.press('Tab');
                await visibleFocus(page);
                if (width === 390) {
                    await page.locator('#open-menu').click();
                    const drawer = page.locator('#profile-drawer');
                    assert.equal((await drawer.boundingBox()).width, 296);
                    assert.equal(await drawer.locator('[aria-current="page"]').textContent(), 'Home');
                    await loadedAssets(page);
                    await page.screenshot({ path: `${output}/${prefix}-drawer.png` });
                    await page.keyboard.press('Escape');
                    assert.equal(await page.locator('#open-menu').evaluate(el => el === document.activeElement), true);
                }

                // Clicar no álbum do card navega para pages/album.html?albumId=<spotifyId>.
                const firstAlbumId = await page.locator('.activity-card [data-album]').first().getAttribute('data-album');
                await page.locator('.activity-card [data-album]').first().click();
                await page.waitForURL(u => u.pathname.endsWith('/pages/album.html') && u.searchParams.get('albumId') === firstAlbumId);

                // 2. Estado de carregamento (skeleton + reduced-motion).
                mode = 'loading';
                const navLoading = page.goto(url);
                await page.locator('.skeleton').first().waitFor();
                assert.equal(await page.locator('#feed-list').getAttribute('aria-busy'), 'true');
                assert.equal(await page.locator('.skeleton').first().evaluate(el => getComputedStyle(el).animationName), 'none');
                await noOverflow(page, width);
                await page.screenshot({ path: `${output}/${prefix}-loading.png`, fullPage: true });
                releaseLoading();
                await navLoading;
                await page.locator('.activity-author').first().waitFor();

                // 3. Estados vazios (followingCount=0 e followingCount>0).
                mode = 'empty-zero';
                await page.goto(url);
                await page.locator('.feed-empty').waitFor();
                assert(await page.locator('.feed-empty h2').textContent().then(t => t.includes('silencioso')));
                await noOverflow(page, width);
                await page.screenshot({ path: `${output}/${prefix}-empty.png`, fullPage: true });

                mode = 'empty-following';
                await page.goto(url);
                await page.locator('.feed-empty').waitFor();
                assert(await page.locator('.feed-empty h2').textContent().then(t => t.includes('Ainda não há avaliações')));
                await noOverflow(page, width);

                // 4. Erro inicial sem fallback + retry.
                mode = 'error';
                retryFailedOnce = false;
                await page.goto(url);
                await page.locator('[data-feed-retry]').waitFor();
                assert.equal(await page.locator('.activity-card').count(), 0);
                await page.locator('[data-feed-retry]').click();
                await page.locator('.activity-author').first().waitFor();
                await noOverflow(page, width);

                assert.deepEqual(errors, []);
                // Both quick review and shared sidebar CTA lead to album selection instead of Spotify history.
                assert.equal(await page.locator('#quick-review a').getAttribute('href'), 'album-review.html');
                if (width === 390) await page.locator('#open-menu').click();
                await page.locator(`${width === 390 ? '#profile-drawer' : '#profile-sidebar'} .review-cta`).click();
                await page.waitForURL(/\/pages\/album-review\.html$/);
                await page.locator('#album-query').waitFor();
                // Serve a build local sob a origem publicada sem enviar tokens ou chamadas à produção.
                const publishedOrigin = 'https://sonarfymusic.duckdns.org';
                await page.route(`${publishedOrigin}/**`, async route => {
                    const requested = new URL(route.request().url());
                    if (requested.pathname.startsWith('/api/')) return route.fallback();
                    const response = await page.request.get(`${base}${requested.pathname}${requested.search}`);
                    await route.fulfill({ response });
                });
                mode = 'populated';
                apiRequests.length = 0;
                await page.goto(`${publishedOrigin}/pages/feed.html`);
                await page.locator('.activity-author').first().waitFor();
                assert.equal(await page.evaluate(() => typeof API_BASE_URL), 'undefined');
                await page.locator('[data-feed-load-more]').click();
                await page.waitForFunction(() => document.querySelectorAll('.activity-card').length === 3);
                assert(apiRequests.some(url => url.startsWith(`${publishedOrigin}/api/feed?`)));
                assert(apiRequests.includes(`${publishedOrigin}/api/profile/me`));
                assert(apiRequests.every(url => new URL(url).origin === publishedOrigin), JSON.stringify(apiRequests));
                await noOverflow(page, width);
                await page.screenshot({ path: `${output}/${prefix}-published-origin.png`, fullPage: true });
                assert.deepEqual(errors, []);
                results.push({ browser: name, version: browser.version(), width, theme, scenarios: ['populated-paginated', 'loading', 'empty-zero', 'empty-following', 'error-retry', 'published-origin'], publishedApiRequests: apiRequests, assets: assets.length, passed: true });
                await context.close();
                console.log(`PASS ${prefix}`);
            }
        } finally { await browser.close(); }
    }
    fs.writeFileSync(`${output}/results.json`, JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
