import { createEcosAdapter } from './ecos-fixtures.js';
import { createEcosState, ecoTimestamp, logout } from './ecos-state.js';
import { globalHeader, globalFooter, sidebar } from './profile-shell.js';
import { icon } from './profile-icons.js';
import { containFocus } from './profile-dialogs.js';
import { escapeHTML as e, safeImage } from './profile-utils.js';

// Render 6 skeleton rows matching the Figma loading state while respecting reduced-motion.
function ecosSkeleton() {
    const row = '<div class="ecos-skeleton-row"><div class="ecos-skeleton-block ecos-skeleton-cover"></div><div class="ecos-skeleton-info"><div class="ecos-skeleton-block ecos-skeleton-title"></div><div class="ecos-skeleton-block ecos-skeleton-artist"></div><div class="ecos-skeleton-block ecos-skeleton-track"></div></div><div class="ecos-skeleton-block ecos-skeleton-action"></div></div>';
    return `<div class="ecos-skeleton-list" aria-label="Carregando reproduções" aria-busy="true">${row.repeat(6)}</div>`;
}

function renderCover(album) {
    const src = safeImage(album.cover);
    const bg = /^#[0-9a-f]{3,8}$/i.test(album.color || '') ? album.color : '#6366f1';
    const mark = e(album.mark || album.title.slice(0, 2).toUpperCase());
    if (src) {
        return `<div class="eco-cover" style="--eco-cover-bg:${bg}" data-mark="${mark}"><img src="${src}" alt="" data-image-fallback></div>`;
    }
    return `<div class="eco-cover" style="--eco-cover-bg:${bg}" aria-hidden="true">${mark}</div>`;
}

function renderRow(item) {
    const timeHtml = item.isPlaying
        ? '<span class="eco-live-badge"><img src="../assets/icons/ecos/spotify-dot.svg" width="8" height="8" alt="" aria-hidden="true"><span>Ouvindo agora</span></span>'
        : `<time class="eco-time" datetime="${e(item.playedAt)}">${e(ecoTimestamp(item.playedAt))}</time>`;
    return `<li class="eco-row" data-album-row="${e(item.album.id)}">${renderCover(item.album)}<div class="eco-info"><p class="eco-album">${e(item.album.title)}</p><p class="eco-artist">${e(item.album.artist)}</p><p class="eco-track">♪ Faixa ouvida: "${e(item.trackName)}"</p></div><div class="eco-actions">${timeHtml}<button type="button" class="eco-rate-btn" data-album="${e(item.album.id)}" aria-label="Avaliar ${e(item.album.title)}"><span class="eco-rate-label">Avaliar</span><span class="eco-rate-chevron" aria-hidden="true">›</span></button></div></li>`;
}

function renderEmpty() {
    return `<div class="ecos-empty"><div class="ecos-empty-icon" aria-hidden="true">♫</div><h2>Conecte seu Spotify</h2><p>Conecte sua conta do Spotify para acompanhar suas últimas 50 reproduções e avaliar os álbuns que você ouviu</p><a class="ecos-connect-cta" href="spotify-sync.html?source=ecos">Conectar ao Spotify</a></div>`;
}

function renderError(message) {
    return `<div class="ecos-error-card" role="alert"><h2>Não foi possível carregar os ecos</h2><p>${e(message)}</p><button type="button" class="profile-primary" data-retry>Tentar novamente</button></div>`;
}

// Mount the Ecos page with shared shell, state subscription, minute clock, and navigation handlers.
export function mountEcos(adapter = createEcosAdapter()) {
    const store = createEcosState(adapter);
    const { state } = store;
    const controller = new AbortController();
    const on = (target, type, fn, options = {}) => target.addEventListener(type, fn, { ...options, signal: controller.signal });

    const statusEl = document.getElementById('ecos-status');
    const contentEl = document.getElementById('ecos-content');
    const pillEl = document.getElementById('ecos-sync-pill');
    const drawer = document.getElementById('profile-drawer');
    containFocus(drawer);

    document.querySelector('.profile-global-header').innerHTML = globalHeader(adapter.routes?.home);
    document.querySelector('.profile-footer').innerHTML = globalFooter();
    document.getElementById('profile-sidebar').innerHTML = sidebar(false, adapter.routes, 'echoes');
    document.getElementById('ecos-demo').hidden = !adapter.demo;

    const trigger = document.getElementById('open-menu');
    const notify = message => { statusEl.textContent = message; };

    function renderPill() {
        const busy = state.status === 'loading' || state.refreshing;
        const connected = state.data?.connected;
        const count = state.data?.items?.length || 0;
        const label = busy
            ? 'Sincronizando...'
            : connected === false
                ? 'Spotify desconectado'
                : state.status === 'error'
                    ? 'Erro ao sincronizar'
                    : `Conectado · ${count} recentes`;
        const dot = connected === false || state.status === 'error'
            ? '<span class="ecos-status-dot is-disconnected" aria-hidden="true"></span>'
            : '<span class="ecos-status-dot" aria-hidden="true"><img src="../assets/icons/ecos/spotify-dot.svg" width="8" height="8" alt=""></span>';
        pillEl.innerHTML = `${dot}<span>${e(label)}</span><button type="button" class="ecos-refresh-btn" data-refresh aria-label="Atualizar reproduções" ${busy ? 'disabled' : ''}>↻</button>`;
    }

    function render() {
        renderPill();
        if (state.status === 'loading') {
            notify('');
            contentEl.innerHTML = ecosSkeleton();
            return;
        }
        if (state.status === 'error' && !state.data) {
            notify('');
            contentEl.innerHTML = renderError(state.error);
            return;
        }
        if (state.error && state.data) {
            notify(state.error);
        } else if (!state.refreshing) {
            notify('');
        }
        if (!state.data?.connected) {
            contentEl.innerHTML = renderEmpty();
            return;
        }
        if (!state.data.items.length) {
            contentEl.innerHTML = renderEmpty();
            return;
        }
        contentEl.innerHTML = `<ul class="ecos-list">${state.data.items.map(renderRow).join('')}</ul><p class="ecos-caption">Exibindo as ${state.data.items.length} reproduções mais recentes do Spotify</p>`;
    }

    const unsubscribe = store.subscribe(render);

    async function navigation(key, id) {
        if (key === 'logout') return logout(adapter);
        if (key === 'album') {
            if (adapter.actions?.album) return adapter.actions.album(id);
            if (adapter.routes?.album) {
                const targetUrl = `${adapter.routes.album}${adapter.routes.album.includes('?') ? '&' : '?'}id=${encodeURIComponent(id)}`;
                window.location.assign(targetUrl);
                return;
            }
            notify('A página de avaliação de álbum ainda não está disponível neste frontend.');
            return;
        }
        if (adapter.actions?.[key]) return adapter.actions[key](id);
        notify(key === 'notifications' ? 'Notificações estarão disponíveis em breve.' : 'Esta funcionalidade ainda não está disponível neste frontend.');
    }

    on(document, 'click', event => {
        const target = event.target.closest('button, a');
        if (target) {
            if (target.hasAttribute('data-refresh')) { store.refresh(); return; }
            if (target.hasAttribute('data-retry')) { store.load(); return; }
            if (target.dataset.album) { navigation('album', target.dataset.album); return; }
            if (target.dataset.navigation) {
                navigation(target.dataset.navigation);
                if (drawer.open) drawer.close();
                return;
            }
            if (target.dataset.unavailable) {
                notify(`${target.dataset.unavailable} ainda não está disponível neste frontend.`);
                return;
            }
            return;
        }
        const row = event.target.closest('[data-album-row]');
        if (row) navigation('album', row.dataset.albumRow);
    });

    on(trigger, 'click', () => {
        drawer.innerHTML = `<header class="drawer-heading"><a class="brand" href="${e(adapter.routes?.home || 'feed.html')}"><svg width="95" height="24" viewBox="0 0 95 24" aria-label="Sonarfy"><use href="../assets/logos/sonarfy-mobile.svg#logo"></use></svg></a><button class="profile-icon-button" id="close-menu" aria-label="Fechar">${icon('close')}</button></header>${sidebar(false, adapter.routes, 'echoes')}`;
        drawer.showModal();
        document.body.classList.add('profile-modal-open');
        trigger.setAttribute('aria-expanded', 'true');
        drawer.querySelector('#close-menu').addEventListener('click', () => drawer.close(), { once: true });
        drawer.querySelector('#close-menu').focus();
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

    on(document, 'error', event => {
        if (event.target.matches?.('[data-image-fallback]')) {
            const parent = event.target.parentElement;
            event.target.remove();
            if (parent.classList.contains('eco-cover')) parent.textContent = parent.dataset.mark || '?';
        }
    }, { capture: true });

    // Update relative timestamps every minute without rebuilding DOM controls.
    const clock = setInterval(() => {
        document.querySelectorAll('.ecos-main time.eco-time').forEach(time => {
            time.textContent = ecoTimestamp(time.dateTime);
        });
    }, 60000);

    const ready = store.load();
    return {
        store,
        ready,
        destroy() {
            clearInterval(clock);
            unsubscribe();
            controller.abort();
        }
    };
}

if (document.getElementById('ecos-main')) mountEcos();
