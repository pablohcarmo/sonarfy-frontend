import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createAlbumFixturesAdapter } from '../js/album-fixtures.js';
import {
    buildReviewHref,
    formatRatingComma,
    formatStarsText,
    mountAlbumPage,
    readAlbumFromSearch
} from '../js/album.js';

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
    history.replaceState(null, '', `/pages/album.html${search}`);
    const html = readFileSync('pages/album.html', 'utf8');
    document.body.innerHTML = html.split('<body class="album-page">')[1].split('</body>')[0];
    polyfillDialog(document.querySelector('#profile-drawer'));
    polyfillDialog(document.querySelector('#album-cover-dialog'));
    polyfillDialog(document.querySelector('#album-review-dialog'));
    mounted = mountAlbumPage({ adapter });
    return mounted;
}

describe('album: helpers and formatting', () => {
    // Verify pt-BR rating formatting, star strings, query parsing, and review link builder.
    it('formats ratings, stars, query overrides, and review deep links', () => {
        expect(formatRatingComma(5)).toBe('5,0');
        expect(formatRatingComma(3.5)).toBe('3,5');
        expect(formatRatingComma(0)).toBe('0,0');
        expect(formatStarsText(4.2)).toBe('★★★★☆');
        expect(formatStarsText(0)).toBe('☆☆☆☆☆');

        const parsed = readAlbumFromSearch('?albumId=sp-1&title=Discovery&artist=Daft+Punk&year=2001&tracks=14');
        expect(parsed).toEqual({
            spotifyId: 'sp-1',
            name: 'Discovery',
            artist: 'Daft Punk',
            releaseYear: '2001',
            trackCount: 14
        });

        const href = buildReviewHref(parsed, { isDemo: true, routes: { review: 'album-review.html?demo=true' } });
        expect(href).toContain('album-review.html?');
        expect(href).toContain('demo=true');
        expect(href).toContain('albumId=sp-1');
        expect(href).toContain('title=Discovery');
    });
});

describe('album: page states and interactions', () => {
    // Verify populated rated state, sorting, and expanded cover modal lifecycle.
    it('renders rated album hero, sorts community reviews, and opens/closes expanded cover modal', async () => {
        const adapter = createAlbumFixturesAdapter({ scenario: 'rated' });
        const instance = mount(adapter, '?demo=true&scenario=rated');
        await instance.ready;

        expect(document.querySelector('#album-demo').hidden).toBe(false);
        expect(document.querySelector('.album-title').textContent).toBe('Neon Horizons');
        expect(document.querySelector('.album-artist').textContent).toBe('Synth Collective');
        expect(document.querySelector('.album-submeta').textContent).toBe('2026 · 11 faixas');
        expect(document.querySelector('.album-rating-average').textContent).toBe('4.2');
        expect(document.querySelector('.album-primary-cta').textContent).toBe('Avaliar este álbum');
        expect(document.querySelector('.album-spotify-cta').textContent).toContain('Ouça no Spotify');
        expect(document.querySelectorAll('.album-review-card')).toHaveLength(4);

        const socialBar = document.querySelector('.album-review-card .activity-social');
        expect(socialBar.classList.contains('is-unavailable')).toBe(true);
        const likeBtn = socialBar.querySelector('[data-like]');
        const commentBtn = socialBar.querySelector('[data-comments]');
        expect(likeBtn.getAttribute('aria-disabled')).toBe('true');
        expect(likeBtn.dataset.tooltip).toBe('Curtidas estarão disponíveis em breve');
        expect(commentBtn.getAttribute('aria-disabled')).toBe('true');
        expect(commentBtn.dataset.tooltip).toBe('Comentários estarão disponíveis em breve');
        expect(likeBtn.textContent.trim()).toBe('');
        expect(commentBtn.textContent.trim()).toBe('');

        likeBtn.click();
        commentBtn.click();
        expect(document.querySelector('#album-status').textContent).toBe('');

        const sort = document.querySelector('#album-sort');
        sort.value = 'lowest';
        sort.dispatchEvent(new Event('change', { bubbles: true }));
        await vi.waitFor(() => {
            expect(document.querySelector('.album-review-card .album-rating-badge').textContent).toBe('1,0');
        });

        document.querySelector('[data-expand-cover]').click();
        const coverDialog = document.querySelector('#album-cover-dialog');
        expect(coverDialog.open).toBe(true);
        expect(coverDialog.querySelector('#album-cover-dialog-title').textContent).toBe('Neon Horizons');

        coverDialog.querySelector('[data-close-cover]').click();
        expect(coverDialog.open).toBe(false);
    });

    // Verify already-rated state with user badge, highlighted card, and inline delete confirmation.
    it('renders user review section and supports inline delete confirmation', async () => {
        const deleteSpy = vi.fn(async () => {});
        const base = createAlbumFixturesAdapter({ scenario: 'already-rated' });
        const instance = mount({ ...base, deleteReview: deleteSpy }, '?demo=true&scenario=already-rated');
        await instance.ready;

        expect(document.querySelector('.album-user-badge').textContent).toContain('Sua avaliação:');
        expect(document.querySelector('.album-primary-cta').textContent).toBe('Editar minha avaliação');
        expect(document.querySelector('.album-my-review-card')).not.toBeNull();

        document.querySelector('[data-request-delete]').click();
        expect(document.querySelector('[data-confirm-delete]')).not.toBeNull();

        document.querySelector('[data-confirm-delete]').click();
        await vi.waitFor(() => {
            expect(deleteSpy).toHaveBeenCalledWith(901);
            expect(document.querySelector('.album-my-review-card')).toBeNull();
        });
        expect(document.querySelector('.album-primary-cta').textContent).toBe('Avaliar este álbum');
    });

    // Verify empty, loading skeleton, and error/retry states.
    it('renders empty state, loading skeleton, and error retry recovery', async () => {
        const emptyInstance = mount(createAlbumFixturesAdapter({ scenario: 'empty' }), '?scenario=empty');
        await emptyInstance.ready;
        expect(document.querySelector('.album-rating-empty-label').textContent).toBe('Sem avaliações ainda');
        expect(document.querySelector('.album-empty-card h3').textContent).toBe('Nenhuma avaliação para este álbum ainda');
        expect(document.querySelector('#album-sort')).toBeNull();
        emptyInstance.destroy();

        const loadingInstance = mount(createAlbumFixturesAdapter({ scenario: 'loading' }), '?scenario=loading');
        expect(document.querySelector('.album-sk-cover')).not.toBeNull();
        expect(document.querySelectorAll('.album-review-card[aria-hidden="true"]')).toHaveLength(3);
        loadingInstance.destroy();

        let shouldFail = true;
        const flakyAdapter = {
            ...createAlbumFixturesAdapter({ scenario: 'rated' }),
            async loadAlbum(args) {
                if (shouldFail) {
                    shouldFail = false;
                    throw new Error('Falha temporária');
                }
                return createAlbumFixturesAdapter({ scenario: 'rated' }).loadAlbum(args);
            }
        };
        const errInstance = mount(flakyAdapter);
        await errInstance.ready;
        expect(document.querySelector('.album-error-card p').textContent).toBe('Falha temporária');

        document.querySelector('[data-retry-album]').click();
        await vi.waitFor(() => {
            expect(document.querySelector('.album-title').textContent).toBe('Neon Horizons');
        });
    });

    // Verify HTTP-integrated behaviors: zero vs null average, unavailable community list, delete re-fetch, Retry-After, share, and stale response guard.
    it('handles HTTP mode: zero average, unavailable community list, delete aggregate refresh, Retry-After, share, and stale responses', async () => {
        let deleted = false;
        const loadAlbum = vi.fn(async ({ albumId }) => ({
            album: {
                spotifyId: albumId || '4aawyAB9vmqN3uQ7FjRGTy',
                name: 'Discovery',
                artist: 'Daft Punk',
                releaseOn: '2001-03',
                releasePrecision: 'mes',
                releaseLabel: 'Mar 2001',
                totalTracks: 14,
                coverUrl: null,
                spotifyUrl: `https://open.spotify.com/album/${albumId || '4aawyAB9vmqN3uQ7FjRGTy'}`,
                averageRating: deleted ? null : 0,
                reviewCount: deleted ? 0 : 1
            },
            userReview: deleted ? null : {
                reviewId: 500,
                authorName: 'Pablo',
                authorHandle: 'pablo',
                publishedLabel: '1h',
                rating: 0,
                reviewText: ''
            },
            reviews: [],
            communityReviewsAvailable: false
        }));
        const deleteReview = vi.fn(async () => { deleted = true; });
        const httpLikeAdapter = {
            isDemo: false,
            communityReviewsAvailable: false,
            routes: { home: 'feed.html', echoes: 'echoes.html', review: 'album-review.html', login: 'login.html' },
            getSessionKey: () => 'tok-1',
            loadAlbum,
            deleteReview
        };

        const instance = mount(httpLikeAdapter, '?albumId=4aawyAB9vmqN3uQ7FjRGTy');
        await instance.ready;

        // Zero average with 1 review is distinct from null average (no reviews).
        expect(document.querySelector('#album-demo').hidden).toBe(true);
        expect(document.querySelector('.album-submeta').textContent).toBe('Mar 2001 · 14 faixas');
        expect(document.querySelector('.album-rating-average').textContent).toBe('0.0');
        expect(document.querySelector('.album-rating-empty-label')).toBeNull();
        expect(document.querySelector('.album-rating-count').textContent).toBe('(1 avaliação)');
        expect(document.querySelector('[data-community-unavailable]')).not.toBeNull();
        expect(document.querySelector('#album-sort')).toBeNull();

        // Native share uses real Sonarfy URL.
        const shareSpy = vi.fn(async () => {});
        Object.defineProperty(navigator, 'share', { value: shareSpy, configurable: true });
        document.querySelector('[data-share-album]').click();
        await vi.waitFor(() => {
            expect(shareSpy).toHaveBeenCalledWith(expect.objectContaining({
                url: expect.stringContaining('albumId=4aawyAB9vmqN3uQ7FjRGTy')
            }));
        });
        delete navigator.share;

        // Deleting own review marks reviews dirty and re-queries album details for updated aggregates.
        document.querySelector('[data-request-delete]').click();
        document.querySelector('[data-confirm-delete]').click();
        await vi.waitFor(() => {
            expect(deleteReview).toHaveBeenCalledWith(500);
            expect(document.querySelector('.album-rating-empty-label')?.textContent).toBe('Sem avaliações ainda');
        });
        expect(localStorage.getItem('sonarfy_reviews_dirty')).toBeTruthy();
        expect(loadAlbum).toHaveBeenCalledTimes(2);
        instance.destroy();

        // 503 with Retry-After disables retry button during cooldown without auto-retrying.
        const retryAfterAdapter = {
            isDemo: false,
            routes: { echoes: 'echoes.html' },
            loadAlbum: vi.fn(async () => {
                const err = new Error('O serviço do catálogo está temporariamente indisponível. Aguarde 30s e tente novamente.');
                err.status = 503;
                err.retryAfterSeconds = 30;
                err.retryable = true;
                throw err;
            })
        };
        const retryInstance = mount(retryAfterAdapter, '?albumId=4aawyAB9vmqN3uQ7FjRGTy');
        await retryInstance.ready;
        const retryBtn = document.querySelector('[data-retry-album]');
        expect(retryBtn.disabled).toBe(true);
        expect(retryBtn.textContent).toContain('Aguarde');
        retryBtn.click();
        expect(retryAfterAdapter.loadAlbum).toHaveBeenCalledTimes(1);
        retryInstance.destroy();

        // Stale response from previous album does not overwrite current album state.
        let resolveFirst;
        const raceAdapter = {
            isDemo: false,
            communityReviewsAvailable: false,
            loadAlbum: vi.fn(({ albumId }) => {
                if (albumId === 'album-old-111111111111') {
                    return new Promise(resolve => { resolveFirst = resolve; });
                }
                return Promise.resolve({
                    album: {
                        spotifyId: albumId,
                        name: 'New Album',
                        artist: 'New Artist',
                        releaseOn: '2026',
                        releasePrecision: 'ano',
                        releaseLabel: '2026',
                        totalTracks: 8,
                        coverUrl: null,
                        averageRating: null,
                        reviewCount: 0
                    },
                    userReview: null,
                    reviews: [],
                    communityReviewsAvailable: false
                });
            })
        };
        const raceInstance = mount(raceAdapter, '?albumId=album-old-111111111111');
        history.pushState(null, '', '/pages/album.html?albumId=album-new-222222222222');
        window.dispatchEvent(new PopStateEvent('popstate'));
        await vi.waitFor(() => {
            expect(document.querySelector('.album-title')?.textContent).toBe('New Album');
        });
        resolveFirst({
            album: {
                spotifyId: 'album-old-111111111111',
                name: 'Old Album',
                artist: 'Old Artist',
                averageRating: 5,
                reviewCount: 9
            },
            userReview: null,
            reviews: [],
            communityReviewsAvailable: false
        });
        await Promise.resolve();
        expect(document.querySelector('.album-title').textContent).toBe('New Album');
        raceInstance.destroy();
    });

    // Verify integrated community reviews: 4 sort options, cursor pagination, deduplication, and isolated community error retry.
    it('supports all four community sort orders, cursor pagination, and isolated community retry in HTTP mode', async () => {
        let failOnce = false;
        const fetchCommunityReviews = vi.fn(async (_id, { sort, cursor }) => {
            if (failOnce) {
                failOnce = false;
                throw new Error('Falha ao carregar comunidade');
            }
            if (cursor === 'cursor-2') {
                return {
                    items: [
                        { reviewId: 2, authorName: 'Marina', authorHandle: 'marina', publishedLabel: '2h', rating: 0, reviewText: '' }
                    ],
                    nextCursor: null
                };
            }
            return {
                items: [
                    { reviewId: sort === 'oldest' ? 1 : 3, authorName: sort === 'oldest' ? 'Antigo' : 'Recente', authorHandle: 'fan', publishedLabel: '1h', rating: 4.5, reviewText: 'Bom disco' }
                ],
                nextCursor: sort === 'recent' ? 'cursor-2' : null
            };
        });
        const adapter = {
            isDemo: false,
            communityReviewsAvailable: true,
            routes: { home: 'feed.html', echoes: 'echoes.html', review: 'album-review.html', login: 'login.html' },
            getSessionKey: () => 'tok-1',
            loadAlbum: vi.fn(async () => ({
                album: {
                    spotifyId: '4aawyAB9vmqN3uQ7FjRGTy',
                    name: 'Album One',
                    artist: 'Artist One',
                    releaseLabel: 'Mai 2024',
                    totalTracks: 10,
                    coverUrl: null,
                    averageRating: 4.5,
                    reviewCount: 2
                },
                userReview: null,
                reviews: [
                    { reviewId: 3, authorName: 'Recente', authorHandle: 'fan', publishedLabel: '1h', rating: 4.5, reviewText: 'Bom disco' }
                ],
                nextCursor: 'cursor-2',
                communityReviewsAvailable: true
            })),
            fetchCommunityReviews
        };

        const instance = mount(adapter, '?albumId=4aawyAB9vmqN3uQ7FjRGTy');
        await instance.ready;

        expect(document.querySelector('[data-community-unavailable]')).toBeNull();
        const options = [...document.querySelectorAll('#album-sort option')].map(o => o.value);
        expect(options).toEqual(['recent', 'oldest', 'highest', 'lowest']);
        expect(document.querySelectorAll('.album-review-card')).toHaveLength(1);
        expect(document.querySelector('[data-load-more-reviews]')).not.toBeNull();

        // Load next page via cursor without reloading album details.
        document.querySelector('[data-load-more-reviews]').click();
        await vi.waitFor(() => {
            expect(document.querySelectorAll('.album-review-card')).toHaveLength(2);
        });
        expect(document.querySelector('[data-load-more-reviews]')).toBeNull();
        expect(adapter.loadAlbum).toHaveBeenCalledTimes(1);

        // Change sort to oldest without wiping album hero.
        const sort = document.querySelector('#album-sort');
        sort.value = 'oldest';
        sort.dispatchEvent(new Event('change', { bubbles: true }));
        await vi.waitFor(() => {
            expect(document.querySelector('.album-review-author')?.textContent).toContain('Antigo');
        });
        expect(adapter.loadAlbum).toHaveBeenCalledTimes(1);

        // Isolated community error preserves album hero and allows retry.
        failOnce = true;
        const sortAgain = document.querySelector('#album-sort');
        sortAgain.value = 'highest';
        sortAgain.dispatchEvent(new Event('change', { bubbles: true }));
        await vi.waitFor(() => {
            expect(document.querySelector('[data-retry-community]')).not.toBeNull();
        });
        expect(document.querySelector('.album-title').textContent).toBe('Album One');
        document.querySelector('[data-retry-community]').click();
        await vi.waitFor(() => {
            expect(document.querySelector('.album-review-card')).not.toBeNull();
        });
        instance.destroy();
    });

    // Verify Album Page uses inline review modal (create and edit) instead of navigating to album-review.html.
    it('opens inline review modal for creating and editing without linking to album-review.html', async () => {
        let currentReview = {
            reviewId: 42,
            authorName: 'Pablo',
            authorHandle: 'pablo',
            publishedLabel: '1h',
            rating: 4,
            reviewText: 'Texto original'
        };
        const updateReview = vi.fn(async (id, payload) => {
            currentReview = { ...currentReview, reviewId: id, rating: payload.rating, reviewText: payload.reviewText };
            return currentReview;
        });
        const createReview = vi.fn(async (_id, payload) => {
            currentReview = { reviewId: 99, authorName: 'Pablo', authorHandle: 'pablo', publishedLabel: 'Agora', rating: payload.rating, reviewText: payload.reviewText };
            return currentReview;
        });
        const adapter = {
            isDemo: false,
            communityReviewsAvailable: true,
            routes: { home: 'feed.html', echoes: 'echoes.html', review: 'album-review.html', login: 'login.html' },
            getSessionKey: () => 'tok-1',
            loadAlbum: vi.fn(async () => ({
                album: {
                    spotifyId: '4aawyAB9vmqN3uQ7FjRGTy',
                    name: 'Contra',
                    artist: 'Vampire Weekend',
                    releaseLabel: '2010',
                    totalTracks: 10,
                    coverUrl: null,
                    averageRating: currentReview ? currentReview.rating : null,
                    reviewCount: currentReview ? 1 : 0
                },
                userReview: currentReview,
                reviews: [],
                nextCursor: null,
                communityReviewsAvailable: true
            })),
            createReview,
            updateReview
        };

        const instance = mount(adapter, '?albumId=4aawyAB9vmqN3uQ7FjRGTy');
        await instance.ready;

        expect(document.querySelectorAll('a[href*="album-review.html"]')).toHaveLength(0);
        document.querySelector('.album-my-review-card [data-open-review-modal]').click();
        const dialog = document.querySelector('#album-review-dialog');
        expect(dialog.open).toBe(true);
        const textarea = dialog.querySelector('#edit-review-text');
        expect(textarea.value).toBe('Texto original');
        textarea.value = 'Texto editado no modal';
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        dialog.querySelector('#edit-review-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

        await vi.waitFor(() => {
            expect(updateReview).toHaveBeenCalledWith(42, { rating: 4, reviewText: 'Texto editado no modal' });
            expect(dialog.open).toBe(false);
        });
        expect(document.querySelector('.album-my-review-card .album-review-text').textContent).toBe('Texto editado no modal');

        // Also works for creating a new review when user has not rated yet.
        currentReview = null;
        await instance.reload();
        document.querySelector('[data-rate-album]').click();
        expect(dialog.open).toBe(true);
        const starsEl = dialog.querySelector('#edit-review-stars-preview');
        starsEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
        dialog.querySelector('#edit-review-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await vi.waitFor(() => {
            expect(createReview).toHaveBeenCalledWith('4aawyAB9vmqN3uQ7FjRGTy', { rating: 5, reviewText: '' });
            expect(dialog.open).toBe(false);
        });
        instance.destroy();
    });
});
