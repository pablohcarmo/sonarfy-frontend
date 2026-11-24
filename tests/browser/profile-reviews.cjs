const { chromium, firefox } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'test-results/profile-reviews');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (error, bytes) => {
        res.writeHead(error ? 404 : 200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
        res.end(error ? 'Página não encontrada' : bytes);
    });
});

const profileDto = (own, handle = own ? 'owner' : 'other') => ({
    identity: {
        id: own ? 10 : 20,
        handle,
        displayName: own ? 'Conta Própria' : 'Perfil Terceiro',
        avatarUrl: null,
        coverUrl: null,
        biography: 'Bio pública',
        joinedAt: '2026-11-01T12:00:00Z',
        location: { city: 'São Paulo', country: 'Brasil' }
    },
    viewer: { isSelf: own, canEdit: own, isFollowing: false },
    statistics: { followers: 2, following: 1 }
});

(async () => {
    fs.mkdirSync(output, { recursive: true });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const results = [];

    for (const name of ['edge', 'firefox']) {
        const browser = name === 'edge' ? await chromium.launch({ channel: 'msedge', headless: true }) : await firefox.launch({ headless: true });
        try {
            for (const width of [1440, 390]) for (const theme of ['light', 'dark']) {
                const context = await browser.newContext({ viewport: { width, height: 900 } });
                await context.addInitScript(t => {
                    localStorage.setItem('sonarfy_theme', t);
                    if (location.pathname.endsWith('/profile.html')) localStorage.setItem('sonarfy_token', 'browser-test-token');
                }, theme);

                let ownReviews = [
                    {
                        reviewId: 101,
                        album: { spotifyId: 'alb-1', name: 'Disco Um', coverUrl: null, artist: { spotifyId: 'art-1', name: 'Artista A' } },
                        rating: 8.5,
                        reviewText: 'Resenha própria <b>escapada</b>',
                        createdAt: '2026-11-23T16:00:00Z',
                        updatedAt: '2026-11-23T16:00:00Z'
                    }
                ];
                let failReviewsOnce = false;

                await context.route('**/api/**', async route => {
                    const req = route.request();
                    const url = new URL(req.url());
                    if (req.method() === 'OPTIONS') {
                        return route.fulfill({
                            status: 200,
                            headers: {
                                'Access-Control-Allow-Origin': '*',
                                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                                'Access-Control-Allow-Headers': 'Authorization, Content-Type'
                            }
                        });
                    }
                    const reply = (status, body) => route.fulfill({
                        status,
                        contentType: 'application/json',
                        headers: { 'Access-Control-Allow-Origin': '*' },
                        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
                    });
                    if (req.headers().authorization !== 'Bearer browser-test-token') return reply(401);

                    if (url.pathname === '/api/profile/me') return reply(200, profileDto(true));
                    if (url.pathname === '/api/profile/by-handle/other') return reply(200, profileDto(false, 'other'));
                    if (url.pathname === '/api/profile/by-handle/empty') return reply(200, profileDto(false, 'empty'));

                    if (url.pathname === '/api/profile/by-handle/owner/reviews') {
                        if (failReviewsOnce) { failReviewsOnce = false; return route.abort('failed'); }
                        return reply(200, {
                            author: { id: 10, handle: 'owner', displayName: 'Conta Própria', avatarUrl: null },
                            items: ownReviews,
                            nextBeforeId: null
                        });
                    }
                    if (url.pathname === '/api/profile/by-handle/other/reviews') {
                        const beforeId = url.searchParams.get('beforeId');
                        if (!beforeId) {
                            return reply(200, {
                                author: { id: 20, handle: 'other', displayName: 'Perfil Terceiro', avatarUrl: null },
                                items: [
                                    {
                                        reviewId: 202,
                                        album: { spotifyId: 'alb-2', name: 'Disco Dois', coverUrl: null, artist: { spotifyId: 'art-2', name: 'Artista B' } },
                                        rating: 9.0,
                                        reviewText: null,
                                        createdAt: '2026-11-22T12:00:00Z',
                                        updatedAt: '2026-11-22T12:00:00Z'
                                    }
                                ],
                                nextBeforeId: 202
                            });
                        }
                        return reply(200, {
                            author: { id: 20, handle: 'other', displayName: 'Perfil Terceiro', avatarUrl: null },
                            items: [
                                {
                                    reviewId: 201,
                                    album: { spotifyId: 'alb-3', name: 'Disco Três', coverUrl: null, artist: { spotifyId: 'art-3', name: 'Artista C' } },
                                    rating: 7.5,
                                    reviewText: 'Segunda página',
                                    createdAt: '2026-11-21T12:00:00Z',
                                    updatedAt: '2026-11-21T12:00:00Z'
                                }
                            ],
                            nextBeforeId: null
                        });
                    }
                    if (url.pathname === '/api/profile/by-handle/empty/reviews') {
                        return reply(200, {
                            author: { id: 30, handle: 'empty', displayName: 'Sem Avaliações', avatarUrl: null },
                            items: [],
                            nextBeforeId: null
                        });
                    }
                    if (url.pathname === '/api/reviews/101' && req.method() === 'DELETE') {
                        ownReviews = [];
                        return reply(204);
                    }
                    return reply(404);
                });

                const page = await context.newPage();
                const errors = [];
                page.on('pageerror', err => errors.push(err.message));

                // 1. Perfil próprio com falha inicial nas avaliações -> header visível e retry recupera
                failReviewsOnce = true;
                await page.goto(`${base}/pages/profile.html`);
                await page.locator('.profile-card h1').waitFor();
                await page.locator('[data-retry-reviews]').waitFor();
                await page.locator('[data-retry-reviews]').click();
                await page.locator('#panel-activities article.activity-card').first().waitFor();
                assert.equal(await page.locator('[data-delete-review], [data-edit-review]').count(), 0);
                assert.equal(await page.locator('[data-like="101"]').count(), 1);
                assert.equal((await page.locator('[data-like="101"]').textContent()).trim(), '');
                assert.equal(await page.locator('[data-comments="101"]').count(), 1);
                assert.equal((await page.locator('[data-comments="101"]').textContent()).trim(), '');
                assert.match(await page.locator('.profile-stars').first().getAttribute('aria-label'), /^4\.25 de 5 estrelas$/);
                const overflowOwn = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
                assert.equal(overflowOwn, false);
                await page.screenshot({ path: `${output}/${name}-${width}-${theme}-own.png`, fullPage: true });

                // 2. Perfil de terceiro com paginação e sem ações de edição/exclusão
                await page.goto(`${base}/pages/profile.html?handle=other`);
                await page.locator('#panel-activities article.activity-card').first().waitFor();
                assert.equal(await page.locator('[data-delete-review], [data-edit-review]').count(), 0);
                await page.locator('[data-load-more-reviews]').click();
                await page.waitForFunction(() => document.querySelectorAll('#panel-activities .activity-card').length === 2);
                assert.equal(await page.locator('[data-load-more-reviews]').count(), 0);
                const overflowOther = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
                assert.equal(overflowOther, false);
                await page.screenshot({ path: `${output}/${name}-${width}-${theme}-other.png`, fullPage: true });

                // 3. Perfil vazio
                await page.goto(`${base}/pages/profile.html?handle=empty`);
                await page.locator('#panel-activities .profile-empty').waitFor();

                assert.deepEqual(errors, []);
                results.push(`${name}:${width}:${theme}`);
                await context.close();
            }
        } finally {
            await browser.close();
        }
    }

    server.close();
    console.log(JSON.stringify({ ok: true, count: results.length, results }));
})();
