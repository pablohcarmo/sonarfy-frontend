import { createFeedAdapter } from './feed-fixtures.js';
import { createFeedState, logout } from './feed-state.js';
import { globalHeader, globalFooter, sidebar, skeleton } from './profile-shell.js';
import { activityCard, avatar } from './profile-views.js';
import { icon } from './profile-icons.js';
import { containFocus } from './profile-dialogs.js';
import { escapeHTML as e, timestamp, albumURL } from './profile-utils.js';

// Renderiza o estado vazio diferenciado entre followingCount=0 e followingCount>0 usando apenas rotas reais.
function emptyFeedMarkup(followingCount, routes = {}) {
    const reviewUrl = routes.review || 'album-review.html';
    const profileUrl = routes.profile || 'profile.html';
    if (followingCount === 0) {
        return `<div class="feed-empty"><span class="feed-empty-mark" aria-hidden="true">S</span><h2>Seu feed ainda está silencioso</h2><p>Avalie seus álbuns ou siga outros perfis para acompanhar novas avaliações por aqui.</p><div class="feed-empty-actions"><a class="profile-primary" href="${e(reviewUrl)}">Avaliar Álbum</a><a class="profile-secondary" href="${e(profileUrl)}">Ir para meu perfil</a></div></div>`;
    }
    return `<div class="feed-empty"><span class="feed-empty-mark" aria-hidden="true">S</span><h2>Ainda não há avaliações disponíveis</h2><p>Quando você ou os perfis que você segue publicarem avaliações, elas aparecerão aqui.</p><div class="feed-empty-actions"><a class="profile-primary" href="${e(reviewUrl)}">Avaliar Álbum</a></div></div>`;
}

// Monta a página Feed único paginado consumindo GET /api/feed com invalidação, concorrência e ações sociais indisponíveis.
export function mountFeed(adapter = createFeedAdapter()) {
    const store = createFeedState(adapter);
    const { state } = store;
    const controller = new AbortController();
    const on = (target, type, fn, options = {}) => target?.addEventListener(type, fn, { ...options, signal: controller.signal });
    const status = document.getElementById('feed-status');
    const list = document.getElementById('feed-list');
    const drawer = document.getElementById('profile-drawer');
    const quick = document.getElementById('quick-review');
    containFocus(drawer);
    document.querySelector('.profile-global-header').innerHTML = globalHeader(adapter.routes?.home);
    document.querySelector('.profile-footer').innerHTML = globalFooter();
    document.getElementById('profile-sidebar').innerHTML = sidebar(false, adapter.routes, 'home');
    document.getElementById('feed-demo').hidden = !adapter.demo;
    const trigger = document.getElementById('open-menu');
    const notify = message => { status.textContent = message; };

    function render() {
        const busy = Boolean(state.loadingInitial || state.loadingMore || state.refreshing);
        list.setAttribute('aria-busy', String(busy));
        const reviewUrl = adapter.routes?.review || `album-review.html${adapter.demo ? '?demo=true' : ''}`;
        quick.hidden = false;
        quick.innerHTML = `<div class="quick-review-invite">${avatar(state.viewer || { displayName: 'S' })}<p>Qual álbum você ouviu recentemente?</p></div>${adapter.actions?.review ? '<button type="button" class="profile-primary" data-navigation="review">Avaliar Álbum</button>' : `<a class="profile-primary" href="${e(reviewUrl)}">Avaliar Álbum</a>`}`;

        if (state.loadingInitial && !state.items.length) {
            list.innerHTML = skeleton('activities');
            return;
        }
        if (state.error && !state.items.length) {
            const label = state.error.status === 400 ? 'Recarregar do início' : 'Tentar novamente';
            list.innerHTML = `<div class="feed-error" role="alert"><p>${e(state.error.message)}</p><button type="button" class="profile-primary" data-feed-retry>${label}</button></div>`;
            return;
        }
        if (state.loaded && !state.items.length) {
            list.innerHTML = emptyFeedMarkup(state.followingCount, adapter.routes);
            return;
        }
        if (!state.items.length) {
            list.innerHTML = '';
            return;
        }

        const refreshError = state.error?.scope === 'refresh'
            ? `<div class="feed-error" role="alert"><p>${e(state.error.message)}</p><button type="button" class="profile-secondary" data-feed-refresh>Tentar novamente</button></div>`
            : '';
        const cards = state.items.map(item => activityCard(item, undefined, {
            socialUnavailable: true,
            interactiveAlbum: true
        })).join('');
        let footer = '';
        if (state.error?.scope === 'more') {
            const isBadCursor = state.error.status === 400;
            const actionAttr = isBadCursor ? 'data-feed-restart' : 'data-feed-retry-more';
            const actionLabel = isBadCursor ? 'Recarregar do início' : 'Tentar novamente';
            footer = `<div class="feed-error" role="alert"><p>${e(state.error.message)}</p><button type="button" class="profile-secondary" ${actionAttr}>${actionLabel}</button></div>`;
        } else if (state.nextCursor != null) {
            footer = `<div class="feed-load-more"><button type="button" class="profile-secondary" data-feed-load-more ${state.loadingMore ? 'disabled' : ''}>${state.loadingMore ? 'Carregando mais avaliações…' : 'Carregar mais avaliações'}</button></div>`;
        } else if (state.loaded) {
            footer = '<p class="feed-end">Você chegou ao fim do feed.</p>';
        }
        list.innerHTML = `${refreshError}<div class="activity-feed">${cards}</div>${footer}`;
    }

    const unsubscribe = store.subscribe(render);

    async function run(action) {
        notify('');
        try { await action(); } catch (error) { notify(error.message || 'Não foi possível concluir. Tente novamente.'); }
    }

    async function navigation(key) {
        if (key === 'logout') {
            store.resetSession();
            return logout(adapter);
        }
        if (key === 'review') {
            if (adapter.actions?.review) return adapter.actions.review();
            window.location.assign(adapter.routes?.review || `album-review.html${adapter.demo ? '?demo=true' : ''}`);
            return;
        }
        if (adapter.actions?.[key]) return adapter.actions[key]();
        notify(key === 'notifications' ? 'Notificações estarão disponíveis em breve.' : 'Esta funcionalidade ainda não está disponível neste frontend.');
    }

    on(document, 'click', event => {
        const target = event.target.closest('button, a');
        if (!target) return;
        if (target.matches('a.brand') && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) {
            event.preventDefault();
            if (drawer.open) drawer.close();
            if (typeof window.scrollTo === 'function') window.scrollTo(0, 0);
            run(() => store.loadInitial({ refresh: true }));
            return;
        }
        if (target.hasAttribute('data-feed-refresh')) { run(() => store.loadInitial({ refresh: true })); return; }
        if (target.hasAttribute('data-feed-retry') || target.hasAttribute('data-feed-restart')) { run(() => store.loadInitial({ refresh: false })); return; }
        if (target.hasAttribute('data-feed-load-more') || target.hasAttribute('data-feed-retry-more')) { run(() => store.loadMore()); return; }
        if (target.dataset.album) {
            const albumId = target.dataset.album.trim();
            if (!albumId) return;
            if (adapter.actions?.album) { run(() => adapter.actions.album(albumId)); return; }
            const matched = state.items.find(item => (item.album?.spotifyId || item.album?.id) === albumId)?.album || null;
            window.location.assign(albumURL(albumId, {
                base: adapter.routes?.album || 'album.html',
                demo: Boolean(adapter.demo),
                album: adapter.demo ? matched : null
            }));
            return;
        }
        if (target.dataset.like) { notify('Curtidas estarão disponíveis em breve.'); return; }
        if (target.dataset.comments) { notify('Comentários estarão disponíveis em breve.'); return; }
        if (target.dataset.navigation) { run(() => navigation(target.dataset.navigation)); if (drawer.open) drawer.close(); return; }
        if (target.dataset.unavailable) notify(`${target.dataset.unavailable} ainda não está disponível neste frontend.`);
    });

    on(trigger, 'click', () => {
        drawer.innerHTML = `<header class="drawer-heading"><a class="brand" href="${e(adapter.routes?.home || 'feed.html')}"><svg width="95" height="24" viewBox="0 0 95 24" aria-label="Sonarfy"><use href="../assets/logos/sonarfy-mobile.svg#logo"></use></svg></a><button class="profile-icon-button" id="close-menu" aria-label="Fechar">${icon('close')}</button></header>${sidebar(false, adapter.routes, 'home')}`;
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
    on(drawer, 'close', () => { document.body.classList.remove('profile-modal-open'); trigger.setAttribute('aria-expanded', 'false'); trigger.focus(); });
    on(document, 'error', event => {
        if (event.target.matches?.('[data-image-fallback]')) {
            const parent = event.target.parentElement;
            event.target.remove();
            if (parent.classList.contains('profile-avatar')) parent.textContent = '?';
        }
    }, { capture: true });

    // Revalida ao retornar por histórico/bfcache e limpa ou recarrega em troca de sessão/mutações externas.
    on(window, 'pageshow', event => {
        if (!event.persisted || adapter.demo) return;
        const sessionKey = typeof adapter.getSessionKey === 'function' ? adapter.getSessionKey() : null;
        if (typeof adapter.getSessionKey === 'function' && !sessionKey) {
            store.resetSession();
            return;
        }
        store.loadViewer();
        store.invalidate();
    });
    on(window, 'storage', event => {
        if (adapter.demo) return;
        if (event.key === 'sonarfy_token' || event.key === null) {
            store.resetSession();
            if (typeof adapter.getSessionKey === 'function' && adapter.getSessionKey()) {
                store.loadViewer();
                store.loadInitial({ refresh: false });
            }
            return;
        }
        if (event.key === 'sonarfy_reviews_dirty' || event.key === 'sonarfy_following_dirty') {
            store.invalidate();
        }
    });

    let authChannel = null;
    if (!adapter.demo && typeof BroadcastChannel === 'function') {
        try {
            authChannel = new BroadcastChannel('sonarfy_auth');
            authChannel.addEventListener('message', event => {
                if (event.data?.type === 'logout') store.resetSession();
            });
        } catch {}
    }

    // Atualiza datas relativas pelo relógio real sem reconstruir os cards nem perturbar o foco.
    const clock = setInterval(() => document.querySelectorAll('.feed-main time').forEach(time => { time.textContent = timestamp(time.dateTime); }), 60000);
    const ready = Promise.all([store.loadViewer(), store.loadInitial({ refresh: false })]);
    return {
        store,
        ready,
        destroy() {
            clearInterval(clock);
            authChannel?.close();
            unsubscribe();
            controller.abort();
        }
    };
}

if (document.getElementById('feed-main')) mountFeed();
