import { createAlbumFixturesAdapter } from './album-fixtures.js';
import { globalHeader, globalFooter, sidebar } from './profile-shell.js';
import { socialActions } from './profile-views.js';
import { icon } from './profile-icons.js';
import { containFocus } from './profile-dialogs.js';
import { escapeHTML as e, safeImage } from './profile-utils.js';

const SORT_OPTIONS = [
    ['recent', 'Ordenar: Mais recentes'],
    ['highest', 'Ordenar: Maior nota'],
    ['lowest', 'Ordenar: Menor nota']
];

// Read optional album metadata from query parameters for deep links or previews.
export function readAlbumFromSearch(search = typeof location !== 'undefined' ? location.search : '') {
    const params = new URLSearchParams(search);
    const spotifyId = params.get('albumId') || params.get('id') || '';
    const name = params.get('title') || params.get('name') || '';
    const artist = params.get('artist') || '';
    const releaseYear = params.get('year') || '';
    const tracksRaw = params.get('tracks');
    const trackCount = tracksRaw && /^\d+$/.test(tracksRaw) ? Number(tracksRaw) : null;
    const coverUrl = params.get('cover') || null;
    const override = {};
    if (spotifyId) override.spotifyId = spotifyId;
    if (name) override.name = name;
    if (artist) override.artist = artist;
    if (releaseYear) override.releaseYear = releaseYear;
    if (trackCount !== null) override.trackCount = trackCount;
    if (coverUrl) override.coverUrl = coverUrl;
    return Object.keys(override).length ? override : null;
}

// Resolve host-injected adapter or fall back to local skeleton fixtures while backend is in development.
export function resolveAlbumAdapter(integration = globalThis.sonarfyAlbumAdapter) {
    if (integration) return integration;
    const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
    const scenario = params.get('scenario') || 'rated';
    return createAlbumFixturesAdapter({ scenario, albumOverride: readAlbumFromSearch() });
}

// Format a 0..5 star rating with Brazilian decimal comma (e.g., 5,0).
export function formatRatingComma(value) {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return '0,0';
    return (Math.round(num * 10) / 10).toFixed(1).replace('.', ',');
}

// Render 5 star characters reflecting a 0..5 rating rounded to nearest whole star.
export function formatStarsText(value) {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return '☆☆☆☆☆';
    const filled = Math.max(0, Math.min(5, Math.round(num)));
    return `${'★'.repeat(filled)}${'☆'.repeat(5 - filled)}`;
}

// Build the review page URL carrying album metadata and preserving demo mode when active.
export function buildReviewHref(album, adapter) {
    const base = adapter?.routes?.review || (adapter?.isDemo ? 'album-review.html?demo=true' : 'album-review.html');
    const [path, query = ''] = base.split('?');
    const params = new URLSearchParams(query);
    if (album?.spotifyId) params.set('albumId', album.spotifyId);
    if (album?.name) params.set('title', album.name);
    if (album?.artist) params.set('artist', album.artist);
    if (album?.releaseYear) params.set('year', String(album.releaseYear));
    if (typeof album?.trackCount === 'number' && album.trackCount > 0) params.set('tracks', String(album.trackCount));
    if (album?.coverUrl) params.set('cover', album.coverUrl);
    const qs = params.toString();
    return qs ? `${path}?${qs}` : path;
}

function renderCoverContent(album) {
    const src = safeImage(album?.coverUrl || album?.cover);
    const initials = e((album?.name || 'S').slice(0, 2).toUpperCase());
    return src ? `<img src="${src}" alt="Capa de ${e(album.name)}" data-image-fallback>` : `<span aria-hidden="true">${initials}</span>`;
}

function renderSubmeta(album) {
    const parts = [];
    if (album?.releaseYear) parts.push(String(album.releaseYear));
    if (typeof album?.trackCount === 'number' && album.trackCount > 0) {
        parts.push(`${album.trackCount} ${album.trackCount === 1 ? 'faixa' : 'faixas'}`);
    }
    return parts.join(' · ');
}

function renderCommunityRating(album) {
    const count = Number(album?.reviewCount) || 0;
    const countLabel = `(${count} ${count === 1 ? 'avaliação' : 'avaliações'})`;
    if (count <= 0 || album?.averageRating == null) {
        return `<div class="album-community-rating" aria-label="Sem avaliações ainda">
            <span class="album-rating-empty-label">Sem avaliações ainda</span>
            <span class="album-stars is-empty" aria-hidden="true">☆☆☆☆☆</span>
            <span class="album-rating-count">${e(countLabel)}</span>
        </div>`;
    }
    const avg = (Math.round(Number(album.averageRating) * 10) / 10).toFixed(1);
    return `<div class="album-community-rating" aria-label="Nota média ${e(avg)} de 5 com ${count} avaliações">
        <span class="album-rating-average">${e(avg)}</span>
        <span class="album-stars" aria-hidden="true">${formatStarsText(album.averageRating)}</span>
        <span class="album-rating-count">${e(countLabel)}</span>
    </div>`;
}

function renderHeroCard(album, userReview, adapter) {
    const submeta = renderSubmeta(album);
    const reviewHref = buildReviewHref(album, adapter);
    const spotifyUrl = album?.spotifyUrl || (album?.spotifyId ? `https://open.spotify.com/album/${encodeURIComponent(album.spotifyId)}` : '');
    const userBadgeHtml = userReview
        ? `<div class="album-user-badge">Sua avaliação: <span aria-hidden="true">${formatStarsText(userReview.rating)}</span> · ${e(formatRatingComma(userReview.rating))}</div>`
        : '';
    const ctaLabel = userReview ? 'Editar minha avaliação' : 'Avaliar este álbum';
    const spotifyHtml = spotifyUrl
        ? `<a class="album-spotify-cta" href="${e(spotifyUrl)}" target="_blank" rel="noopener noreferrer"><img src="../assets/icons/album/spotify-black.svg" width="22" height="22" alt="" aria-hidden="true"><span>Ouça no Spotify</span></a>`
        : '';

    return `<section class="album-hero-card" aria-labelledby="album-title">
        <div class="album-hero-content">
            <button type="button" class="album-cover-btn" data-expand-cover aria-label="Expandir capa de ${e(album.name)}">${renderCoverContent(album)}</button>
            <div class="album-meta-stack">
                <h1 id="album-title" class="album-title">${e(album.name)}</h1>
                <div class="album-meta-group">
                    ${album.artist ? `<p class="album-artist">${e(album.artist)}</p>` : ''}
                    ${submeta ? `<p class="album-submeta">${e(submeta)}</p>` : ''}
                </div>
                ${renderCommunityRating(album)}
                ${userBadgeHtml}
                <div class="album-cta-row">
                    <a class="album-primary-cta" href="${e(reviewHref)}" data-rate-album>${e(ctaLabel)}</a>
                    ${spotifyHtml}
                </div>
            </div>
        </div>
        <button type="button" class="album-share-btn" data-share-album aria-label="Compartilhar álbum">
            <img class="theme-light-only" src="../assets/icons/album/share-light.svg" width="36" height="36" alt="" aria-hidden="true">
            <img class="theme-dark-only" src="../assets/icons/album/share-dark.svg" width="36" height="36" alt="" aria-hidden="true">
        </button>
    </section>`;
}

function renderSocialActions(review) {
    return socialActions({
        id: String(review.reviewId ?? ''),
        liked: false,
        likeCount: 0,
        commentCount: 0,
        socialAvailable: false
    });
}

function renderMyReviewCard(userReview, album, adapter, confirmingDelete) {
    const reviewHref = buildReviewHref(album, adapter);
    const authorLine = `${userReview.authorName} @${userReview.authorHandle}${userReview.publishedLabel ? ` · ${userReview.publishedLabel}` : ''}`;
    const actionsHtml = confirmingDelete
        ? `<div class="album-my-review-actions">
            <button type="button" class="album-confirm-delete" data-confirm-delete>Confirmar exclusão</button>
            <button type="button" class="album-cancel-delete" data-cancel-delete>Cancelar</button>
        </div>`
        : `<div class="album-my-review-actions">
            <a class="album-icon-action" href="${e(reviewHref)}" aria-label="Editar minha avaliação">
                <img class="theme-light-only" src="../assets/icons/album/edit-light.svg" width="36" height="36" alt="" aria-hidden="true">
                <img class="theme-dark-only" src="../assets/icons/album/edit-dark.svg" width="36" height="36" alt="" aria-hidden="true">
            </a>
            <button type="button" class="album-icon-action" data-request-delete aria-label="Excluir minha avaliação">
                <img class="theme-light-only" src="../assets/icons/album/delete-light.svg" width="36" height="36" alt="" aria-hidden="true">
                <img class="theme-dark-only" src="../assets/icons/album/delete-dark.svg" width="36" height="36" alt="" aria-hidden="true">
            </button>
        </div>`;

    return `<section class="album-my-review-card" aria-label="Sua avaliação">
        <div class="album-my-review-top">
            <p class="album-my-review-label">Sua Avaliação</p>
            ${actionsHtml}
        </div>
        <div class="album-review-header">
            <p class="album-review-author">${e(authorLine)}</p>
            <div class="album-star-rating-row" aria-label="Nota ${e(formatRatingComma(userReview.rating))} de 5">
                <span class="album-review-stars" aria-hidden="true">${formatStarsText(userReview.rating)}</span>
                <span class="album-rating-badge">${e(formatRatingComma(userReview.rating))}</span>
            </div>
        </div>
        ${userReview.reviewText ? `<p class="album-review-text">${e(userReview.reviewText)}</p>` : ''}
        ${renderSocialActions(userReview)}
    </section>`;
}

function renderReviewCard(review) {
    const authorLine = `${review.authorName} @${review.authorHandle}${review.publishedLabel ? ` · ${review.publishedLabel}` : ''}`;
    return `<article class="album-review-card">
        <div class="album-review-header">
            <p class="album-review-author">${e(authorLine)}</p>
            <div class="album-star-rating-row" aria-label="Nota ${e(formatRatingComma(review.rating))} de 5">
                <span class="album-review-stars" aria-hidden="true">${formatStarsText(review.rating)}</span>
                <span class="album-rating-badge">${e(formatRatingComma(review.rating))}</span>
            </div>
        </div>
        ${review.reviewText ? `<p class="album-review-text">${e(review.reviewText)}</p>` : ''}
        ${renderSocialActions(review)}
    </article>`;
}

function renderLoadingSkeleton() {
    const card = `<div class="album-review-card" aria-hidden="true">
        <div class="album-sk album-sk-header"></div>
        <div class="album-sk album-sk-line"></div>
        <div class="album-sk album-sk-line-short"></div>
    </div>`;
    return `<section class="album-hero-card" aria-label="Carregando informações do álbum" aria-busy="true">
        <div class="album-skeleton-row">
            <div class="album-sk album-sk-cover"></div>
            <div class="album-sk-meta">
                <div class="album-sk album-sk-title"></div>
                <div class="album-sk album-sk-sub"></div>
                <div class="album-sk album-sk-rating"></div>
                <div class="album-sk album-sk-cta"></div>
            </div>
        </div>
    </section>
    <div class="album-section-header"><h2 class="album-section-title">Avaliações da Comunidade</h2></div>
    <div class="album-reviews-stack" aria-label="Carregando avaliações" aria-busy="true">${card.repeat(3)}</div>`;
}

// Mount the Album Page skeleton with shared shell, states, sorting, and expanded cover modal.
export function mountAlbumPage(options = {}) {
    const adapter = options.adapter || resolveAlbumAdapter();
    const headerEl = document.querySelector('.profile-global-header');
    const sidebarEl = document.querySelector('#profile-sidebar');
    const footerEl = document.querySelector('.profile-footer');
    const drawer = document.querySelector('#profile-drawer');
    const coverDialog = document.querySelector('#album-cover-dialog');
    const demoEl = document.querySelector('#album-demo');
    const statusEl = document.querySelector('#album-status');
    const contentEl = document.querySelector('#album-content');
    if (!headerEl || !sidebarEl || !footerEl || !drawer || !coverDialog || !contentEl) return null;

    headerEl.innerHTML = globalHeader(adapter.routes?.home || 'feed.html');
    sidebarEl.innerHTML = sidebar(false, adapter.routes, null);
    footerEl.innerHTML = globalFooter();
    if (demoEl) demoEl.hidden = !adapter.isDemo;

    const controller = new AbortController();
    const on = (target, type, handler, opts = {}) => target?.addEventListener(type, handler, { ...opts, signal: controller.signal });

    const toggle = headerEl.querySelector('#theme-toggle');
    const syncTheme = () => globalThis.sonarfyTheme?.syncToggle?.(toggle);
    syncTheme();
    on(toggle, 'click', () => {
        globalThis.sonarfyTheme?.setTheme?.(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
        syncTheme();
    });

    const trigger = headerEl.querySelector('#open-menu');
    containFocus(drawer, controller.signal);
    containFocus(coverDialog, controller.signal);

    const state = {
        loading: true,
        error: '',
        album: null,
        userReview: null,
        reviews: [],
        sort: 'recent',
        confirmingDelete: false
    };

    const notify = text => { if (statusEl) statusEl.textContent = text; };

    function render() {
        if (state.loading) {
            contentEl.innerHTML = renderLoadingSkeleton();
            return;
        }
        if (state.error || !state.album) {
            contentEl.innerHTML = `<section class="album-error-card" role="alert">
                <h2>Não foi possível carregar o álbum</h2>
                <p>${e(state.error || 'Tente novamente em instantes.')}</p>
                <button type="button" class="album-primary-cta" data-retry-album>Tentar novamente</button>
            </section>`;
            return;
        }

        const hasReviews = state.reviews.length > 0;
        const sortHtml = hasReviews
            ? `<div class="album-sort-pill"><select id="album-sort" class="album-sort-select" aria-label="Ordenar avaliações">${SORT_OPTIONS.map(([val, label]) => `<option value="${val}"${state.sort === val ? ' selected' : ''}>${e(label)}</option>`).join('')}</select></div>`
            : '';
        const reviewsBody = hasReviews
            ? state.reviews.map(renderReviewCard).join('')
            : `<div class="album-empty-card">
                <h3>Nenhuma avaliação para este álbum ainda</h3>
                <p>Seja o primeiro a compartilhar o que achou deste disco.</p>
                <a class="album-primary-cta" href="${e(buildReviewHref(state.album, adapter))}">Avaliar agora</a>
            </div>`;

        contentEl.innerHTML = `${renderHeroCard(state.album, state.userReview, adapter)}
            ${state.userReview ? renderMyReviewCard(state.userReview, state.album, adapter, state.confirmingDelete) : ''}
            <section class="album-reviews-section" aria-labelledby="community-reviews-heading">
                <div class="album-section-header">
                    <h2 id="community-reviews-heading" class="album-section-title">Avaliações da Comunidade</h2>
                    ${sortHtml}
                </div>
                <div class="album-reviews-stack">${reviewsBody}</div>
            </section>`;
    }

    function openCoverModal() {
        if (!state.album) return;
        coverDialog.innerHTML = `<div class="album-cover-dialog-close-row">
                <button type="button" class="album-cover-dialog-close" data-close-cover aria-label="Fechar capa expandida">✕</button>
            </div>
            <div class="album-cover-expanded">${renderCoverContent(state.album)}</div>
            <div class="album-cover-caption">
                <h2 id="album-cover-dialog-title">${e(state.album.name)}</h2>
                ${state.album.artist ? `<p>${e(state.album.artist)}</p>` : ''}
            </div>`;
        if (!coverDialog.open) coverDialog.showModal();
        document.body.classList.add('profile-modal-open');
        coverDialog.querySelector('[data-close-cover]')?.focus();
    }

    async function load() {
        state.loading = true;
        state.error = '';
        render();
        try {
            const albumId = readAlbumFromSearch()?.spotifyId || '';
            const data = await adapter.loadAlbum({ albumId, sort: state.sort });
            state.album = data?.album || null;
            state.userReview = data?.userReview || null;
            state.reviews = Array.isArray(data?.reviews) ? data.reviews : [];
            state.loading = false;
            render();
        } catch (err) {
            state.loading = false;
            state.error = err?.message || 'Não foi possível carregar este álbum.';
            render();
        }
    }

    async function shareAlbum() {
        const shareUrl = typeof location !== 'undefined' ? location.href : '';
        try {
            if (navigator.clipboard?.writeText && shareUrl) {
                await navigator.clipboard.writeText(shareUrl);
                notify('Link do álbum copiado para a área de transferência.');
                return;
            }
        } catch {}
        notify('Compartilhamento indisponível neste navegador.');
    }

    on(contentEl, 'change', event => {
        if (event.target.id !== 'album-sort') return;
        state.sort = event.target.value;
        load();
    });

    on(document, 'click', async event => {
        const target = event.target.closest('button, a');
        if (!target) return;
        if (target.hasAttribute('data-expand-cover')) { openCoverModal(); return; }
        if (target.hasAttribute('data-close-cover')) { coverDialog.close(); return; }
        if (target.hasAttribute('data-share-album')) { await shareAlbum(); return; }
        if (target.hasAttribute('data-retry-album')) { load(); return; }
        if (target.hasAttribute('data-request-delete')) {
            state.confirmingDelete = true;
            render();
            contentEl.querySelector('[data-confirm-delete]')?.focus();
            return;
        }
        if (target.hasAttribute('data-cancel-delete')) {
            state.confirmingDelete = false;
            render();
            return;
        }
        if (target.hasAttribute('data-confirm-delete')) {
            const id = state.userReview?.reviewId;
            state.confirmingDelete = false;
            if (id != null && adapter.deleteReview) {
                await adapter.deleteReview(id);
                state.userReview = null;
                notify('Sua avaliação foi excluída.');
                render();
            }
            return;
        }
        if (target.dataset.like || target.dataset.comments) {
            return;
        }
        if (target.dataset.navigation) {
            const key = target.dataset.navigation;
            if (key === 'review' && state.album) {
                window.location.assign(buildReviewHref(state.album, adapter));
                return;
            }
            if (drawer.open) drawer.close();
            notify(key === 'notifications' ? 'Notificações estarão disponíveis em breve.' : 'Esta funcionalidade ainda não está disponível neste frontend.');
            return;
        }
        if (target.dataset.unavailable) {
            notify(`${target.dataset.unavailable} ainda não está disponível neste frontend.`);
        }
    });

    on(trigger, 'click', () => {
        drawer.innerHTML = `<header class="drawer-heading"><a class="brand" href="${e(adapter.routes?.home || 'feed.html')}"><svg width="95" height="24" viewBox="0 0 95 24" aria-label="Sonarfy"><use href="../assets/logos/sonarfy-mobile.svg#logo"></use></svg></a><button class="profile-icon-button" id="close-menu" aria-label="Fechar">${icon('close')}</button></header>${sidebar(false, adapter.routes, null)}`;
        drawer.showModal();
        document.body.classList.add('profile-modal-open');
        trigger.setAttribute('aria-expanded', 'true');
        drawer.querySelector('#close-menu')?.addEventListener('click', () => drawer.close(), { once: true });
        drawer.querySelector('#close-menu')?.focus();
    });

    on(drawer, 'click', event => {
        if (event.target !== drawer) return;
        const box = drawer.getBoundingClientRect();
        if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) drawer.close();
    });

    on(drawer, 'close', () => {
        document.body.classList.remove('profile-modal-open');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.focus();
    });

    on(coverDialog, 'click', event => {
        if (event.target === coverDialog) coverDialog.close();
    });

    on(coverDialog, 'close', () => {
        document.body.classList.remove('profile-modal-open');
        contentEl.querySelector('[data-expand-cover]')?.focus();
    });

    on(document, 'error', event => {
        if (event.target.matches?.('[data-image-fallback]')) {
            const parent = event.target.parentElement;
            event.target.remove();
            if (parent) parent.textContent = (state.album?.name || 'S').slice(0, 2).toUpperCase();
        }
    }, { capture: true });

    const ready = load();
    return {
        state,
        ready,
        destroy() {
            controller.abort();
        }
    };
}

if (document.getElementById('album-main')) mountAlbumPage();
