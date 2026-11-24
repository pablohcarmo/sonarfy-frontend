import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHttpFeedAdapter, mapFeedItem, mapFeedPage } from '../js/feed-http.js';

afterEach(() => vi.unstubAllGlobals());

function jsonResponse(status, body) {
    return {
        status,
        ok: status >= 200 && status < 300,
        async json() { return body; }
    };
}

function sampleDto(overrides = {}) {
    return {
        author: { id: 7, handle: 'marina_som', displayName: 'Marina Costa', avatarUrl: null },
        reviewId: 42,
        album: {
            spotifyId: 'album-sp-1',
            name: 'Solar Vibes',
            coverUrl: null,
            artist: { spotifyId: 'artist-sp-1', name: 'Tropical Groove' }
        },
        rating: 8.5,
        reviewText: 'Uma resenha opcional.',
        createdAt: '2026-11-24T12:00:00Z',
        updatedAt: '2026-11-24T13:00:00Z',
        ...overrides
    };
}

describe('feed-http: contrato e normalização de GET /api/feed', () => {
    // Exercita o adapter sem base explícita para impedir que produção volte a acessar localhost.
    it.each([
        ['https://sonarfymusic.duckdns.org', undefined, undefined, 'https://sonarfymusic.duckdns.org/api'],
        ['http://localhost:4173', undefined, undefined, 'http://localhost:8080/api'],
        ['http://127.0.0.1:4173', undefined, undefined, 'http://localhost:8080/api'],
        ['https://sonarfymusic.duckdns.org', 'https://configured.example/api/', undefined, 'https://configured.example/api'],
        ['https://sonarfymusic.duckdns.org', 'https://configured.example/api', 'https://override.example/api/', 'https://override.example/api']
    ])('resolves feed and viewer URLs from %s with global %s and override %s', async (origin, configuredBase, baseUrl, expectedBase) => {
        vi.stubGlobal('location', new URL(origin));
        vi.stubGlobal('API_BASE_URL', configuredBase);
        const fetcher = vi.fn()
            .mockResolvedValueOnce(jsonResponse(200, { items: [], followingCount: 0, nextCursor: null }))
            .mockResolvedValueOnce(jsonResponse(200, { identity: { id: 1, handle: 'listener', displayName: 'Listener' } }));
        const adapter = createHttpFeedAdapter({ baseUrl, fetcher, getToken: () => 'test-token' });
        await adapter.loadPage();
        await adapter.loadViewer();
        expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
            `${expectedBase}/feed?limit=20`, `${expectedBase}/profile/me`
        ]);
    });

    // Valida normalização de nota zero, dez e quartos de estrela sem conversão duplicada.
    it('normalizes 0, 0.5, 8.5 and 10 ratings to 0..5 quarter-star scale and preserves optional fields', () => {
        expect(mapFeedItem(sampleDto({ rating: 0, reviewText: null })).rating).toBe(0);
        expect(mapFeedItem(sampleDto({ rating: 0.5 })).rating).toBe(0.25);
        expect(mapFeedItem(sampleDto({ rating: 8.5 })).rating).toBe(4.25);
        expect(mapFeedItem(sampleDto({ rating: 10 })).rating).toBe(5);

        const ratingOnly = mapFeedItem(sampleDto({ reviewId: 11, rating: 0, reviewText: null }));
        expect(ratingOnly).toMatchObject({
            id: '11',
            reviewId: 11,
            review: '',
            rating: 0,
            updatedAt: '2026-11-24T13:00:00Z',
            author: { id: '7', handle: 'marina_som', displayName: 'Marina Costa', avatar: null },
            album: { id: 'album-sp-1', spotifyId: 'album-sp-1', title: 'Solar Vibes', artist: 'Tropical Groove', artistSpotifyId: 'artist-sp-1', cover: null }
        });
        expect('liked' in ratingOnly).toBe(false);
        expect('likeCount' in ratingOnly).toBe(false);
        expect('commentCount' in ratingOnly).toBe(false);
        expect('replyTo' in ratingOnly).toBe(false);
    });

    // Garante preservação da ordem do servidor e validação estrita de página.
    it('preserves server order, followingCount=0 with own reviews, and rejects malformed pages', () => {
        const page = mapFeedPage({
            items: [sampleDto({ reviewId: 50, rating: 2 }), sampleDto({ reviewId: 42, rating: 10 })],
            followingCount: 0,
            nextCursor: 'opaque-cursor-1'
        });
        expect(page.items.map(item => item.reviewId)).toEqual([50, 42]);
        expect(page.followingCount).toBe(0);
        expect(page.nextCursor).toBe('opaque-cursor-1');
        expect(() => mapFeedPage({ items: [], followingCount: -1, nextCursor: null })).toThrow();
        expect(() => mapFeedPage({ items: [sampleDto({ rating: 11 })], followingCount: 0, nextCursor: null })).toThrow();
    });

    // Verifica envio de Bearer, cache no-store, cursor opaco intacto e limite padrão/máximo.
    it('sends GET /api/feed with Bearer, no-store and intact cursor without tab/filter params', async () => {
        const fetcher = vi.fn().mockResolvedValue(jsonResponse(200, {
            items: [sampleDto()],
            followingCount: 2,
            nextCursor: 'tok+abc/123=='
        }));
        const adapter = createHttpFeedAdapter({
            baseUrl: 'http://localhost:8080/api',
            fetcher,
            getToken: () => 'access-1',
            setToken: vi.fn(),
            clearToken: vi.fn(),
            expire: vi.fn()
        });
        const first = await adapter.loadPage();
        expect(first.nextCursor).toBe('tok+abc/123==');
        expect(fetcher.mock.calls[0][0]).toBe('http://localhost:8080/api/feed?limit=20');
        expect(fetcher.mock.calls[0][1]).toMatchObject({
            method: 'GET',
            credentials: 'omit',
            cache: 'no-store',
            headers: { Authorization: 'Bearer access-1' }
        });

        await adapter.loadPage({ limit: 50, cursor: 'tok+abc/123==' });
        const secondUrl = new URL(fetcher.mock.calls[1][0]);
        expect(secondUrl.searchParams.get('limit')).toBe('50');
        expect(secondUrl.searchParams.get('cursor')).toBe('tok+abc/123==');
        expect(secondUrl.searchParams.has('tab')).toBe(false);
    });

    // Confirma tratamento de 400 (cursor inválido) e 401 (renovação única e expiração sem loop).
    it('surfaces 400 status on invalid cursor and expires session on 401 without retry loop', async () => {
        const expire = vi.fn();
        const fetcher400 = vi.fn().mockResolvedValue(jsonResponse(400, { message: 'bad cursor' }));
        const adapter400 = createHttpFeedAdapter({
            baseUrl: 'http://localhost:8080/api',
            fetcher: fetcher400,
            getToken: () => 'tok-1',
            expire
        });
        await expect(adapter400.loadPage({ cursor: 'broken' })).rejects.toMatchObject({ status: 400 });
        expect(expire).not.toHaveBeenCalled();

        let token = 'expired-tok';
        const fetcher401 = vi.fn()
            .mockResolvedValueOnce(jsonResponse(401, {}))
            .mockResolvedValueOnce(jsonResponse(401, {}));
        const adapter401 = createHttpFeedAdapter({
            baseUrl: 'http://localhost:8080/api',
            fetcher: fetcher401,
            getToken: () => token,
            setToken: next => { token = next; },
            clearToken: () => { token = null; },
            expire
        });
        await expect(adapter401.loadPage()).rejects.toMatchObject({ status: 401 });
        expect(expire).toHaveBeenCalledTimes(1);
        expect(fetcher401).toHaveBeenCalledTimes(2);
    });

    // Valida atualização e exclusão próprias de avaliação usando PUT/DELETE existentes.
    it('updates and deletes own reviews via existing /api/reviews/{reviewId} routes', async () => {
        const fetcher = vi.fn()
            .mockResolvedValueOnce(jsonResponse(200, sampleDto({ rating: 0, reviewText: null })))
            .mockResolvedValueOnce({ status: 204, ok: true });
        const adapter = createHttpFeedAdapter({
            baseUrl: 'http://localhost:8080/api',
            fetcher,
            getToken: () => 'tok-own',
            expire: vi.fn()
        });
        await adapter.updateReview(42, { rating: 0, reviewText: '   ' });
        expect(fetcher.mock.calls[0][0]).toBe('http://localhost:8080/api/reviews/42');
        expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ rating: 0, reviewText: null });

        await adapter.deleteReview(42);
        expect(fetcher.mock.calls[1][0]).toBe('http://localhost:8080/api/reviews/42');
        expect(fetcher.mock.calls[1][1].method).toBe('DELETE');
    });
});
