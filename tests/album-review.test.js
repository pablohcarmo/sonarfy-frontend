import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createAlbumReviewFixturesAdapter } from '../js/album-review-fixtures.js';
import { createHttpAlbumReviewAdapter, starsToApiRating, apiRatingToStars } from '../js/album-review-http.js';
import { countReviewChars, formatRatingBadge, mountAlbumReview } from '../js/album-review.js';

let mounted;
afterEach(() => {
    mounted?.destroy();
    mounted = null;
    document.body.innerHTML = '';
    localStorage.clear();
});

function polyfillDialog(dialog) {
    if (!dialog) return;
    if (!dialog.showModal) {
        dialog.showModal = function () {
            this.open = true;
            this.setAttribute('open', '');
        };
    }
    if (!dialog.close) {
        dialog.close = function () {
            this.open = false;
            this.removeAttribute('open');
            this.dispatchEvent(new Event('close'));
        };
    }
}

function mount(adapter, search = '') {
    history.replaceState(null, '', `/pages/album-review.html${search}`);
    const html = readFileSync('pages/album-review.html', 'utf8');
    document.body.innerHTML = html.split('<body class="album-review-page">')[1].split('</body>')[0];
    polyfillDialog(document.querySelector('#profile-drawer'));
    polyfillDialog(document.querySelector('#review-success-dialog'));
    mounted = mountAlbumReview({ adapter });
    return mounted;
}

describe('album-review: rating conversion, Unicode counter, and UI interactions', () => {
    it('converts between 0..5 star UI scale and 0..10 API scale and formats pt-BR badge', () => {
        expect(starsToApiRating(4.5)).toBe(9);
        expect(starsToApiRating(0.5)).toBe(1);
        expect(apiRatingToStars(9)).toBe(4.5);
        expect(apiRatingToStars(8.5)).toBe(4.25);
        expect(formatRatingBadge(4.5)).toBe('4,5');
        expect(formatRatingBadge(4)).toBe('4,0');
        expect(formatRatingBadge(0)).toBe('0,0');
        expect(countReviewChars('🎵🔥')).toBe(2);
    });

    it('renders half-star controls, updates badge on click and keyboard, and tracks 255-char counter', async () => {
        const adapter = createAlbumReviewFixturesAdapter({ scenario: 'empty' });
        const instance = mount(adapter, '?demo=true&scenario=empty');
        await instance.ready;

        expect(document.querySelector('.album-summary-name').textContent).toBe('Neon Horizons');
        expect(document.querySelector('.album-summary-artist').textContent).toBe('Synth Collective');
        expect(document.querySelector('.album-summary-meta').textContent).toBe('2026 · 11 faixas');
        expect(document.querySelectorAll('.star-hit')).toHaveLength(10);
        expect(document.querySelector('.rating-badge').textContent).toBe('0,0');

        const threeHalf = document.querySelector('.star-hit[data-rating-value="3.5"]');
        threeHalf.click();
        expect(document.querySelector('.rating-badge').textContent).toBe('3,5');
        expect(document.querySelector('.star-hit[data-rating-value="3.5"]').getAttribute('aria-checked')).toBe('true');

        const icons = [...document.querySelectorAll('.star-slot-icon')].map(img => img.getAttribute('src'));
        expect(icons[0]).toContain('star-full.svg');
        expect(icons[2]).toContain('star-full.svg');
        expect(icons[3]).toContain('star-half.svg');
        expect(icons[4]).toContain('star-empty.svg');

        const activeHit = document.querySelector('.star-hit[data-rating-value="3.5"]');
        activeHit.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        expect(document.querySelector('.rating-badge').textContent).toBe('4,0');

        const textarea = document.querySelector('#review-text');
        textarea.value = 'Som incrível 🎧';
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        expect(document.querySelector('#review-char-count').textContent).toBe('14 / 255');
    });

    it('requires a star rating before publishing and opens success modal with favorite toggle', async () => {
        const publishSpy = vi.fn(async ({ rating, reviewText }) => ({
            reviewId: 55,
            album: { spotifyId: 'neon-horizons', name: 'Neon Horizons', artist: 'Synth Collective' },
            rating,
            reviewText
        }));
        const adapter = {
            ...createAlbumReviewFixturesAdapter({ scenario: 'empty' }),
            publishReview: publishSpy
        };
        const instance = mount(adapter);
        await instance.ready;

        document.querySelector('[data-review-submit]').click();
        expect(publishSpy).not.toHaveBeenCalled();
        expect(document.querySelector('.review-form-error').textContent).toContain('Selecione uma nota');

        document.querySelector('.star-hit[data-rating-value="4.5"]').click();
        const textarea = document.querySelector('#review-text');
        textarea.value = 'Ótimo álbum!';
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        document.querySelector('[data-review-submit]').click();

        await vi.waitFor(() => {
            expect(document.querySelector('#review-success-dialog').open).toBe(true);
        });
        expect(publishSpy).toHaveBeenCalledWith({
            spotifyId: 'neon-horizons',
            reviewId: null,
            rating: 4.5,
            reviewText: 'Ótimo álbum!'
        });

        const favBtn = document.querySelector('[data-toggle-favorite]');
        expect(favBtn.textContent).toBe('Favoritar álbum');
        expect(favBtn.getAttribute('aria-pressed')).toBe('false');
        favBtn.click();

        await vi.waitFor(() => {
            expect(document.querySelector('[data-toggle-favorite]').textContent).toBe('Desfavoritar álbum');
        });
        expect(document.querySelector('[data-toggle-favorite]').getAttribute('aria-pressed')).toBe('true');

        const assignSpy = vi.fn();
        vi.stubGlobal('location', { ...window.location, assign: assignSpy });
        document.querySelector('[data-success-another]').click();
        expect(document.querySelector('#review-success-dialog').open).toBe(false);
        expect(assignSpy).toHaveBeenCalledWith('echoes.html?demo=true');
        vi.unstubAllGlobals();
    });
});

describe('album-review-http: REST contract and 409 conflict recovery', () => {
    it('loads existing review on 200, handles 404 as new, and maps 409 conflict to edit mode', async () => {
        localStorage.setItem('sonarfy_token', 'jwt-token');
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({ status: 404, ok: false })
            .mockResolvedValueOnce({ status: 409, ok: false })
            .mockResolvedValueOnce({
                status: 200,
                ok: true,
                json: async () => ({
                    reviewId: 42,
                    album: { spotifyId: 'alb-1', name: 'Album', coverUrl: null, artist: { spotifyId: 'art-1', name: 'Artist' } },
                    rating: 9,
                    reviewText: 'Já publicada'
                })
            })
            .mockResolvedValueOnce({
                status: 200,
                ok: true,
                json: async () => ({
                    reviewId: 42,
                    album: { spotifyId: 'alb-1', name: 'Album', coverUrl: null, artist: { spotifyId: 'art-1', name: 'Artist' } },
                    rating: 10,
                    reviewText: 'Atualizada'
                })
            });

        const adapter = createHttpAlbumReviewAdapter({ apiBaseUrl: 'http://localhost:8080/api', fetchImpl: fetchMock });
        const initial = await adapter.loadAlbumReview('alb-1');
        expect(initial.review).toBeNull();

        await expect(adapter.publishReview({ spotifyId: 'alb-1', reviewId: null, rating: 4.5, reviewText: '  ' }))
            .rejects.toMatchObject({ status: 409, existingReview: { reviewId: 42, rating: 4.5, reviewText: 'Já publicada' } });

        const postCall = fetchMock.mock.calls[1];
        expect(postCall[0]).toBe('http://localhost:8080/api/albums/alb-1/reviews');
        expect(JSON.parse(postCall[1].body)).toEqual({ rating: 9, reviewText: null });

        const updated = await adapter.publishReview({ spotifyId: 'alb-1', reviewId: 42, rating: 5, reviewText: 'Atualizada' });
        expect(fetchMock.mock.calls[3][0]).toBe('http://localhost:8080/api/reviews/42');
        expect(fetchMock.mock.calls[3][1].method).toBe('PUT');
        expect(updated.rating).toBe(5);
    });

    it('allows editing and saving an existing review with rating 0', async () => {
        const publishSpy = vi.fn(async ({ rating, reviewText }) => ({
            reviewId: 88,
            album: { spotifyId: 'alb-zero', name: 'Zero Album', artist: 'Artist' },
            rating,
            reviewText
        }));
        const adapter = {
            ...createAlbumReviewFixturesAdapter(),
            loadAlbumReview: async () => ({
                album: { spotifyId: 'alb-zero', name: 'Zero Album', artist: 'Artist' },
                review: { reviewId: 88, rating: 0, reviewText: 'Nota zero válida' }
            }),
            publishReview: publishSpy
        };
        const instance = mount(adapter, '?id=alb-zero');
        await instance.ready;
        expect(document.querySelector('.rating-badge').textContent).toBe('0,0');
        document.querySelector('[data-review-submit]').click();
        await vi.waitFor(() => {
            expect(document.querySelector('#review-success-dialog').open).toBe(true);
        });
        expect(publishSpy).toHaveBeenCalledWith({
            spotifyId: 'alb-zero',
            reviewId: 88,
            rating: 0,
            reviewText: 'Nota zero válida'
        });
    });

    // Verify 401 triggers single-flight refresh and retry, failed refresh expires session, and logout revokes via logoutSession.
    it('refreshes session on 401, expires when refresh fails, and revokes session on logout', async () => {
        localStorage.setItem('sonarfy_token', 'expired-jwt');
        const expire = vi.fn(() => localStorage.removeItem('sonarfy_token'));
        const fetcher = vi.fn()
            .mockResolvedValueOnce({ status: 401, ok: false })
            .mockResolvedValueOnce({
                status: 200,
                ok: true,
                json: async () => ({ accessToken: 'fresh-jwt' })
            })
            .mockResolvedValueOnce({
                status: 200,
                ok: true,
                json: async () => ({
                    reviewId: 91,
                    album: { spotifyId: 'alb-2', name: 'Refreshed', coverUrl: null, artist: { spotifyId: 'a2', name: 'Artist' } },
                    rating: 8,
                    reviewText: 'Renovado'
                })
            })
            .mockResolvedValueOnce({ status: 204, ok: true });

        const adapter = createHttpAlbumReviewAdapter({ baseUrl: 'http://localhost:8080/api', fetcher, expire });
        const loaded = await adapter.loadAlbumReview('alb-2');

        expect(loaded.review).toMatchObject({ reviewId: 91, rating: 4, reviewText: 'Renovado' });
        expect(localStorage.getItem('sonarfy_token')).toBe('fresh-jwt');
        expect(expire).not.toHaveBeenCalled();
        expect(fetcher.mock.calls[1][0]).toBe('http://localhost:8080/api/auth/refresh');
        expect(fetcher.mock.calls[1][1]).toMatchObject({
            method: 'POST',
            credentials: 'include',
            cache: 'no-store',
            headers: { 'X-Sonarfy-CSRF': '1' }
        });
        expect(fetcher.mock.calls[2][1].headers.Authorization).toBe('Bearer fresh-jwt');

        await adapter.logout();
        expect(fetcher.mock.calls[3][0]).toBe('http://localhost:8080/api/auth/logout');
        expect(localStorage.getItem('sonarfy_token')).toBeNull();

        localStorage.setItem('sonarfy_token', 'stale-jwt');
        const failFetcher = vi.fn()
            .mockResolvedValueOnce({ status: 401, ok: false })
            .mockResolvedValueOnce({ status: 401, ok: false });
        const failingAdapter = createHttpAlbumReviewAdapter({ baseUrl: 'http://localhost:8080/api', fetcher: failFetcher, expire });
        await expect(failingAdapter.loadAlbumReview('alb-2')).rejects.toMatchObject({ status: 401 });
        expect(expire).toHaveBeenCalledTimes(1);
        expect(localStorage.getItem('sonarfy_token')).toBeNull();
    });
});
