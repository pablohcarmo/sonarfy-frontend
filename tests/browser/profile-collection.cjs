const { chromium, firefox } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'test-results/profile-collection');
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

                let ownItems = [
                    {
                        reviewId: 102,
                        album: { spotifyId: 'alb-102', name: 'Disco Nota Zero', coverUrl: null, artist: { spotifyId: 'art-1', name: 'Artista A' } },
                        rating: 0,
                        reviewText: null,
                        createdAt: '2026-11-23T16:00:00Z',
                        updatedAt: '2026-11-23T16:00:00Z'
                    },
                    {
                        reviewId: 101,
                        album: { spotifyId: 'alb-101', name: 'Disco Com Resenha', coverUrl: null, artist: { spotifyId: 'art-2', name: 'Artista B' } },
                        rating: 8.5,
                        reviewText: 'Resenha <b>segura</b>',
                        createdAt: '2026-11-22T16:00:00Z',
                        updatedAt: '2026-11-22T16:00:00Z'
                    }
                ];
                let failCollectionOnce = false;
                let failLoadMoreOnce = false;

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

                    if (url.pathname.endsWith('/reviews')) {
                        return reply(200, {
                            author: { id: 10, handle: 'owner', displayName: 'Conta Própria', avatarUrl: null },
                            items: [],
                            nextBeforeId: null
                        });
                    }

                    if (url.pathname === '/api/profile/by-handle/owner/collection') {
                        if (failCollectionOnce) { failCollectionOnce = false; return route.abort('failed'); }
                        const writtenOnly = url.searchParams.get('writtenOnly') === 'true';
                        const sort = url.searchParams.get('sort') || 'recent';
                        const filtered = writtenOnly ? ownItems.filter(i => i.reviewText) : [...ownItems];
                        if (sort === 'oldest') filtered.reverse();
                        if (sort === 'highest') filtered.sort((a, b) => b.rating - a.rating);
                        if (sort === 'lowest') filtered.sort((a, b) => a.rating - b.rating);
                        return reply(200, {
                            author: { id: 10, handle: 'owner', displayName: 'Conta Própria', avatarUrl: null },
                            items: filtered,
                            totalReviews: ownItems.length,
                            matchingReviews: ownItems.filter(i => i.reviewText).length,
                            nextCursor: null
                        });
                    }

                    if (url.pathname === '/api/profile/by-handle/other/collection') {
                        const cursor = url.searchParams.get('cursor');
                        if (!cursor) {
                            return reply(200, {
                                author: { id: 20, handle: 'other', displayName: 'Perfil Terceiro', avatarUrl: null },
                                items: [
                                    {
                                        reviewId: 202,
                                        album: { spotifyId: 'alb-202', name: 'Terceiro Um', coverUrl: null, artist: { spotifyId: 'art-3', name: 'Artista C' } },
                                        rating: 10,
                                        reviewText: 'Excelente disco',
                                        createdAt: '2026-11-22T12:00:00Z',
                                        updatedAt: '2026-11-22T12:00:00Z'
                                    }
                                ],
                                totalReviews: 2,
                                matchingReviews: 2,
                                nextCursor: 'opaque-cursor-2'
                            });
                        }
                        if (failLoadMoreOnce) { failLoadMoreOnce = false; return route.abort('failed'); }
                        return reply(200, {
                            author: { id: 20, handle: 'other', displayName: 'Perfil Terceiro', avatarUrl: null },
                            items: [
                                {
                                    reviewId: 201,
                                    album: { spotifyId: 'alb-201', name: 'Terceiro Dois', coverUrl: null, artist: { spotifyId: 'art-4', name: 'Artista D' } },
                                    rating: 5,
                                    reviewText: 'Segundo álbum',
                                    createdAt: '2026-11-21T12:00:00Z',
                                    updatedAt: '2026-11-21T12:00:00Z'
                                }
                            ],
                            totalReviews: 2,
                            matchingReviews: 2,
                            nextCursor: null
                        });
                    }

                    if (url.pathname === '/api/profile/by-handle/empty/collection') {
                        return reply(200, {
                            author: { id: 30, handle: 'empty', displayName: 'Sem Avaliações', avatarUrl: null },
                            items: [],
                            totalReviews: 0,
                            matchingReviews: 0,
                            nextCursor: null
                        });
                    }

                    if (url.pathname === '/api/albums/alb-202' && req.method() === 'GET') {
                        return reply(200, {
                            spotifyId: 'alb-202',
                            name: 'Terceiro Um',
                            coverUrl: null,
                            artist: { spotifyId: 'art-3', name: 'Artista C' },
                            releaseOn: '2024',
                            releasePrecision: 'ano',
                            totalTracks: 12,
                            averageRating: 10,
                            reviewCount: 1
                        });
                    }
                    if (url.pathname === '/api/albums/alb-202/reviews/me' && req.method() === 'GET') {
                        return reply(404);
                    }
                    if (url.pathname === '/api/reviews/101' && req.method() === 'PUT') {
                        const body = JSON.parse(req.postData() || '{}');
                        const target = ownItems.find(i => i.reviewId === 101);
                        if (target) {
                            target.rating = body.rating;
                            target.reviewText = body.reviewText;
                        }
                        return reply(200, target);
                    }
                    if (url.pathname === '/api/reviews/101' && req.method() === 'DELETE') {
                        ownItems = ownItems.filter(i => i.reviewId !== 101);
                        return reply(204);
                    }
                    return reply(404);
                });

                const page = await context.newPage();
                const errors = [];
                page.on('pageerror', err => errors.push(err.message));

                // 1. Perfil próprio com falha inicial na coleção -> retry recupera, filtro independente e exclusão invalidam coleção
                failCollectionOnce = true;
                await page.goto(`${base}/pages/profile.html?tab=collection`);
                await page.locator('[data-retry-collection]').waitFor();
                await page.locator('[data-retry-collection]').click();
                await page.locator('#panel-collection .collection-counts').waitFor();
                assert.equal(await page.locator('#panel-collection .collection-card').count(), 2);
                assert.equal((await page.locator('[data-rated-count]').textContent()).trim(), '2 Álbuns Avaliados');
                assert.equal((await page.locator('[data-rated-count] .profile-rated-value').textContent()).trim(), '2');
                assert.equal((await page.locator('[data-rated-count] .profile-rated-label').textContent()).trim(), 'Álbuns Avaliados');
                assert.match(await page.locator('#panel-collection .collection-counts').textContent(), /2 álbuns avaliados/);
                assert.match(await page.locator('#panel-collection .profile-stars').first().getAttribute('aria-label'), /^0 de 5 estrelas$/);

                // Filtro independente mantém totalReviews e mostra matchingReviews
                await page.locator('[data-filter-written]').click();
                await page.waitForFunction(() => document.querySelectorAll('#panel-collection .collection-card').length === 1);
                const countsText = await page.locator('#panel-collection .collection-counts').textContent();
                assert.match(countsText, /2 álbuns avaliados/);
                assert.match(countsText, /1 com resenha/);

                // Diálogo próprio oferece botões somente-ícone de editar e excluir; excluir invalida e recarrega totais
                await page.locator('#panel-collection .collection-preview').first().click();
                const editBtn = page.locator('[data-edit-review="101"]');
                const deleteBtn = page.locator('[data-delete-review="101"]');
                await editBtn.waitFor();
                assert.equal(await editBtn.getAttribute('aria-label'), 'Editar avaliação');
                assert.equal(await deleteBtn.getAttribute('aria-label'), 'Excluir avaliação');
                assert.equal((await editBtn.textContent()).trim(), '');
                assert.equal((await deleteBtn.textContent()).trim(), '');
                assert.equal(await editBtn.locator('img[src*="edit-"]').count(), 2);
                assert.equal(await deleteBtn.locator('img[src*="trash-"]').count(), 2);
                const btnBox = await editBtn.boundingBox();
                assert.equal(Math.round(btnBox.width), 40);
                assert.equal(Math.round(btnBox.height), 40);
                assert.equal(await page.locator('#profile-dialog [data-like], #profile-dialog [data-comments]').count(), 0);

                // Clicar em editar abre o modal de edição na própria página sem redirecionar
                await editBtn.click();
                await page.locator('#edit-review-form').waitFor();
                await page.locator('#edit-review-text').fill('Resenha editada no modal');
                await page.locator('#save-review').click();
                await page.locator('#profile-dialog').waitFor({ state: 'hidden' });
                await page.waitForFunction(() => document.querySelector('#panel-collection .collection-preview')?.textContent?.includes('Resenha editada no modal'));

                // Reabre para testar confirmação de exclusão (Cancelar -> Excluir -> Confirmar exclusão) e invalidação de totais
                await page.locator('#panel-collection .collection-preview').first().click();
                await page.locator('[data-delete-review="101"]').click();
                await page.locator('[data-confirm-delete-review="101"]').waitFor();
                await page.locator('[data-cancel-delete-review="101"]').click();
                await page.locator('[data-delete-review="101"]').waitFor();
                await page.locator('[data-delete-review="101"]').click();
                await page.locator('[data-confirm-delete-review="101"]').click();
                await page.waitForFunction(() => document.querySelector('#panel-collection .collection-counts')?.textContent?.includes('1 álbum avaliado'));
                assert.equal((await page.locator('[data-rated-count]').textContent()).trim(), '1 Álbuns Avaliados');
                const overflowOwn = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
                assert.equal(overflowOwn, false);
                await page.screenshot({ path: `${output}/${name}-${width}-${theme}-own.png`, fullPage: true });

                // 2. Perfil de terceiro: paginação com retry em falha e ausência de ações de escrita
                failLoadMoreOnce = true;
                await page.goto(`${base}/pages/profile.html?handle=other&tab=collection`);
                await page.locator('#panel-collection .collection-counts').waitFor();
                await page.locator('#panel-collection .collection-preview').first().click();
                assert.equal(await page.locator('[data-delete-review], [data-edit-review]').count(), 0);
                assert.equal(await page.locator('#profile-dialog [data-like], #profile-dialog [data-comments]').count(), 0);
                await page.keyboard.press('Escape');

                await page.locator('[data-load-more-collection]').click();
                await page.locator('[data-retry-load-more-collection]').waitFor();
                await page.locator('[data-retry-load-more-collection]').click();
                await page.waitForFunction(() => document.querySelectorAll('#panel-collection .collection-card').length === 2);
                assert.equal(await page.locator('[data-load-more-collection]').count(), 0);
                const overflowOther = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
                assert.equal(overflowOther, false);
                await page.screenshot({ path: `${output}/${name}-${width}-${theme}-other.png`, fullPage: true });

                // Clicar no álbum na coleção navega para pages/album.html?albumId=<spotifyId> e carrega a página do álbum
                await page.locator('#panel-collection .collection-card [data-album="alb-202"]').click();
                await page.waitForURL(url => url.pathname.endsWith('/pages/album.html') && url.searchParams.get('albumId') === 'alb-202');
                await page.locator('.album-title').waitFor();
                assert.equal(await page.locator('.album-title').textContent(), 'Terceiro Um');

                // 3. Perfil vazio
                await page.goto(`${base}/pages/profile.html?handle=empty&tab=collection`);
                await page.locator('#panel-collection .profile-empty').waitFor();

                assert.deepEqual(errors, []);
                results.push({ browser: name, version: browser.version(), width, theme });
                await context.close();
            }
        } finally {
            await browser.close();
        }
    }

    server.close();
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify({ ok: true, count: results.length, results }));
})();
