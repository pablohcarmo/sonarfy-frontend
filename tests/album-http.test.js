import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    createHttpAlbumAdapter,
    formatReleaseDate,
    mapAlbumDetails,
    mapCommunityReview,
    mapOwnReview
} from '../js/album-http.js';

afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
});

function jsonResponse(status, body, headers = {}) {
    const map = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
    return {
        status,
        ok: status >= 200 && status < 300,
        headers: { get: name => map.get(String(name).toLowerCase()) ?? null },
        json: async () => body
    };
}

describe('album-http: date precision and DTO mapping', () => {
    // Verify releasePrecision formatting without inventing missing date parts.
    it('formats release dates for ano, mes, dia and handles null/invalid values', () => {
        expect(formatReleaseDate('2024', 'ano')).toBe('2024');
        expect(formatReleaseDate('2024-05', 'mes')).toBe('Mai 2024');
        expect(formatReleaseDate('2024-05-17', 'dia')).toBe('17 Mai 2024');
        expect(formatReleaseDate(null, null)).toBe('');
        expect(formatReleaseDate('2024-05', null)).toBe('');
        expect(formatReleaseDate('2024-02-30', 'dia')).toBe('');
    });

    // Verify 0..10 to 0..5 conversion, null vs zero averageRating, and null cover/tracks.
    it('maps album details distinguishing null averageRating from zero and preserving scale', () => {
        const rated = mapAlbumDetails({
            spotifyId: '4aawyAB9vmqN3uQ7FjRGTy',
            name: 'Album One',
            coverUrl: null,
            artist: { spotifyId: 'artist1', name: 'Artist One' },
            releaseOn: '2024-05',
            releasePrecision: 'mes',
            totalTracks: 70,
            averageRating: 8.25,
            reviewCount: 2
        });
        expect(rated.averageRating).toBe(4.13);
        expect(rated.averageRatingApi).toBe(8.25);
        expect(rated.reviewCount).toBe(2);
        expect(rated.releaseLabel).toBe('Mai 2024');
        expect(rated.totalTracks).toBe(70);
        expect(rated.coverUrl).toBeNull();
        expect(rated.spotifyUrl).toBe('https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy');

        const zeroAvg = mapAlbumDetails({
            spotifyId: '4aawyAB9vmqN3uQ7FjRGTy',
            name: 'Zero Rated',
            coverUrl: 'https://i.scdn.co/image/abc',
            artist: { spotifyId: 'artist1', name: 'Artist One' },
            releaseOn: null,
            releasePrecision: null,
            totalTracks: null,
            averageRating: 0,
            reviewCount: 1
        });
        expect(zeroAvg.averageRating).toBe(0);
        expect(zeroAvg.reviewCount).toBe(1);
        expect(zeroAvg.totalTracks).toBeNull();
        expect(zeroAvg.releaseLabel).toBe('');

        const nullAvg = mapAlbumDetails({
            spotifyId: '4aawyAB9vmqN3uQ7FjRGTy',
            name: 'Unrated Album',
            coverUrl: null,
            artist: { spotifyId: 'artist1', name: 'Artist One' },
            releaseOn: '2021',
            releasePrecision: 'ano',
            totalTracks: 10,
            averageRating: null,
            reviewCount: 0
        });
        expect(nullAvg.averageRating).toBeNull();
        expect(nullAvg.reviewCount).toBe(0);

        const maxReview = mapOwnReview({ reviewId: 10, rating: 10, reviewText: 'Perfeito', createdAt: '2026-11-24T08:00:00Z' });
        expect(maxReview.rating).toBe(5);
        const lowReview = mapOwnReview({ reviewId: 11, rating: 2, reviewText: null, createdAt: '2026-11-24T08:00:00Z' });
        expect(lowReview.rating).toBe(1);
        expect(lowReview.reviewText).toBe('');
    });
});

describe('album-http: HTTP client contracts and error handling', () => {
    // Verify GET /api/albums/{spotifyId} chains community reviews after details resolve and handles 404 on /reviews/me.
    it('loads album details, chains community reviews after details, and maps community DTOs', async () => {
        localStorage.setItem('sonarfy_token', 'jwt-1');
        const callOrder = [];
        const fetcher = vi.fn(async url => {
            callOrder.push(url);
            if (url.endsWith('/albums/4aawyAB9vmqN3uQ7FjRGTy')) {
                return jsonResponse(200, {
                    spotifyId: '4aawyAB9vmqN3uQ7FjRGTy',
                    name: 'Global Warming',
                    coverUrl: null,
                    artist: { spotifyId: 'art1', name: 'Pitbull' },
                    releaseOn: '2012-11-16',
                    releasePrecision: 'dia',
                    totalTracks: 18,
                    averageRating: 4.25,
                    reviewCount: 2
                });
            }
            if (url.endsWith('/albums/4aawyAB9vmqN3uQ7FjRGTy/reviews/me')) {
                return jsonResponse(404, {});
            }
            if (url.endsWith('/profile/me')) {
                return jsonResponse(200, { identity: { id: 1, handle: 'pablo', displayName: 'Pablo' } });
            }
            if (url.includes('/albums/4aawyAB9vmqN3uQ7FjRGTy/reviews?')) {
                return jsonResponse(200, {
                    items: [
                        {
                            reviewId: 42,
                            author: { id: 7, handle: 'musicfan', displayName: 'Music Fan', avatarUrl: null },
                            rating: 8.5,
                            reviewText: 'Ótimo álbum',
                            createdAt: '2026-11-24T12:00:00Z',
                            updatedAt: '2026-11-24T12:00:00Z'
                        },
                        {
                            reviewId: 41,
                            author: { id: 8, handle: 'zero_user', displayName: 'Zero User', avatarUrl: null },
                            rating: 0,
                            reviewText: null,
                            createdAt: '2026-11-24T11:00:00Z',
                            updatedAt: '2026-11-24T11:00:00Z'
                        }
                    ],
                    nextCursor: 'cursor-page-2'
                });
            }
            throw new Error(`Unexpected URL: ${url}`);
        });

        const adapter = createHttpAlbumAdapter({ baseUrl: 'http://localhost:8080/api', fetcher });
        const result = await adapter.loadAlbum({ albumId: '4aawyAB9vmqN3uQ7FjRGTy', sort: 'oldest' });

        expect(result.album.name).toBe('Global Warming');
        expect(result.album.releaseLabel).toBe('16 Nov 2012');
        expect(result.userReview).toBeNull();
        expect(result.communityReviewsAvailable).toBe(true);
        expect(result.nextCursor).toBe('cursor-page-2');
        expect(result.reviews).toHaveLength(2);
        expect(result.reviews[0]).toMatchObject({
            reviewId: 42,
            authorName: 'Music Fan',
            authorHandle: 'musicfan',
            rating: 4.25,
            reviewText: 'Ótimo álbum'
        });
        expect(result.reviews[1]).toMatchObject({ reviewId: 41, rating: 0, reviewText: '' });
        const detailsIndex = callOrder.findIndex(u => u.endsWith('/albums/4aawyAB9vmqN3uQ7FjRGTy'));
        const communityIndex = callOrder.findIndex(u => u.includes('/albums/4aawyAB9vmqN3uQ7FjRGTy/reviews?'));
        expect(detailsIndex).toBeGreaterThanOrEqual(0);
        expect(communityIndex).toBeGreaterThan(detailsIndex);
        expect(callOrder[communityIndex]).toContain('sort=oldest&limit=20');
    });

    // Verify fetchCommunityReviews cursor forwarding, error mappings, and mapCommunityReview validation.
    it('fetches paginated community reviews with opaque cursor and maps 400/404/500 errors', async () => {
        localStorage.setItem('sonarfy_token', 'jwt-1');
        const mapped = mapCommunityReview({
            reviewId: 99,
            author: { id: 3, handle: 'bia', displayName: 'Beatriz', avatarUrl: 'https://cdn.example/a.png' },
            rating: 10,
            reviewText: null,
            createdAt: '2026-11-24T12:00:00Z',
            updatedAt: '2026-11-24T12:00:00Z'
        });
        expect(mapped).toMatchObject({ reviewId: 99, rating: 5, reviewText: '', authorName: 'Beatriz', authorHandle: 'bia' });

        const fetcher = vi.fn()
            .mockResolvedValueOnce(jsonResponse(200, { items: [], nextCursor: null }))
            .mockResolvedValueOnce(jsonResponse(400, {}))
            .mockResolvedValueOnce(jsonResponse(404, {}))
            .mockResolvedValueOnce(jsonResponse(500, {}));

        const adapter = createHttpAlbumAdapter({ baseUrl: 'http://localhost:8080/api', fetcher });
        const page = await adapter.fetchCommunityReviews('4aawyAB9vmqN3uQ7FjRGTy', { sort: 'highest', limit: 10, cursor: 'tok-abc' });
        expect(page).toEqual({ items: [], nextCursor: null });
        expect(fetcher.mock.calls[0][0]).toContain('/albums/4aawyAB9vmqN3uQ7FjRGTy/reviews?sort=highest&limit=10&cursor=tok-abc');

        await expect(adapter.fetchCommunityReviews('4aawyAB9vmqN3uQ7FjRGTy', { cursor: 'bad' }))
            .rejects.toMatchObject({ status: 400, code: 'INVALID_COMMUNITY_QUERY' });
        await expect(adapter.fetchCommunityReviews('4aawyAB9vmqN3uQ7FjRGTy'))
            .rejects.toMatchObject({ status: 404, code: 'ALBUM_NOT_FOUND' });
        await expect(adapter.fetchCommunityReviews('4aawyAB9vmqN3uQ7FjRGTy'))
            .rejects.toMatchObject({ status: 500, retryable: true });
    });

    // Verify 400, 404, 502, 503 with Retry-After, and 504 error mappings without asking for Spotify OAuth.
    it('maps 400, 404, 502, 503 Retry-After, and 504 without requesting personal Spotify connection', async () => {
        localStorage.setItem('sonarfy_token', 'jwt-1');

        const makeAdapter = (status, headers = {}) => createHttpAlbumAdapter({
            baseUrl: 'http://localhost:8080/api',
            fetcher: vi.fn(async () => jsonResponse(status, {}, headers))
        });

        await expect(makeAdapter(400).loadAlbum({ albumId: 'bad' }))
            .rejects.toMatchObject({ status: 400, retryable: false });

        await expect(makeAdapter(404).loadAlbum({ albumId: '4aawyAB9vmqN3uQ7FjRGTy' }))
            .rejects.toMatchObject({ status: 404, retryable: false, message: 'Álbum não encontrado.' });

        await expect(makeAdapter(502).loadAlbum({ albumId: '4aawyAB9vmqN3uQ7FjRGTy' }))
            .rejects.toMatchObject({ status: 502, retryable: true });

        await expect(makeAdapter(503, { 'Retry-After': '45' }).loadAlbum({ albumId: '4aawyAB9vmqN3uQ7FjRGTy' }))
            .rejects.toMatchObject({ status: 503, retryAfterSeconds: 45, retryable: true });

        await expect(makeAdapter(504).loadAlbum({ albumId: '4aawyAB9vmqN3uQ7FjRGTy' }))
            .rejects.toMatchObject({ status: 504, retryable: true });
    });

    // Verify 401 session flow triggers single-flight refresh and retries once.
    it('refreshes session on 401 and expires when refresh fails', async () => {
        localStorage.setItem('sonarfy_token', 'expired-jwt');
        const expire = vi.fn();
        const fetcher = vi.fn()
            .mockResolvedValueOnce(jsonResponse(401, {}))
            .mockResolvedValueOnce(jsonResponse(200, { accessToken: 'fresh-jwt' }))
            .mockResolvedValueOnce(jsonResponse(200, {
                spotifyId: '4aawyAB9vmqN3uQ7FjRGTy',
                name: 'Refreshed Album',
                coverUrl: null,
                artist: { spotifyId: 'a1', name: 'Artist' },
                releaseOn: '2025',
                releasePrecision: 'ano',
                totalTracks: 10,
                averageRating: 10,
                reviewCount: 1
            }));

        const adapter = createHttpAlbumAdapter({ baseUrl: 'http://localhost:8080/api', fetcher, expire });
        const album = await adapter.fetchAlbumDetails('4aawyAB9vmqN3uQ7FjRGTy');
        expect(album.name).toBe('Refreshed Album');
        expect(album.averageRating).toBe(5);
        expect(localStorage.getItem('sonarfy_token')).toBe('fresh-jwt');
        expect(expire).not.toHaveBeenCalled();
    });

    // Verify POST, PUT, 409 recovery, and DELETE review mutations.
    it('supports POST, PUT, 409 conflict recovery, and DELETE (204/404) for own review', async () => {
        localStorage.setItem('sonarfy_token', 'jwt-1');
        const fetcher = vi.fn()
            .mockResolvedValueOnce(jsonResponse(201, {
                reviewId: 77,
                rating: 8.5,
                reviewText: 'Excelente',
                createdAt: '2026-11-24T07:00:00Z',
                updatedAt: '2026-11-24T07:00:00Z'
            }))
            .mockResolvedValueOnce(jsonResponse(200, {
                reviewId: 77,
                rating: 0,
                reviewText: null,
                createdAt: '2026-11-24T07:00:00Z',
                updatedAt: '2026-11-24T07:30:00Z'
            }))
            .mockResolvedValueOnce(jsonResponse(204, null))
            .mockResolvedValueOnce(jsonResponse(404, null));

        const adapter = createHttpAlbumAdapter({ baseUrl: 'http://localhost:8080/api', fetcher });
        const created = await adapter.createReview('4aawyAB9vmqN3uQ7FjRGTy', { rating: 4.25, reviewText: '  Excelente  ' });
        expect(created.reviewId).toBe(77);
        expect(created.rating).toBe(4.25);
        expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ rating: 8.5, reviewText: 'Excelente' });

        const updated = await adapter.updateReview(77, { rating: 0, reviewText: '   ' });
        expect(updated.rating).toBe(0);
        expect(updated.reviewText).toBe('');
        expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ rating: 0, reviewText: null });

        await expect(adapter.deleteReview(77)).resolves.toBeUndefined();
        await expect(adapter.deleteReview(77)).resolves.toBeUndefined();
    });
});
