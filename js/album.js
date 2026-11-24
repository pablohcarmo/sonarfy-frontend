import { createAlbumFixturesAdapter } from './album-fixtures.js';
import { createHttpAlbumAdapter, formatReleaseDate } from './album-http.js';
import { globalHeader, globalFooter, sidebar } from './profile-shell.js';
import { cover, socialActions, stars } from './profile-views.js';
import { icon } from './profile-icons.js';
import { containFocus } from './profile-dialogs.js';
import { escapeHTML as e, limits, safeImage, validateReview } from './profile-utils.js';

const SORT_OPTIONS = [
    ['recent', 'Ordenar: Mais recentes'],
    ['oldest', 'Ordenar: Mais antigas'],
    ['highest', 'Ordenar: Maior nota'],
    ['lowest', 'Ordenar: Menor nota']
];

const REVIEWS_DIRTY_KEY = 'sonarfy_reviews_dirty';

// Read album identifier and optional preview metadata from query parameters.
export function readAlbumFromSearch(search = typeof location !== 'undefined' ? location.search : '') {
    const params = new URLSearchParams(search);
    const spotifyId = params.get('albumId') || params.get('id') || params.get('spotifyId') || '';
    const name = params.get('title') || params.get('name') || '';
    const artist = params.get('artist') || '';
    const releaseYear = params.get('year') || '';
    const tracksRaw = params.get('tracks');
    const trackCount = tracksRaw && /^\d+$/.test(tracksRaw) ? Number(tracksRaw) : null;
    const coverUrl = params.get('cover') || null;
    const override = {};
    if (spotifyId) override.spotifyId = spotifyId.trim();
    if (name) override.name = name;
    if (artist) override.artist = artist;
    if (releaseYear) override.releaseYear = releaseYear;
    if (trackCount !== null) override.trackCount = trackCount;
    if (coverUrl) override.coverUrl = coverUrl;
    return Object.keys(override).length ? override : null;
}

// Resolve host-injected adapter, explicit demo/scenario mode, or default HTTP adapter.
export function resolveAlbumAdapter(integration = globalThis.sonarfyAlbumAdapter) {
    if (integration) return integration;
    const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
    const scenario = params.get('scenario');
    if (params.get('demo') === 'true' || scenario) {
        return createAlbumFixturesAdapter({ scenario: scenario || 'rated', albumOverride: readAlbumFromSearch() });
    }
    return createHttpAlbumAdapter();
}

// Format a 0..5 star rating with Brazilian decimal comma preserving quarter-star precision when present.
export function formatRatingComma(value) {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return '0,0';
    const rounded = Math.round(num * 100) / 100;
    const formatted = Math.abs(rounded * 10 - Math.round(rounded * 10)) < 1e-6
        ? rounded.toFixed(1)
        : String(rounded);
    return formatted.replace('.', ',');
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
    const tracks = album?.totalTracks ?? album?.trackCount;
    if (typeof tracks === 'number' && Number.isInteger(tracks) && tracks > 0) params.set('tracks', String(tracks));
    if (album?.coverUrl) params.set('cover', album.coverUrl);
    const qs = params.toString();
    return qs ? `${path}?${qs}` : path;
}

// Build the canonical Sonarfy album page URL for sharing.
export function buildAlbumShareUrl(album, adapter, loc = typeof location !== 'undefined' ? location : null) {
    if (!loc?.href) return '';
    if (!album?.spotifyId) return loc.href;
    try {
        const url = new URL(loc.href);
        url.search = '';
        url.hash = '';
        if (adapter?.isDemo) url.searchParams.set('demo', 'true');
        url.searchParams.set('albumId', album.spotifyId);
        return url.href;
    } catch {
        return loc.href;
    }
}

function renderCoverContent(album) {
    const src = safeImage(album?.coverUrl || album?.cover);
    const initials = e((album?.name || 'S').slice(0, 2).toUpperCase());
    return src ? `<img src="${src}" alt="Capa de ${e(album.name)}" data-image-fallback>` : `<span aria-hidden="true">${initials}</span>`;
}

function renderSubmeta(album) {
    const parts = [];
    const releaseText = album?.releaseLabel
        || formatReleaseDate(album?.releaseOn, album?.releasePrecision)
        || (album?.releaseYear ? String(album.releaseYear) : '');
    if (releaseText) parts.push(releaseText);
    const tracks = album?.totalTracks ?? album?.trackCount;
    if (typeof tracks === 'number' && Number.isInteger(tracks) && tracks >= 0) {
        parts.push(`${tracks} ${tracks === 1 ? 'faixa' : 'faixas'}`);
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
    const rawAvg = Number(album.averageRating);
    const avg = (Math.round(rawAvg * 10) / 10).toFixed(1);
    const isZero = rawAvg <= 0;
    return `<div class="album-community-rating" aria-label="Nota média ${e(avg)} de 5 com ${count} ${count === 1 ? 'avaliação' : 'avaliações'}">
        <span class="album-rating-average">${e(avg)}</span>
        <span class="album-stars${isZero ? ' is-empty' : ''}" aria-hidden="true">${formatStarsText(rawAvg)}</span>
        <span class="album-rating-count">${e(countLabel)}</span>
    </div>`;
}

function renderHeroCard(album, userReview) {
    const submeta = renderSubmeta(album);
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
                    <button type="button" class="album-primary-cta" data-open-review-modal data-rate-album data-rated="${String(Boolean(userReview))}">${e(ctaLabel)}</button>
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

function formatAuthorLine(review) {
    const name = review.authorName || 'Você';
    const handlePart = review.authorHandle ? ` @${review.authorHandle}` : '';
    const datePart = review.publishedLabel ? ` · ${review.publishedLabel}` : '';
    return `${name}${handlePart}${datePart}`;
}

function renderMyReviewCard(userReview, confirmingDelete, deleting) {
    const authorLine = formatAuthorLine(userReview);
    const actionsHtml = confirmingDelete
        ? `<div class="album-my-review-actions">
            <button type="button" class="album-confirm-delete" data-confirm-delete ${deleting ? 'disabled' : ''}>${deleting ? 'Excluindo...' : 'Confirmar exclusão'}</button>
            <button type="button" class="album-cancel-delete" data-cancel-delete ${deleting ? 'disabled' : ''}>Cancelar</button>
        </div>`
        : `<div class="album-my-review-actions">
            <button type="button" class="album-icon-action" data-open-review-modal aria-label="Editar minha avaliação">
                <img class="theme-light-only" src="../assets/icons/album/edit-light.svg" width="36" height="36" alt="" aria-hidden="true">
                <img class="theme-dark-only" src="../assets/icons/album/edit-dark.svg" width="36" height="36" alt="" aria-hidden="true">
            </button>
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
    const authorLine = formatAuthorLine(review);
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

function readDirtyMarker() {
    try { return localStorage.getItem(REVIEWS_DIRTY_KEY) || ''; } catch { return ''; }
}

function markReviewsDirty() {
    const marker = String(Date.now());
    try { localStorage.setItem(REVIEWS_DIRTY_KEY, marker); } catch {}
    return marker;
}

// Mount the Album Page with shared shell, backend details, own review lifecycle, and expanded cover modal.
export function mountAlbumPage(options = {}) {
    const adapter = options.adapter || resolveAlbumAdapter();
    const headerEl = document.querySelector('.profile-global-header');
    const sidebarEl = document.querySelector('#profile-sidebar');
    const footerEl = document.querySelector('.profile-footer');
    const drawer = document.querySelector('#profile-drawer');
    const coverDialog = document.querySelector('#album-cover-dialog');
    const reviewDialog = document.querySelector('#album-review-dialog');
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
    if (reviewDialog) containFocus(reviewDialog, controller.signal);
    let reviewDialogTrigger = null;
    let savingReview = false;

    const state = {
        loading: true,
        error: '',
        errorStatus: null,
        retryable: true,
        retryAfterUntil: 0,
        albumId: readAlbumFromSearch()?.spotifyId || '',
        album: null,
        userReview: null,
        reviews: [],
        nextCursor: null,
        communityLoading: false,
        loadingMore: false,
        communityError: '',
        communityReviewsAvailable: adapter.communityReviewsAvailable !== false,
        sort: 'recent',
        confirmingDelete: false,
        deleting: false
    };

    let requestToken = 0;
    let activeController = null;
    let communityRequestToken = 0;
    let communityController = null;
    let retryTimer = null;
    let lastDirtyMarker = readDirtyMarker();

    const notify = text => { if (statusEl) statusEl.textContent = text; };

    function remainingRetrySeconds() {
        return Math.max(0, Math.ceil((state.retryAfterUntil - Date.now()) / 1000));
    }

    function stopRetryTimer() {
        if (retryTimer) {
            clearInterval(retryTimer);
            retryTimer = null;
        }
    }

    function startRetryTimer() {
        stopRetryTimer();
        if (remainingRetrySeconds() <= 0) return;
        retryTimer = setInterval(() => {
            if (remainingRetrySeconds() <= 0) {
                state.retryAfterUntil = 0;
                stopRetryTimer();
            }
            if (state.error && !state.album) render();
        }, 1000);
    }

    function renderErrorState() {
        const heading = state.errorStatus === 404
            ? 'Álbum não encontrado'
            : state.errorStatus === 400
                ? 'Identificador do álbum inválido'
                : 'Não foi possível carregar o álbum';
        const remaining = remainingRetrySeconds();
        const fallbackHref = adapter.routes?.echoes || adapter.routes?.home || 'echoes.html';
        const actionHtml = state.retryable
            ? `<button type="button" class="album-primary-cta" data-retry-album ${remaining > 0 ? 'disabled' : ''}>${remaining > 0 ? `Aguarde ${remaining}s` : 'Tentar novamente'}</button>`
            : `<a class="album-primary-cta" href="${e(fallbackHref)}">Voltar para Ecos</a>`;

        contentEl.innerHTML = `<section class="album-error-card" role="alert">
            <h2>${e(heading)}</h2>
            <p>${e(state.error || 'Tente novamente em instantes.')}</p>
            ${actionHtml}
        </section>`;
    }

    function render() {
        if (state.loading) {
            contentEl.innerHTML = renderLoadingSkeleton();
            return;
        }
        if (state.error || !state.album) {
            renderErrorState();
            return;
        }

        const communityAvailable = state.communityReviewsAvailable !== false && adapter.communityReviewsAvailable !== false;
        const hasReviews = communityAvailable && state.reviews.length > 0;
        const showSort = communityAvailable && (hasReviews || state.communityLoading || Boolean(state.communityError));
        const sortHtml = showSort
            ? `<div class="album-sort-pill"><select id="album-sort" class="album-sort-select" aria-label="Ordenar avaliações" ${state.communityLoading ? 'disabled' : ''}>${SORT_OPTIONS.map(([val, label]) => `<option value="${val}"${state.sort === val ? ' selected' : ''}>${e(label)}</option>`).join('')}</select></div>`
            : '';
        const reviewSkeleton = `<div class="album-review-card" aria-hidden="true">
            <div class="album-sk album-sk-header"></div>
            <div class="album-sk album-sk-line"></div>
            <div class="album-sk album-sk-line-short"></div>
        </div>`;
        let reviewsBody = '';
        if (!communityAvailable) {
            reviewsBody = `<div class="album-empty-card album-unavailable-card" data-community-unavailable>
                <h3>Avaliações da comunidade em breve</h3>
                <p>A listagem de avaliações da comunidade para este álbum ainda não está disponível.</p>
            </div>`;
        } else if (state.communityLoading) {
            reviewsBody = reviewSkeleton.repeat(3);
        } else if (state.communityError && !hasReviews) {
            reviewsBody = `<div class="album-error-card" role="alert">
                <h2>Não foi possível carregar as avaliações</h2>
                <p>${e(state.communityError)}</p>
                <button type="button" class="album-primary-cta" data-retry-community>Tentar novamente</button>
            </div>`;
        } else if (hasReviews) {
            const inlineErrorHtml = state.communityError
                ? `<div class="album-community-inline-error" role="alert">
                    <p>${e(state.communityError)}</p>
                    <button type="button" class="album-load-more-btn" data-retry-community>Tentar novamente</button>
                </div>`
                : '';
            const loadMoreHtml = state.nextCursor
                ? `<div class="album-load-more-row">
                    <button type="button" class="album-load-more-btn" data-load-more-reviews ${state.loadingMore ? 'disabled' : ''}>${state.loadingMore ? 'Carregando...' : 'Carregar mais avaliações'}</button>
                </div>`
                : '';
            reviewsBody = `${state.reviews.map(renderReviewCard).join('')}${inlineErrorHtml}${loadMoreHtml}`;
        } else {
            reviewsBody = `<div class="album-empty-card">
                <h3>Nenhuma avaliação para este álbum ainda</h3>
                <p>Seja o primeiro a compartilhar o que achou deste disco.</p>
                <button type="button" class="album-primary-cta" data-open-review-modal>Avaliar agora</button>
            </div>`;
        }

        contentEl.innerHTML = `${renderHeroCard(state.album, state.userReview)}
            ${state.userReview ? renderMyReviewCard(state.userReview, state.confirmingDelete, state.deleting) : ''}
            <section class="album-reviews-section" aria-labelledby="community-reviews-heading">
                <div class="album-section-header">
                    <h2 id="community-reviews-heading" class="album-section-title">Avaliações da Comunidade</h2>
                    ${sortHtml}
                </div>
                <div class="album-reviews-stack"${state.communityLoading ? ' aria-busy="true"' : ''}>${reviewsBody}</div>
            </section>`;
    }

    // Open the inline review modal (matching Profile Collection edit modal) to create or edit own review on the Album Page.
    function openReviewModal() {
        if (!state.album || !reviewDialog) return;
        const isEditing = Boolean(state.userReview?.reviewId != null);
        const canSave = isEditing
            ? typeof adapter.updateReview === 'function'
            : typeof adapter.createReview === 'function';
        if (!canSave) {
            notify('Não é possível salvar avaliações neste modo.');
            return;
        }
        reviewDialogTrigger = document.activeElement;
        const draft = {
            rating: isEditing ? Math.max(0, Math.min(5, Math.round((Number(state.userReview.rating) || 0) * 4) / 4)) : 0,
            review: isEditing ? (state.userReview.reviewText || '') : ''
        };
        const headingTitle = isEditing ? 'Editar avaliação do álbum' : 'Avaliar álbum';
        const albumHeader = `<div class="expanded-album">${cover({
            title: state.album.name,
            artist: state.album.artist,
            cover: state.album.coverUrl || state.album.cover
        })}<div><strong>${e(state.album.name)}</strong>${state.album.artist ? `<p>${e(state.album.artist)}</p>` : ''}</div></div>`;

        reviewDialog.innerHTML = `<header class="dialog-heading">${albumHeader}<h2 id="album-review-dialog-title" class="visually-hidden">${e(headingTitle)}</h2><button type="button" class="profile-icon-button" data-close-review-dialog aria-label="Fechar">${icon('close')}</button></header>
            <form id="edit-review-form" class="expanded-edit-form">
                <div class="expanded-rating">
                    <div id="edit-review-stars-preview" tabindex="0" role="slider" aria-label="Nota do álbum de 0 a 5 estrelas" aria-valuemin="0" aria-valuemax="5" aria-valuenow="${draft.rating}">${stars(draft.rating)}</div>
                    <span class="album-rating-badge" id="edit-review-rating-badge">${e(formatRatingComma(draft.rating))}</span>
                    <input id="edit-review-rating" name="rating" type="hidden" value="${draft.rating}">
                </div>
                <textarea id="edit-review-text" name="review" class="expanded-review-textarea" aria-label="Resenha" placeholder="Compartilhe o que você achou deste álbum (opcional)..." maxlength="${limits.review}" rows="5">${e(draft.review)}</textarea>
                <div class="expanded-review-actions">
                    <button type="submit" class="expanded-review-save" id="save-review">Salvar</button>
                </div>
            </form>
            <p class="dialog-status" role="status" aria-live="polite"></p>`;

        const form = reviewDialog.querySelector('#edit-review-form');
        const ratingInput = form.elements.rating;
        const starsPreview = reviewDialog.querySelector('#edit-review-stars-preview');
        const ratingBadge = reviewDialog.querySelector('#edit-review-rating-badge');
        const reviewInput = form.elements.review;
        const dialogStatus = reviewDialog.querySelector('.dialog-status');
        const setDialogStatus = message => { if (dialogStatus) dialogStatus.textContent = message; };

        const syncRating = next => {
            draft.rating = Math.max(0, Math.min(5, Math.round(Number(next) * 4) / 4));
            ratingInput.value = String(draft.rating);
            starsPreview.innerHTML = stars(draft.rating);
            starsPreview.setAttribute('aria-valuenow', String(draft.rating));
            if (ratingBadge) ratingBadge.textContent = formatRatingComma(draft.rating);
        };

        starsPreview.addEventListener('click', event => {
            if (savingReview) return;
            const starEls = [...starsPreview.querySelectorAll('.profile-star')];
            const clicked = event.target.closest('.profile-star');
            const idx = starEls.indexOf(clicked);
            if (idx === -1) return;
            const rect = clicked.getBoundingClientRect();
            const isHalf = rect.width > 0 && (event.clientX - rect.left) < rect.width / 2;
            syncRating(idx + (isHalf ? 0.5 : 1));
        });

        starsPreview.addEventListener('keydown', event => {
            if (savingReview) return;
            if (!['ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            let next = draft.rating;
            if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = Math.min(5, next + 0.5);
            else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = Math.max(0, next - 0.5);
            else if (event.key === 'Home') next = 0;
            else if (event.key === 'End') next = 5;
            syncRating(next);
        });

        reviewInput.addEventListener('input', () => {
            const value = Array.from(reviewInput.value).slice(0, limits.review).join('');
            reviewInput.value = value;
            draft.review = value;
        });

        form.addEventListener('submit', async event => {
            event.preventDefault();
            if (savingReview) return;
            draft.rating = Math.max(0, Math.min(5, Math.round(Number(ratingInput.value) * 4) / 4));
            draft.review = Array.from(reviewInput.value).slice(0, limits.review).join('');
            try { validateReview(draft.review); } catch (err) { setDialogStatus(err.message); return; }
            savingReview = true;
            const controls = [...reviewDialog.querySelectorAll('button, input, textarea')];
            controls.forEach(c => { c.disabled = true; });
            setDialogStatus('Salvando avaliação…');
            try {
                const saved = state.userReview?.reviewId != null
                    ? await adapter.updateReview(state.userReview.reviewId, { rating: draft.rating, reviewText: draft.review })
                    : await adapter.createReview(state.album.spotifyId, { rating: draft.rating, reviewText: draft.review });
                lastDirtyMarker = markReviewsDirty();
                savingReview = false;
                reviewDialog.close();
                if (!adapter.isDemo) {
                    await load();
                } else {
                    state.userReview = saved || {
                        reviewId: state.userReview?.reviewId ?? Date.now(),
                        rating: draft.rating,
                        reviewText: draft.review,
                        publishedLabel: 'Agora'
                    };
                    render();
                }
            } catch (err) {
                savingReview = false;
                controls.forEach(c => { c.disabled = false; });
                if (err?.status === 409 && err.existingReview) {
                    state.userReview = err.existingReview;
                    syncRating(err.existingReview.rating ?? draft.rating);
                    reviewInput.value = err.existingReview.reviewText || '';
                    draft.review = reviewInput.value;
                }
                setDialogStatus(err?.message || 'Não foi possível salvar a avaliação. Tente novamente.');
            }
        });

        if (!reviewDialog.open) reviewDialog.showModal();
        document.body.classList.add('profile-modal-open');
        reviewInput.focus();
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

    function resetState() {
        activeController?.abort();
        activeController = null;
        communityController?.abort();
        communityController = null;
        requestToken += 1;
        communityRequestToken += 1;
        stopRetryTimer();
        state.loading = false;
        state.error = '';
        state.errorStatus = null;
        state.retryable = true;
        state.retryAfterUntil = 0;
        state.album = null;
        state.userReview = null;
        state.reviews = [];
        state.nextCursor = null;
        state.communityLoading = false;
        state.loadingMore = false;
        state.communityError = '';
        state.confirmingDelete = false;
        state.deleting = false;
    }

    async function loadCommunity({ append = false } = {}) {
        if (!state.album || typeof adapter.fetchCommunityReviews !== 'function') {
            if (!append) await load();
            return;
        }
        if (append && (state.loadingMore || !state.nextCursor)) return;

        communityController?.abort();
        communityController = new AbortController();
        const { signal } = communityController;
        const token = ++communityRequestToken;
        const sessionKey = typeof adapter.getSessionKey === 'function' ? adapter.getSessionKey() : null;
        const albumId = state.album.spotifyId || state.albumId;

        state.communityError = '';
        if (append) {
            state.loadingMore = true;
        } else {
            state.communityLoading = true;
            state.nextCursor = null;
        }
        render();

        try {
            const page = await adapter.fetchCommunityReviews(albumId, {
                sort: state.sort,
                cursor: append ? state.nextCursor : null,
                signal
            });
            if (token !== communityRequestToken || signal.aborted || controller.signal.aborted) return;
            if (typeof adapter.getSessionKey === 'function' && adapter.getSessionKey() !== sessionKey) return;

            const incoming = Array.isArray(page?.items) ? page.items : [];
            if (append) {
                const seen = new Set(state.reviews.map(item => String(item.reviewId)));
                state.reviews = [...state.reviews, ...incoming.filter(item => !seen.has(String(item.reviewId)))];
            } else {
                state.reviews = incoming;
            }
            state.nextCursor = typeof page?.nextCursor === 'string' && page.nextCursor ? page.nextCursor : null;
            state.communityLoading = false;
            state.loadingMore = false;
            state.communityError = '';
            render();
        } catch (err) {
            if (token !== communityRequestToken || signal.aborted || controller.signal.aborted || err?.name === 'AbortError') return;
            if (err?.code === 'SESSION_CHANGED') {
                resetState();
                if (typeof adapter.getSessionKey === 'function' && adapter.getSessionKey()) load();
                return;
            }
            if (err?.status === 401 && !adapter.isDemo) {
                resetState();
                state.error = err.message || 'Sessão expirada. Entre novamente.';
                state.errorStatus = 401;
                state.retryable = false;
                render();
                return;
            }
            if (append && err?.status === 400) {
                state.loadingMore = false;
                state.nextCursor = null;
                await loadCommunity({ append: false });
                return;
            }
            state.communityLoading = false;
            state.loadingMore = false;
            state.communityError = err?.message || 'Não foi possível carregar as avaliações da comunidade.';
            render();
        }
    }

    async function load({ preserveStatus = false } = {}) {
        activeController?.abort();
        activeController = new AbortController();
        communityController?.abort();
        communityController = null;
        communityRequestToken += 1;
        const { signal } = activeController;
        const token = ++requestToken;
        const albumId = readAlbumFromSearch()?.spotifyId || '';
        const sessionKey = typeof adapter.getSessionKey === 'function' ? adapter.getSessionKey() : null;

        state.albumId = albumId;
        state.loading = true;
        state.error = '';
        state.errorStatus = null;
        state.retryable = true;
        state.nextCursor = null;
        state.communityLoading = false;
        state.loadingMore = false;
        state.communityError = '';
        state.confirmingDelete = false;
        if (!preserveStatus) notify('');
        render();

        try {
            const data = await adapter.loadAlbum({ albumId, sort: state.sort, signal });
            if (token !== requestToken || signal.aborted || controller.signal.aborted) return;
            if (typeof adapter.getSessionKey === 'function' && adapter.getSessionKey() !== sessionKey) return;

            state.album = data?.album || null;
            state.userReview = data?.userReview || null;
            state.reviews = Array.isArray(data?.reviews) ? data.reviews : [];
            state.nextCursor = typeof data?.nextCursor === 'string' && data.nextCursor ? data.nextCursor : null;
            state.communityError = typeof data?.communityReviewsError === 'string' ? data.communityReviewsError : '';
            state.communityReviewsAvailable = data?.communityReviewsAvailable !== undefined
                ? Boolean(data.communityReviewsAvailable)
                : adapter.communityReviewsAvailable !== false;
            state.retryAfterUntil = 0;
            stopRetryTimer();
            state.loading = false;
            lastDirtyMarker = readDirtyMarker();
            if (data?.userReviewError && !preserveStatus) {
                notify(data.userReviewError);
            }
            render();
        } catch (err) {
            if (token !== requestToken || signal.aborted || controller.signal.aborted || err?.name === 'AbortError') return;
            if (err?.code === 'SESSION_CHANGED') {
                resetState();
                if (typeof adapter.getSessionKey === 'function' && adapter.getSessionKey()) {
                    load();
                }
                return;
            }
            if (err?.status === 401 && !adapter.isDemo) {
                resetState();
                state.error = err.message || 'Sessão expirada. Entre novamente.';
                state.errorStatus = 401;
                state.retryable = false;
                render();
                return;
            }
            state.loading = false;
            state.album = null;
            state.userReview = null;
            state.reviews = [];
            state.error = err?.message || 'Não foi possível carregar este álbum.';
            state.errorStatus = err?.status ?? null;
            state.retryable = err?.retryable !== undefined ? Boolean(err.retryable) : (err?.status !== 400 && err?.status !== 404);
            if (typeof err?.retryAfterSeconds === 'number' && err.retryAfterSeconds > 0) {
                state.retryAfterUntil = Date.now() + err.retryAfterSeconds * 1000;
                startRetryTimer();
            } else {
                state.retryAfterUntil = 0;
                stopRetryTimer();
            }
            render();
        }
    }

    async function shareAlbum() {
        const shareUrl = buildAlbumShareUrl(state.album, adapter);
        if (!shareUrl) {
            notify('Compartilhamento indisponível neste navegador.');
            return;
        }
        if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
            try {
                await navigator.share({
                    title: state.album?.name ? `${state.album.name} – Sonarfy` : 'Sonarfy',
                    text: state.album?.artist
                        ? `${state.album.name} por ${state.album.artist} no Sonarfy`
                        : (state.album?.name || 'Confira este álbum no Sonarfy'),
                    url: shareUrl
                });
                notify('Álbum compartilhado.');
                return;
            } catch (err) {
                if (err?.name === 'AbortError') return;
            }
        }
        try {
            if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
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
        state.nextCursor = null;
        loadCommunity({ append: false });
    });

    on(document, 'click', async event => {
        const target = event.target.closest('button, a');
        if (!target) return;
        if (target.hasAttribute('data-open-review-modal')) { openReviewModal(); return; }
        if (target.hasAttribute('data-close-review-dialog')) { if (!savingReview) reviewDialog?.close(); return; }
        if (target.hasAttribute('data-expand-cover')) { openCoverModal(); return; }
        if (target.hasAttribute('data-close-cover')) { coverDialog.close(); return; }
        if (target.hasAttribute('data-share-album')) { await shareAlbum(); return; }
        if (target.hasAttribute('data-retry-album')) {
            if (remainingRetrySeconds() > 0) return;
            load();
            return;
        }
        if (target.hasAttribute('data-load-more-reviews')) {
            loadCommunity({ append: true });
            return;
        }
        if (target.hasAttribute('data-retry-community')) {
            loadCommunity({ append: state.reviews.length > 0 && Boolean(state.nextCursor) });
            return;
        }
        if (target.hasAttribute('data-request-delete')) {
            state.confirmingDelete = true;
            render();
            contentEl.querySelector('[data-confirm-delete]')?.focus();
            return;
        }
        if (target.hasAttribute('data-cancel-delete')) {
            if (state.deleting) return;
            state.confirmingDelete = false;
            render();
            return;
        }
        if (target.hasAttribute('data-confirm-delete')) {
            if (state.deleting) return;
            const id = state.userReview?.reviewId;
            if (id == null || !adapter.deleteReview) {
                state.confirmingDelete = false;
                render();
                return;
            }
            state.deleting = true;
            render();
            try {
                await adapter.deleteReview(id);
                lastDirtyMarker = markReviewsDirty();
                state.userReview = null;
                state.confirmingDelete = false;
                state.deleting = false;
                notify('Sua avaliação foi excluída.');
                if (!adapter.isDemo) {
                    await load({ preserveStatus: true });
                } else {
                    render();
                }
            } catch (err) {
                state.deleting = false;
                state.confirmingDelete = false;
                render();
                notify(err?.message || 'Não foi possível excluir sua avaliação.');
            }
            return;
        }
        if (target.dataset.like || target.dataset.comments) {
            return;
        }
        if (target.dataset.navigation) {
            const key = target.dataset.navigation;
            if (key === 'review') {
                if (state.album) {
                    openReviewModal();
                } else {
                    window.location.assign(adapter.routes?.echoes || 'echoes.html');
                }
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

    if (reviewDialog) {
        on(reviewDialog, 'click', event => {
            if (event.target === reviewDialog && !savingReview) reviewDialog.close();
        });
        on(reviewDialog, 'cancel', event => {
            if (savingReview) event.preventDefault();
        });
        on(reviewDialog, 'close', () => {
            document.body.classList.remove('profile-modal-open');
            if (reviewDialogTrigger?.isConnected) reviewDialogTrigger.focus();
            else contentEl.querySelector('[data-open-review-modal]')?.focus();
        });
    }

    on(document, 'error', event => {
        if (event.target.matches?.('[data-image-fallback]')) {
            const parent = event.target.parentElement;
            event.target.remove();
            if (parent) parent.textContent = (state.album?.name || 'S').slice(0, 2).toUpperCase();
        }
    }, { capture: true });

    // Reload when navigating to another album in the same document.
    on(window, 'popstate', () => {
        const nextId = readAlbumFromSearch()?.spotifyId || '';
        if (nextId !== state.albumId) {
            resetState();
            load();
        }
    });

    // Revalidate when returning via browser history/bfcache or after review mutations.
    on(window, 'pageshow', event => {
        if (adapter.isDemo) return;
        const currentDirty = readDirtyMarker();
        const dirtyChanged = currentDirty && currentDirty !== lastDirtyMarker;
        if (!event.persisted && !dirtyChanged) return;
        const sessionKey = typeof adapter.getSessionKey === 'function' ? adapter.getSessionKey() : null;
        if (typeof adapter.getSessionKey === 'function' && !sessionKey) {
            resetState();
            render();
            return;
        }
        load();
    });

    // React to account/session switches and review updates from other tabs.
    on(window, 'storage', event => {
        if (adapter.isDemo) return;
        if (event.key === 'sonarfy_token' || event.key === null) {
            resetState();
            if (typeof adapter.getSessionKey === 'function' && adapter.getSessionKey()) {
                load();
            } else {
                state.error = 'Sessão encerrada. Entre novamente.';
                state.errorStatus = 401;
                state.retryable = false;
                render();
            }
            return;
        }
        if (event.key === REVIEWS_DIRTY_KEY) {
            lastDirtyMarker = readDirtyMarker();
            load();
        }
    });

    let authChannel = null;
    if (!adapter.isDemo && typeof BroadcastChannel === 'function') {
        try {
            authChannel = new BroadcastChannel('sonarfy_auth');
            authChannel.addEventListener('message', event => {
                if (event.data?.type === 'logout') {
                    resetState();
                    state.error = 'Sessão encerrada. Entre novamente.';
                    state.errorStatus = 401;
                    state.retryable = false;
                    render();
                }
            });
        } catch {}
    }

    const ready = load();
    return {
        state,
        ready,
        reload: load,
        destroy() {
            activeController?.abort();
            communityController?.abort();
            stopRetryTimer();
            authChannel?.close();
            controller.abort();
        }
    };
}

if (document.getElementById('album-main')) mountAlbumPage();
