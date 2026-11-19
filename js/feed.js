import { createFeedAdapter } from './feed-fixtures.js';
import { createFeedState, feedTabs, normalizeTab, logout } from './feed-state.js';
import { globalHeader, globalFooter, sidebar, skeleton } from './profile-shell.js';
import { activityFeed, avatar } from './profile-views.js';
import { icon } from './profile-icons.js';
import { containFocus } from './profile-dialogs.js';
import { escapeHTML as e, timestamp } from './profile-utils.js';

export function mountFeed(adapter = createFeedAdapter()) {
    const store = createFeedState(adapter);
    const { state } = store;
    const controller = new AbortController();
    const on = (target, type, fn, options = {}) => target.addEventListener(type, fn, { ...options, signal: controller.signal });
    const status = document.getElementById('feed-status');
    const drawer = document.getElementById('profile-drawer');
    containFocus(drawer);
    const quick = document.getElementById('quick-review');
    document.querySelector('.profile-global-header').innerHTML = globalHeader(adapter.routes?.home);
    document.querySelector('.profile-footer').innerHTML = globalFooter();
    document.getElementById('profile-sidebar').innerHTML = sidebar(false, adapter.routes, 'home');
    document.getElementById('feed-demo').hidden = !adapter.demo;
    const trigger = document.getElementById('open-menu');
    const notify = message => { status.textContent = message; };
    async function run(action) {
        notify('');
        try { await action(); } catch (error) { notify(error.message || 'Não foi possível concluir. Tente novamente.'); }
    }
    function render() {
        for (const tab of feedTabs) {
            const active = state.tab === tab;
            const button = document.getElementById(`tab-${tab}`);
            button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
            const panel = document.getElementById(`panel-${tab}`);
            panel.hidden = !active;
            panel.setAttribute('aria-busy', String(state.loading.has(tab)));
            const data = state.data[tab];
            const emptyFollowing = tab === 'following' && data?.followingCount === 0;
            const content = emptyFollowing ? [] : data?.publications;
            panel.innerHTML = data ? content.length ? activityFeed(content, state.pending) : `<div class="feed-empty"><span class="feed-empty-mark" aria-hidden="true">S</span><h2>${emptyFollowing ? 'Seu feed ainda está silencioso' : 'Nenhuma publicação ainda'}</h2><p>${emptyFollowing ? 'Siga outros apaixonados por música ou explore a aba Para você' : 'Novas avaliações aparecerão aqui.'}</p>${tab === 'following' ? '<button data-explore>Explorar Para você</button>' : ''}</div>` : state.loading.has(tab) ? skeleton() : '';
            if (state.errors[tab]) panel.innerHTML += `<p class="profile-status" role="alert">${e(state.errors[tab])}</p><button class="profile-primary" data-retry="${tab}">Tentar novamente</button>`;
        }
        const data = state.data[state.tab];
        quick.hidden = Boolean(data && state.tab === 'following' && data.followingCount === 0);
        quick.innerHTML = `<div class="quick-review-invite">${avatar(data?.viewer || { displayName: 'S' })}<p>Qual álbum você ouviu recentemente?</p></div><button class="profile-primary" data-navigation="review">Avaliar Álbum</button>`;
    }
    const unsubscribe = store.subscribe(render);
    function changeTab(tab, updateURL = true, focus = false) {
        const selected = normalizeTab(tab);
        if (updateURL) {
            const url = new URL(location.href); url.searchParams.set('tab', selected);
            if (url.href !== location.href) history.pushState(null, '', url);
        }
        const loading = store.select(selected);
        if (focus) document.getElementById(`tab-${selected}`).focus();
        return loading;
    }
    on(document.querySelector('.feed-tabs'), 'keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        changeTab(event.key === 'Home' ? 'following' : event.key === 'End' ? 'for-you' : feedTabs[(feedTabs.indexOf(state.tab) + 1) % 2], true, true);
    });
    on(window, 'popstate', () => changeTab(new URL(location.href).searchParams.get('tab'), false));
    async function navigation(key, id) {
        if (key === 'logout') return logout(adapter);
        if (adapter.actions?.[key]) return adapter.actions[key](id);
        notify(key === 'notifications' ? 'Notificações estarão disponíveis em breve.' : 'Esta funcionalidade ainda não está disponível neste frontend.');
    }
    on(document, 'click', event => {
        const target = event.target.closest('button, a');
        if (!target) return;
        if (target.matches('[role="tab"]')) changeTab(target.id.slice(4));
        if (target.hasAttribute('data-explore')) changeTab('for-you', true, true);
        if (target.dataset.retry) store.select(target.dataset.retry, true);
        if (target.dataset.like) run(async () => {
            const id = target.dataset.like; const tab = state.tab;
            try { await store.like(id); }
            finally {
                if (state.tab === tab && (document.activeElement === document.body || document.activeElement === target)) document.getElementById(`panel-${tab}`).querySelector(`[data-like="${CSS.escape(id)}"]`)?.focus();
            }
        });
        if (target.dataset.comments) run(() => navigation('comments', target.dataset.comments));
        if (target.dataset.album) run(() => navigation('album', target.dataset.album));
        if (target.dataset.navigation) { run(() => navigation(target.dataset.navigation)); if (drawer.open) drawer.close(); }
        if (target.dataset.unavailable) notify(`${target.dataset.unavailable} ainda não está disponível neste frontend.`);
    });
    on(trigger, 'click', () => {
        drawer.innerHTML = `<header class="drawer-heading"><a class="brand" href="${e(adapter.routes?.home || 'feed.html')}"><svg width="95" height="24" viewBox="0 0 95 24" aria-label="Sonarfy"><use href="../assets/logos/sonarfy-mobile.svg#logo"></use></svg></a><button class="profile-icon-button" id="close-menu" aria-label="Fechar">${icon('close')}</button></header>${sidebar(false, adapter.routes, 'home')}`;
        drawer.showModal(); document.body.classList.add('profile-modal-open'); trigger.setAttribute('aria-expanded', 'true');
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
            const parent = event.target.parentElement; event.target.remove();
            if (parent.classList.contains('profile-avatar')) parent.textContent = '?';
        }
    }, { capture: true });
    // Update dates with the real clock without replacing controls or disturbing focus.
    const clock = setInterval(() => document.querySelectorAll('.feed-main time').forEach(time => { time.textContent = timestamp(time.dateTime); }), 60000);
    const ready = changeTab(new URL(location.href).searchParams.get('tab'), true);
    return { store, changeTab, ready, destroy() { clearInterval(clock); unsubscribe(); controller.abort(); } };
}

if (document.getElementById('feed-main')) mountFeed();
