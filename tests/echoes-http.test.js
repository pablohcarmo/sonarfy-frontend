import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createEchoesClient, createHttpEchoesAdapter, parseRetryAfterSeconds } from '../js/echoes-http.js';
import { mountEcos } from '../js/ecos.js';

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers }
});

const deferred = () => {
    let resolve, reject;
    const promise = new Promise((a, b) => { resolve = a; reject = b; });
    return { promise, resolve, reject };
};

const albumSummary = (spotifyId, name, listenCount, lastPlayedAt = '2026-11-23T14:43:00Z') => ({
    album: { spotifyId, name, coverUrl: null },
    lastPlayedAt,
    listenCount
});

const listenItem = (id, trackName, playedAt = '2026-11-23T14:43:00Z', trackSpotifyId = `tr-${id}`) => ({
    id,
    playedAt,
    track: { spotifyId: trackSpotifyId, name: trackName, durationMs: 247000, explicit: false },
    artists: [{ spotifyId: 'ar-1', name: 'Michael Jackson' }],
    album: { spotifyId: 'alb-1', name: 'Bad (Remastered)', coverUrl: null }
});

let mounted;
beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('sonarfy_token', 'access-tok');
    history.replaceState(null, '', '/pages/echoes.html');
});

afterEach(() => {
    mounted?.destroy();
    mounted = null;
    document.body.innerHTML = '';
    vi.useRealTimers();
});

function mountWithAdapter(adapter) {
    const html = readFileSync('pages/echoes.html', 'utf8');
    document.body.innerHTML = html.split('<body class="ecos-page">')[1].split('</body>')[0];
    mounted = mountEcos(adapter);
    return mounted;
}

describe('echoes-http: distinct albums & per-album listens HTTP client', () => {
    it('parses Retry-After integer seconds and HTTP-dates', () => {
        const now = Date.parse('2026-11-23T12:00:00Z');
        expect(parseRetryAfterSeconds('60', now)).toBe(60);
        expect(parseRetryAfterSeconds('0', now)).toBeNull();
        expect(parseRetryAfterSeconds('Mon, 23 Nov 2026 12:01:30 GMT', now)).toBe(90);
        expect(parseRetryAfterSeconds('invalid', now)).toBeNull();
    });

    it('calls GET /api/echoes/albums and GET /api/echoes/albums/{spotifyId}/listens with omit/no-store and never sends empty cursor', async () => {
        const fetcher = vi.fn()
            .mockResolvedValueOnce(json({
                items: [albumSummary('alb/1', 'Bad (Remastered)', 3)],
                nextCursor: 'alb-c2',
                sync: { lastSucceededAt: null, historyStartsAt: null, nextAllowedAt: null }
            }))
            .mockResolvedValueOnce(json({
                items: [listenItem(101, 'Bad - 2012 Remaster')],
                nextCursor: null,
                sync: { lastSucceededAt: null, historyStartsAt: null, nextAllowedAt: null }
            }))
            .mockResolvedValueOnce(new Response(null, { status: 400 }));

        const client = createEchoesClient({ baseUrl: 'https://api.example.invalid/api', fetcher, getToken: () => 'access-tok' });

        const albumsPage = await client.listAlbums({ limit: 20, cursor: 'null' });
        expect(fetcher.mock.calls[0][0]).toBe('https://api.example.invalid/api/echoes/albums?limit=20');
        expect(fetcher.mock.calls[0][1]).toMatchObject({ method: 'GET', credentials: 'omit', cache: 'no-store' });
        expect(albumsPage.items[0]).toMatchObject({ album: { spotifyId: 'alb/1', name: 'Bad (Remastered)' }, listenCount: 3 });
        expect(albumsPage.nextCursor).toBe('alb-c2');

        const listensPage = await client.listAlbumListens('alb/1', { limit: 20, cursor: 'lis-c1' });
        expect(fetcher.mock.calls[1][0]).toBe('https://api.example.invalid/api/echoes/albums/alb%2F1/listens?limit=20&cursor=lis-c1');
        expect(listensPage.items[0]).toMatchObject({ id: '101', trackName: 'Bad - 2012 Remaster' });

        await expect(client.listAlbums({ cursor: 'bad-cursor' })).rejects.toMatchObject({ status: 400, code: 'INVALID_CURSOR' });
    });

    it('handles POST /api/echoes/sync 200 (possibleGap/complete:false+Retry-After), 409, 429, 502, 503, 504', async () => {
        const fetcher = vi.fn()
            .mockResolvedValueOnce(json({
                fetched: 50, imported: 10, alreadyKnown: 40, skipped: 0,
                complete: false, possibleGap: true, newestPlayedAt: '2026-11-22T19:00:00Z', syncedAt: '2026-11-22T19:05:00Z'
            }, 200, { 'Retry-After': '120' }))
            .mockResolvedValueOnce(new Response(null, { status: 409 }))
            .mockResolvedValueOnce(new Response(null, { status: 429, headers: { 'Retry-After': '45' } }))
            .mockResolvedValueOnce(new Response(null, { status: 503, headers: { 'Retry-After': '30' } }))
            .mockResolvedValueOnce(new Response(null, { status: 502 }))
            .mockResolvedValueOnce(new Response(null, { status: 504 }));

        const client = createEchoesClient({ baseUrl: 'https://api.example.invalid/api', fetcher, getToken: () => 'access-tok' });

        const partial = await client.sync();
        expect(partial).toMatchObject({ complete: false, possibleGap: true, retryAfterSeconds: 120 });
        await expect(client.sync()).rejects.toMatchObject({ status: 409, code: 'SPOTIFY_CONFLICT' });
        await expect(client.sync()).rejects.toMatchObject({ status: 429, retryAfterSeconds: 45 });
        await expect(client.sync()).rejects.toMatchObject({ status: 503, retryAfterSeconds: 30 });
        await expect(client.sync()).rejects.toMatchObject({ status: 502 });
        await expect(client.sync()).rejects.toMatchObject({ status: 504 });
    });

    it('queries /spotify/connection on 409 in createHttpEchoesAdapter and does not mask 400 cursor errors with infinite retries', async () => {
        const echoesClient = {
            listAlbums: vi.fn().mockRejectedValueOnce(Object.assign(new Error('bad'), { status: 400, code: 'INVALID_CURSOR' })),
            sync: vi.fn().mockRejectedValueOnce(Object.assign(new Error('conflict'), { status: 409 }))
        };
        const spotifyClient = {
            getConnection: vi.fn().mockResolvedValue({ status: 'CONNECTED', connectedAt: '2026-11-10T00:00:00Z', spotifyConnected: true, recentListensAuthorized: false })
        };

        const adapter = createHttpEchoesAdapter({ echoesClient, spotifyClient });
        await expect(adapter.load({ cursor: 'expired' })).rejects.toMatchObject({ status: 400 });
        expect(echoesClient.listAlbums).toHaveBeenCalledTimes(1);

        await expect(adapter.sync()).rejects.toMatchObject({
            status: 409,
            connection: expect.objectContaining({ status: 'CONNECTED', recentListensAuthorized: false })
        });
    });
});

describe('echoes UI: distinct albums, lazy per-album history, pagination, and invalidation', () => {
    it('renders one card per album in backend order, keeps distinct editions separate, omits missing summary artists, and preserves imported history when disconnected', async () => {
        const adapter = {
            load: vi.fn().mockResolvedValue({
                items: [
                    albumSummary('alb-bad-1', 'Bad (Remastered)', 3, '2026-11-23T14:43:00Z'),
                    albumSummary('alb-dark', 'The Dark Side of the Moon', 3, '2026-11-22T14:43:00Z'),
                    albumSummary('alb-bad-2', 'Bad (Remastered)', 2, '2026-11-20T14:43:00Z')
                ],
                nextCursor: null,
                sync: { lastSucceededAt: null, historyStartsAt: null, nextAllowedAt: null },
                connection: { status: 'DISCONNECTED', connectedAt: null, recentListensAuthorized: false }
            })
        };

        const app = mountWithAdapter(adapter);
        await app.ready;
        const rows = [...document.querySelectorAll('.eco-row')];
        expect(rows).toHaveLength(3);
        expect(rows.map(r => r.dataset.albumId)).toEqual(['alb-bad-1', 'alb-dark', 'alb-bad-2']);
        expect(rows[0].querySelector('.eco-summary').textContent).toBe('3 reproduções');
        expect(rows[0].querySelector('.eco-artist')).toBeNull();
        expect(document.querySelector('[data-load-more]')).toBeNull();
        expect(document.querySelector('#ecos-banner').hidden).toBe(false);
    });

    it('loads album listens on demand, reuses cache on re-expand, preserves repeated tracks, and isolates per-album errors/cursors', async () => {
        const adapter = {
            load: vi.fn().mockResolvedValue({
                items: [
                    albumSummary('alb-bad', 'Bad (Remastered)', 3),
                    albumSummary('alb-empty', 'Empty Album', 0)
                ],
                nextCursor: null,
                sync: {},
                connection: { status: 'CONNECTED', recentListensAuthorized: true }
            }),
            loadAlbumListens: vi.fn()
                .mockRejectedValueOnce(new Error('Falha temporária no álbum'))
                .mockResolvedValueOnce({
                    items: [
                        listenItem(103, 'Bad - 2012 Remaster', '2026-11-23T14:43:00Z', 'tr-same'),
                        listenItem(102, 'Bad - 2012 Remaster', '2026-11-23T14:10:00Z', 'tr-same')
                    ],
                    nextCursor: 'alb-bad-c2',
                    sync: {}
                })
                .mockResolvedValueOnce({
                    items: [listenItem(101, 'Smooth Criminal', '2026-11-21T10:00:00Z', 'tr-other')],
                    nextCursor: null,
                    sync: {}
                })
                .mockResolvedValueOnce({ items: [], nextCursor: null, sync: {} })
        };

        const app = mountWithAdapter(adapter);
        await app.ready;

        // First expand fails for alb-bad; other album remains interactive.
        await app.store.toggleAlbum('alb-bad');
        expect(document.querySelector('[data-album-id="alb-bad"] .eco-details-error').textContent).toBe('Falha temporária no álbum');

        // Retry loads page 1 with 2 repeated listens of the same track (distinct listen IDs).
        await app.store.loadAlbumListens('alb-bad');
        const badRow = document.querySelector('[data-album-id="alb-bad"]');
        expect([...badRow.querySelectorAll('[data-echo-id]')].map(el => el.dataset.echoId)).toEqual(['103', '102']);
        expect(badRow.querySelector('[data-load-more-album="alb-bad"]')).not.toBeNull();

        // Collapse and re-expand reuses cached items without another network call.
        await app.store.toggleAlbum('alb-bad');
        await app.store.toggleAlbum('alb-bad');
        expect(adapter.loadAlbumListens).toHaveBeenCalledTimes(2);

        // Load more for alb-bad terminates when nextCursor is null.
        await app.store.loadAlbumListens('alb-bad', { more: true });
        expect([...document.querySelectorAll('[data-album-id="alb-bad"] [data-echo-id]')].map(el => el.dataset.echoId)).toEqual(['103', '102', '101']);
        expect(document.querySelector('[data-load-more-album="alb-bad"]')).toBeNull();

        // Empty album details renders empty message cleanly.
        await app.store.toggleAlbum('alb-empty');
        expect(document.querySelector('[data-album-id="alb-empty"] .eco-details-state').textContent).toContain('Nenhuma reprodução');
    });

    it('preserves existing list items when loadMore fails, prevents redundant concurrent loadMore, invalidates on sync, and discards stale responses', async () => {
        const staleDetails = deferred();
        const adapter = {
            load: vi.fn()
                .mockResolvedValueOnce({
                    items: [albumSummary('alb-1', 'Album 1', 2)],
                    nextCursor: 'page-2',
                    sync: {},
                    connection: { status: 'CONNECTED', recentListensAuthorized: true }
                })
                .mockRejectedValueOnce(new Error('Falha ao carregar mais álbuns'))
                .mockResolvedValueOnce({
                    items: [albumSummary('alb-2', 'Album 2', 1)],
                    nextCursor: null,
                    sync: {}
                })
                .mockResolvedValueOnce({
                    items: [albumSummary('alb-fresh', 'Fresh Album', 4)],
                    nextCursor: null,
                    sync: { lastSucceededAt: '2026-11-23T12:00:00Z', historyStartsAt: null, nextAllowedAt: null },
                    connection: { status: 'CONNECTED', recentListensAuthorized: true }
                }),
            loadAlbumListens: vi.fn().mockImplementationOnce(() => staleDetails.promise),
            sync: vi.fn().mockResolvedValueOnce({
                fetched: 10, imported: 1, alreadyKnown: 9, skipped: 0,
                complete: false, possibleGap: true, retryAfterSeconds: 60
            })
        };

        const app = mountWithAdapter(adapter);
        await app.ready;

        // Failed loadMore preserves existing alb-1 and nextCursor for retry.
        await app.store.loadMore();
        expect(document.querySelectorAll('.eco-row')).toHaveLength(1);
        expect(document.querySelector('[data-load-more]').textContent).toContain('Tentar carregar mais álbuns');

        // Retry loadMore succeeds.
        const p1 = app.store.loadMore();
        const p2 = app.store.loadMore();
        await Promise.all([p1, p2]);
        expect(adapter.load).toHaveBeenCalledTimes(3);
        expect([...document.querySelectorAll('.eco-row')].map(r => r.dataset.albumId)).toEqual(['alb-1', 'alb-2']);

        // Start in-flight detail request before sync invalidation.
        const pendingDetail = app.store.toggleAlbum('alb-1');
        await app.store.sync();
        staleDetails.resolve({ items: [listenItem(999, 'Stale Track')], nextCursor: null });
        await pendingDetail;

        // List was restarted with fresh data, stale details discarded, warnings & cooldown active.
        expect([...document.querySelectorAll('.eco-row')].map(r => r.dataset.albumId)).toEqual(['alb-fresh']);
        expect(app.store.state.details['alb-1']).toBeUndefined();
        expect(document.querySelector('#ecos-banner').textContent).toContain('lacuna');
        expect(document.querySelector('#ecos-banner').textContent).toContain('parcial');
        expect(document.querySelector('[data-refresh]').disabled).toBe(true);
    });
});
