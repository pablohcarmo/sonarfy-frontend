import { createProfileAdapter, validateData } from './profile-data.js';
import { createProfileState } from './profile-state.js';
import { createDialogs, containFocus } from './profile-dialogs.js';
import { icon } from './profile-icons.js';
import { sidebar, skeleton } from './profile-shell.js';
import { profileHeader, activityFeed, collectionView, socialActions } from './profile-views.js';
import { sortOptions } from './profile-utils.js';

const adapter = createProfileAdapter();
const store = createProfileState(adapter);
const { state } = store;
const root = document.getElementById('profile-main');
const status = document.getElementById('profile-status');
const header = document.getElementById('profile-header');
const drawer = document.getElementById('profile-drawer');
containFocus(drawer);
const dialog = document.getElementById('profile-dialog');
const tabs = ['activities', 'replies', 'collection'];
const notify = message => { (dialog.open ? dialog.querySelector('.dialog-status') : status).textContent = message; };
const own = () => Boolean(state.data?.session?.userId && state.data.session.userId === state.data.profile.id);
const dialogs = createDialogs({ adapter, store, notify, onSaved: render });
document.getElementById('open-menu').innerHTML = icon('menu');

function render() {
    if (!state.data) return;
    const profile = state.data.profile;
    // Preserve header focus through background mutation reconciliation.
    const focusedAction = header.contains(document.activeElement) ? document.activeElement.dataset.action : null;
    header.innerHTML = profileHeader(profile, own(), state.pending.has('follow'));
    if (focusedAction) header.querySelector(`[data-action="${focusedAction}"]`)?.focus();
    document.title = `${profile.displayName} (@${profile.handle}) – Sonarfy`;
    for (const tab of ['activities', 'replies']) {
        document.getElementById(`panel-${tab}`).innerHTML = activityFeed(state.data[tab], state.pending);
    }
    document.getElementById('panel-collection').innerHTML = collectionView(state.collection, profile, state.sort, state.pending.has('sort'), state.data.collectionTotal ?? state.data.collection.length);
    const expanded = document.getElementById('expanded-social');
    if (expanded) {
        const item = [...state.data.activities, ...state.data.replies, ...state.collection].find(item => item.id === expanded.dataset.reviewId);
        if (item) expanded.innerHTML = socialActions(item, state.pending);
    }
}
store.subscribe(render);

function changeTab(tab, updateURL = true, focus = false) {
    state.tab = tabs.includes(tab) ? tab : 'activities';
    tabs.forEach(key => {
        const button = document.getElementById(`tab-${key}`);
        const active = key === state.tab;
        button.setAttribute('aria-selected', active);
        button.tabIndex = active ? 0 : -1;
        document.getElementById(`panel-${key}`).hidden = !active;
        if (active && focus) button.focus();
    });
    if (updateURL) { const url = new URL(location.href); url.searchParams.set('tab', state.tab); history.replaceState(null, '', url); }
}
document.querySelector('.profile-tabs').addEventListener('click', event => {
    const tab = event.target.closest('[role="tab"]');
    if (tab) changeTab(tab.id.slice(4));
});
document.querySelector('.profile-tabs').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = tabs.indexOf(state.tab);
    changeTab(tabs[event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + (event.key === 'ArrowRight' ? 1 : 2)) % 3], true, true);
});
window.addEventListener('popstate', () => changeTab(new URL(location.href).searchParams.get('tab'), false));

async function run(action) { try { await action(); } catch (error) { notify(error.message || 'Não foi possível concluir. Tente novamente.'); } }
async function navigation(key) {
    if (key === 'notifications') { notify('Notificações estarão disponíveis em breve.'); return; }
    const handler = adapter.actions?.[key];
    if (handler) { await handler(); return; }
    if (key === 'logout') {
        localStorage.removeItem('sonarfy_token');
        window.location.assign('login.html');
        return;
    }
    notify(`${({ search: 'Pesquisa', echoes: 'Ecos', logout: 'Saída da conta', review: 'Avaliação de álbuns' })[key] || 'Esta funcionalidade'} ainda não está disponível neste frontend.`);
}
document.addEventListener('click', event => {
    const target = event.target.closest('button, a');
    if (!target) return;
    if (target.dataset.navigation) { run(() => navigation(target.dataset.navigation)); if (drawer.open) drawer.close(); }
    if (target.dataset.unavailable) notify(`${target.dataset.unavailable} ainda não está disponível neste frontend.`);
    if (target.dataset.like) run(async () => {
        const id = target.dataset.like;
        const expanded = target.closest('#expanded-social');
        await store.like(id);
        (expanded || document.getElementById(`panel-${state.tab}`)).querySelector(`[data-like="${CSS.escape(id)}"]`)?.focus();
    });
    if (target.dataset.comments) run(async () => {
        if (!adapter.actions?.comments) { notify('Comentários ainda não estão integrados neste frontend.'); return; }
        await adapter.actions.comments(target.dataset.comments);
    });
    if (target.dataset.album) run(async () => {
        if (!adapter.actions?.album) { notify('A página do álbum ainda não está disponível neste frontend.'); return; }
        await adapter.actions.album(target.dataset.album);
    });
    if (target.dataset.review && state.data) dialogs.review(state.collection.find(item => item.id === target.dataset.review));
    if (target.dataset.action === 'edit') dialogs.edit();
    if (target.dataset.action === 'share') dialogs.share();
    if (target.dataset.action === 'follow') run(async () => {
        try { await store.follow(); }
        finally { header.querySelector('[data-action="follow"]')?.focus(); }
    });
    if (target.id === 'sort-trigger') {
        const options = document.getElementById('sort-options');
        options.hidden = !options.hidden; target.setAttribute('aria-expanded', String(!options.hidden));
        if (!options.hidden) options.querySelector('[aria-pressed="true"]').focus();
    } else if (target.dataset.sort && sortOptions.some(([key]) => key === target.dataset.sort)) {
        run(async () => {
            try { await store.sort(target.dataset.sort); }
            finally { document.getElementById('sort-trigger')?.focus(); }
        });
    } else if (!target.closest('.sort-control')) closeSort();
});
function closeSort() {
    const options = document.getElementById('sort-options');
    if (options) options.hidden = true;
    document.getElementById('sort-trigger')?.setAttribute('aria-expanded', 'false');
}
document.addEventListener('keydown', event => {
    const options = document.getElementById('sort-options');
    if (!options || options.hidden) return;
    if (event.key === 'Escape') { closeSort(); document.getElementById('sort-trigger').focus(); }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && options.contains(event.target)) {
        event.preventDefault(); const buttons = [...options.querySelectorAll('button')];
        const index = buttons.indexOf(document.activeElement);
        buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length].focus();
    }
});
document.addEventListener('click', event => { if (!event.target.closest('.sort-control')) closeSort(); });
document.addEventListener('error', event => {
    if (event.target.matches?.('[data-image-fallback]')) {
        const parent = event.target.parentElement;
        event.target.remove();
        if (parent.classList.contains('profile-avatar')) parent.textContent = '?';
    }
}, true);

document.getElementById('open-menu').addEventListener('click', () => {
    drawer.innerHTML = `<header class="drawer-heading"><a class="brand" href="../index.html"><svg width="95" height="24" viewBox="0 0 95 24" aria-label="Sonarfy"><use href="../assets/logos/sonarfy-mobile.svg#logo"></use></svg></a><button class="profile-icon-button" id="close-menu" aria-label="Fechar">${icon('close')}</button></header>${sidebar(own(), adapter.routes)}`;
    drawer.showModal(); document.body.classList.add('profile-modal-open');
    drawer.querySelector('#close-menu').addEventListener('click', () => drawer.close());
    drawer.querySelector('#close-menu').focus();
});
drawer.addEventListener('click', event => { if (event.target === drawer) drawer.close(); });
drawer.addEventListener('close', () => { document.body.classList.remove('profile-modal-open'); document.getElementById('open-menu').focus(); });
// Native modal dialogs provide focus containment, Escape and inert background in Edge/Firefox.
for (const surface of [drawer, dialog]) surface.addEventListener('click', event => {
    if (event.target !== surface) return;
    const box = surface.getBoundingClientRect();
    if (event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom) event.stopImmediatePropagation();
}, { capture: true });

async function load() {
    notify(''); header.innerHTML = skeleton('header');
    document.getElementById('profile-sidebar').innerHTML = sidebar(false, adapter.routes);
    tabs.forEach(tab => { document.getElementById(`panel-${tab}`).innerHTML = skeleton(tab); });
    try {
        const data = validateData(await adapter.load(new URL(location.href).searchParams.get('handle') || ''));
        store.setData(data);
        if (state.sort !== 'recent') await store.sort(state.sort);
        document.getElementById('profile-sidebar').innerHTML = sidebar(own(), adapter.routes);
        document.getElementById('profile-demo').hidden = !adapter.demo;
    } catch (error) {
        header.replaceChildren(); tabs.forEach(tab => document.getElementById(`panel-${tab}`).replaceChildren());
        notify(error.message || 'Não foi possível carregar o perfil.');
        const retry = document.createElement('button'); retry.className = 'profile-secondary'; retry.textContent = 'Tentar novamente'; retry.addEventListener('click', load); status.append(retry);
    }
}
changeTab(new URL(location.href).searchParams.get('tab'), false);
load();
