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
});
