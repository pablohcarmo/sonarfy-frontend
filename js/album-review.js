import { createAlbumReviewFixturesAdapter, demoAlbum } from './album-review-fixtures.js';
import { createHttpAlbumReviewAdapter } from './album-review-http.js';
import { globalHeader, globalFooter, sidebar } from './profile-shell.js';
import { icon } from './profile-icons.js';
import { containFocus } from './profile-dialogs.js';
import { escapeHTML as e, safeImage } from './profile-utils.js';

const MAX_REVIEW_CHARS = 255;

// Resolve host adapter, explicit demo/scenario query mode, or default HTTP adapter.
export function resolveAlbumReviewAdapter(integration = globalThis.sonarfyAlbumReviewAdapter) {
    if (integration) return integration;
    const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
    const scenario = params.get('scenario');
    if (params.get('demo') === 'true' || scenario) {
        return createAlbumReviewFixturesAdapter({ scenario: scenario || 'default' });
    }
    return createHttpAlbumReviewAdapter();
}

// Count Unicode code points to stay aligned with backend validation.
export function countReviewChars(text) {
    return [...String(text || '')].length;
}

// Format 0..5 star value using Brazilian decimal comma (e.g., 4,5).
export function formatRatingBadge(rating) {
    const num = Number(rating);
    if (!Number.isFinite(num) || num <= 0) return '0,0';
    const rounded = Math.round(num * 100) / 100;
    const formatted = Number.isInteger(rounded) ? rounded.toFixed(1) : String(rounded);
    return formatted.replace('.', ',');
}

function readAlbumFromSearch(search = typeof location !== 'undefined' ? location.search : '') {
    const params = new URLSearchParams(search);
    const spotifyId = params.get('albumId') || params.get('id') || '';
    const name = params.get('title') || params.get('name') || '';
    const artist = params.get('artist') || '';
    const releaseYear = params.get('year') || '';
    const trackCountRaw = params.get('tracks');
    const trackCount = trackCountRaw && /^\d+$/.test(trackCountRaw) ? Number(trackCountRaw) : null;
    const coverUrl = params.get('cover') || null;
    if (!spotifyId && !name) return null;
    return { spotifyId, name: name || 'Álbum selecionado', artist, releaseYear, trackCount, coverUrl };
}

function starIconSrc(slotIndex, rating) {
    if (rating >= slotIndex) return '../assets/icons/album-review/star-full.svg';
    if (rating >= slotIndex - 0.5) return '../assets/icons/album-review/star-half.svg';
    return '../assets/icons/album-review/star-empty.svg';
}

function renderStarsMarkup(rating) {
    const slots = [1, 2, 3, 4, 5].map(slot => {
        const halfVal = slot - 0.5;
        const fullVal = slot;
        const halfLabel = `${formatRatingBadge(halfVal)} de 5 estrelas`;
        const fullLabel = `${formatRatingBadge(fullVal)} de 5 estrelas`;
        return `<div class="star-slot">
            <img class="star-slot-icon" src="${starIconSrc(slot, rating)}" width="32" height="32" alt="" aria-hidden="true">
            <button type="button" class="star-hit star-hit-left" role="radio" aria-checked="${String(rating === halfVal)}" aria-label="${e(halfLabel)}" data-rating-value="${halfVal}"></button>
            <button type="button" class="star-hit star-hit-right" role="radio" aria-checked="${String(rating === fullVal)}" aria-label="${e(fullLabel)}" data-rating-value="${fullVal}"></button>
        </div>`;
    }).join('');
    return `<div class="star-rating-row" role="radiogroup" aria-label="Nota do álbum de 0,5 a 5 estrelas">${slots}<span class="rating-badge" aria-live="polite">${e(formatRatingBadge(rating))}</span></div>`;
}

function renderAlbumSummary(album) {
    const src = safeImage(album.coverUrl || album.cover);
    const mark = e((album.name || 'S').slice(0, 2).toUpperCase());
    const coverHtml = src
        ? `<div class="album-summary-cover"><img src="${src}" alt="Capa de ${e(album.name)}" data-image-fallback></div>`
        : `<div class="album-summary-cover" aria-hidden="true">${mark}</div>`;
    const metaParts = [];
    if (album.releaseYear) metaParts.push(album.releaseYear);
    if (typeof album.trackCount === 'number' && album.trackCount > 0) {
        metaParts.push(`${album.trackCount} ${album.trackCount === 1 ? 'faixa' : 'faixas'}`);
    }
    const metaHtml = metaParts.length ? `<p class="album-summary-meta">${e(metaParts.join(' · '))}</p>` : '';
    const artistHtml = album.artist ? `<p class="album-summary-artist">${e(album.artist)}</p>` : '';
    const spotifyHtml = typeof album.spotifyId === 'string' && album.spotifyId.trim()
        ? `<a class="album-summary-spotify" href="${e(`https://open.spotify.com/album/${encodeURIComponent(album.spotifyId.trim())}`)}" target="_blank" rel="noopener noreferrer" aria-label="Abrir ${e(album.name)} no Spotify"><img src="../assets/icons/account/spotify.svg" width="21" height="21" alt="" aria-hidden="true"><span>Abrir no Spotify</span></a>`
        : '';
    return `<div class="album-summary">${coverHtml}<div class="album-summary-info"><h2 class="album-summary-name">${e(album.name)}</h2>${artistHtml}${metaHtml}${spotifyHtml}</div></div>`;
}

function renderSuccessDialog(albumName, favorited, favoritePending) {
    const favLabel = favorited ? 'Desfavoritar álbum' : 'Favoritar álbum';
    return `<img class="review-success-badge" src="../assets/icons/album-review/success-badge.svg" width="56" height="56" alt="" aria-hidden="true">
        <div class="review-success-header">
            <h2 id="review-success-title">Avaliação publicada!</h2>
            <p>Sua avaliação de <strong>${e(albumName)}</strong> foi publicada com sucesso.</p>
        </div>
        <div class="review-success-actions">
            <button type="button" class="review-btn-primary" data-success-another>Fazer outra avaliação</button>
            <button type="button" class="review-fav-btn${favorited ? ' is-favorited' : ''}" data-toggle-favorite aria-pressed="${String(favorited)}" ${favoritePending ? 'disabled' : ''}>${e(favLabel)}</button>
        </div>`;
}

// Mount Avaliar Álbum page with half-star control, 255-char review, success modal, and shared shell.
export function mountAlbumReview(options = {}) {
    const adapter = options.adapter || resolveAlbumReviewAdapter();
    const headerEl = document.querySelector('.profile-global-header');
    const sidebarEl = document.querySelector('#profile-sidebar');
    const footerEl = document.querySelector('.profile-footer');
    const drawer = document.querySelector('#profile-drawer');
    const successDialog = document.querySelector('#review-success-dialog');
    const demoEl = document.querySelector('#album-review-demo');
    const statusEl = document.querySelector('#album-review-status');
    const contentEl = document.querySelector('#album-review-content');
    if (!headerEl || !sidebarEl || !footerEl || !drawer || !successDialog || !contentEl) return null;

    headerEl.innerHTML = globalHeader(adapter.routes?.home || 'feed.html');
    sidebarEl.innerHTML = sidebar(false, adapter.routes, null);
    footerEl.innerHTML = globalFooter();

    const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
    const scenario = params.get('scenario');
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
    containFocus(successDialog, controller.signal);

    const state = {
        album: readAlbumFromSearch() || { ...demoAlbum },
        reviewId: null,
        rating: 0,
        hasRating: false,
        reviewText: '',
        submitting: false,
        error: '',
        favorited: false,
        favoritePending: false
    };

    const notify = text => { if (statusEl) statusEl.textContent = text; };

    function renderForm() {
        const charCount = countReviewChars(state.reviewText);
        const errorHtml = state.error ? `<p class="review-form-error" role="alert">${e(state.error)}</p>` : '';
        const submitLabel = state.submitting ? 'Publicando...' : state.reviewId ? 'Salvar alterações' : 'Publicar';

        contentEl.innerHTML = `<article class="album-review-card">
            <h1 class="album-review-title">Avaliar Álbum</h1>
            ${renderAlbumSummary(state.album)}
            <div class="review-rating-section">
                <p class="review-field-label">Sua nota</p>
                <p class="review-rating-helper">Clique nas estrelas para avaliar</p>
                ${renderStarsMarkup(state.rating)}
            </div>
            <div class="review-written-section">
                <div class="review-label-row">
                    <label class="review-field-label" for="review-text">Resenha (opcional)</label>
                    <span class="review-char-count" id="review-char-count">${charCount} / ${MAX_REVIEW_CHARS}</span>
                </div>
                <textarea id="review-text" class="review-textarea" maxlength="${MAX_REVIEW_CHARS}" rows="5" placeholder="Compartilhe o que você achou deste álbum...">${e(state.reviewText)}</textarea>
            </div>
            ${errorHtml}
            <div class="review-actions">
                <button type="button" class="review-btn-secondary" data-review-back>Voltar</button>
                <button type="button" class="review-btn-primary" data-review-submit ${state.submitting ? 'disabled' : ''}>${e(submitLabel)}</button>
            </div>
        </article>`;
    }

    function updateStarsOnly(nextRating) {
        state.rating = nextRating;
        state.hasRating = true;
        state.error = '';
        const section = contentEl.querySelector('.review-rating-section');
        if (!section) return renderForm();
        const row = section.querySelector('.star-rating-row');
        if (row) row.outerHTML = renderStarsMarkup(state.rating);
        contentEl.querySelector('.review-form-error')?.remove();
    }

    function openSuccessModal() {
        successDialog.innerHTML = renderSuccessDialog(state.album.name, state.favorited, state.favoritePending);
        if (!successDialog.open) successDialog.showModal();
        document.body.classList.add('profile-modal-open');
        successDialog.querySelector('[data-success-another]')?.focus();
    }

    async function loadInitial() {
        renderForm();
        if (!adapter.loadAlbumReview) return;
        try {
            const result = await adapter.loadAlbumReview(state.album.spotifyId);
            if (result?.album) state.album = { ...state.album, ...result.album };
            if (result?.review) {
                state.reviewId = result.review.reviewId;
                state.rating = Number(result.review.rating) || 0;
                state.hasRating = true;
                state.reviewText = result.review.reviewText || '';
            } else if (result?.initialDraft) {
                state.rating = Number(result.initialDraft.rating) || 0;
                state.hasRating = state.rating > 0;
                state.reviewText = result.initialDraft.reviewText || '';
            }
            renderForm();
            if (scenario === 'published') openSuccessModal();
        } catch (err) {
            if (err?.status === 401 && adapter.routes?.login) {
                window.location.assign(adapter.routes.login);
                return;
            }
            state.error = err?.message || 'Não foi possível carregar os dados da avaliação.';
            renderForm();
        }
    }

    async function submitReview() {
        if (state.submitting) return;
        if (!state.hasRating && (!state.rating || state.rating <= 0)) {
            state.error = 'Selecione uma nota nas estrelas antes de publicar.';
            renderForm();
            contentEl.querySelector('.star-hit')?.focus();
            return;
        }
        if (countReviewChars(state.reviewText) > MAX_REVIEW_CHARS) {
            state.error = 'A resenha deve ter até 255 caracteres.';
            renderForm();
            contentEl.querySelector('#review-text')?.focus();
            return;
        }

        state.submitting = true;
        state.error = '';
        renderForm();
        try {
            const saved = await adapter.publishReview({
                spotifyId: state.album.spotifyId,
                reviewId: state.reviewId,
                rating: state.rating,
                reviewText: state.reviewText
            });
            if (saved?.reviewId != null) state.reviewId = saved.reviewId;
            if (saved?.album) state.album = { ...state.album, ...saved.album };
            try { localStorage.setItem('sonarfy_reviews_dirty', String(Date.now())); } catch {}
            state.submitting = false;
            renderForm();
            openSuccessModal();
        } catch (err) {
            state.submitting = false;
            if (err?.status === 401 && adapter.routes?.login) {
                window.location.assign(adapter.routes.login);
                return;
            }
            if (err?.status === 409 && err.existingReview) {
                state.reviewId = err.existingReview.reviewId;
                state.rating = Number(err.existingReview.rating) || state.rating;
                state.reviewText = err.existingReview.reviewText || '';
            }
            state.error = err?.message || 'Não foi possível publicar a avaliação.';
            renderForm();
        }
    }

    async function handleNavigation(key) {
        if (key === 'logout') {
            await adapter.logout?.();
            if (adapter.routes?.login) window.location.assign(adapter.routes.login);
            return;
        }
        if (key === 'review') {
            contentEl.querySelector('#review-text')?.focus();
            return;
        }
        if (adapter.actions?.[key]) return adapter.actions[key]();
        notify(key === 'notifications' ? 'Notificações estarão disponíveis em breve.' : 'Esta funcionalidade ainda não está disponível neste frontend.');
    }

    on(contentEl, 'input', event => {
        if (event.target.id !== 'review-text') return;
        state.reviewText = event.target.value;
        const counter = contentEl.querySelector('#review-char-count');
        if (counter) counter.textContent = `${countReviewChars(state.reviewText)} / ${MAX_REVIEW_CHARS}`;
    });

    on(contentEl, 'keydown', event => {
        const hit = event.target.closest('.star-hit');
        if (!hit) return;
        const stepKeys = ['ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'Home', 'End'];
        if (!stepKeys.includes(event.key)) return;
        event.preventDefault();
        let next = state.rating || 0;
        if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = Math.min(5, (next || 0) + 0.5);
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = Math.max(0.5, (next || 1) - 0.5);
        else if (event.key === 'Home') next = 0.5;
        else if (event.key === 'End') next = 5;
        updateStarsOnly(next);
        contentEl.querySelector(`.star-hit[data-rating-value="${next}"]`)?.focus();
    });

    on(document, 'click', event => {
        const ratingBtn = event.target.closest('[data-rating-value]');
        if (ratingBtn) {
            const next = Number(ratingBtn.dataset.ratingValue);
            updateStarsOnly(next);
            contentEl.querySelector(`.star-hit[data-rating-value="${next}"]`)?.focus();
            return;
        }
        const target = event.target.closest('button, a');
        if (!target) return;
        if (target.hasAttribute('data-review-submit')) { submitReview(); return; }
        if (target.hasAttribute('data-review-back')) {
            if (typeof history !== 'undefined' && history.length > 1) { history.back(); return; }
            window.location.assign(adapter.routes?.echoes || 'echoes.html');
            return;
        }
        if (target.hasAttribute('data-success-another')) {
            successDialog.close();
            window.location.assign(adapter.routes?.echoes || 'echoes.html');
            return;
        }
        if (target.hasAttribute('data-toggle-favorite')) {
            if (state.favoritePending) return;
            state.favoritePending = true;
            openSuccessModal();
            Promise.resolve(adapter.toggleFavorite ? adapter.toggleFavorite(state.album.spotifyId, !state.favorited) : { favorited: !state.favorited })
                .then(res => {
                    state.favorited = Boolean(res?.favorited);
                    state.favoritePending = false;
                    openSuccessModal();
                    notify(state.favorited ? 'Álbum adicionado aos favoritos.' : 'Álbum removido dos favoritos.');
                })
                .catch(err => {
                    state.favoritePending = false;
                    openSuccessModal();
                    notify(err?.message || 'Não foi possível atualizar os favoritos.');
                });
            return;
        }
        if (target.dataset.navigation) {
            handleNavigation(target.dataset.navigation);
            if (drawer.open) drawer.close();
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

    on(successDialog, 'close', () => {
        document.body.classList.remove('profile-modal-open');
    });

    on(document, 'error', event => {
        if (event.target.matches?.('[data-image-fallback]')) {
            const parent = event.target.parentElement;
            event.target.remove();
            if (parent) parent.textContent = (state.album.name || 'S').slice(0, 2).toUpperCase();
        }
    }, { capture: true });

    const ready = loadInitial();
    return {
        state,
        ready,
        destroy() {
            controller.abort();
        }
    };
}

if (document.getElementById('album-review-main')) mountAlbumReview();
