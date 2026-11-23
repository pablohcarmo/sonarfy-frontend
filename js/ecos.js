import { createEcosAdapter } from './ecos-fixtures.js';
import { createHttpEchoesAdapter } from './echoes-http.js';
import { createEcosState, ecoTimestamp, logout } from './ecos-state.js';
import { globalHeader, globalFooter, sidebar } from './profile-shell.js';
import { icon } from './profile-icons.js';
import { containFocus } from './profile-dialogs.js';
import { escapeHTML as e, safeImage } from './profile-utils.js';

// Resolve the host adapter, explicit demo mode (?demo=true), or default HTTP adapter.
export function resolveEcosAdapter(integration = globalThis.sonarfyEcosAdapter) {
    if (integration) return integration;
    const isDemo = typeof location !== 'undefined' && new URLSearchParams(location.search).get('demo') === 'true';
    return isDemo ? createEcosAdapter() : createHttpEchoesAdapter();
}

// Render 6 skeleton rows matching the Figma loading state while respecting reduced-motion.
function ecosSkeleton() {
    const row = '<div class="ecos-skeleton-row"><div class="ecos-skeleton-block ecos-skeleton-cover"></div><div class="ecos-skeleton-info"><div class="ecos-skeleton-block ecos-skeleton-title"></div><div class="ecos-skeleton-block ecos-skeleton-artist"></div><div class="ecos-skeleton-block ecos-skeleton-track"></div></div><div class="ecos-skeleton-block ecos-skeleton-action"></div></div>';
    return `<div class="ecos-skeleton-list" aria-label="Carregando álbuns" aria-busy="true">${row.repeat(6)}</div>`;
}

function renderCover(album) {
    const src = safeImage(album.coverUrl || album.cover);
    const bg = /^#[0-9a-f]{3,8}$/i.test(album.color || '') ? album.color : '#6366f1';
    const mark = e(album.mark || (album.name || album.title || 'S').slice(0, 2).toUpperCase());
    if (src) {
        return `<div class="eco-cover" style="--eco-cover-bg:${bg}" data-mark="${mark}"><img src="${src}" alt="" data-image-fallback></div>`;
    }
    return `<div class="eco-cover" style="--eco-cover-bg:${bg}" aria-hidden="true">${mark}</div>`;
}

function formatDuration(durationMs) {
    if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs <= 0) return '';
    const totalSeconds = Math.floor(durationMs / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = String(totalSeconds % 60).padStart(2, '0');
    return ` · ${mins}:${secs}`;
}

function formatPlayTimeHHmm(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function renderTrackItem(item) {
    const duration = formatDuration(item.track?.durationMs);
    const hhmm = formatPlayTimeHHmm(item.playedAt);
    const artists = Array.isArray(item.artists) && item.artists.length
        ? item.artists.map(a => a.name).join(', ')
        : '';
    const timeLabel = item.isPlaying
        ? '<span class="eco-track-live">Ouvindo agora</span>'
        : `<time class="eco-track-time" datetime="${e(item.playedAt)}">${e(ecoTimestamp(item.playedAt))}</time>${hhmm ? ` · <span class="eco-track-hhmm">${e(hhmm)}</span>` : ''}`;
    return `<li class="eco-track-item" data-echo-id="${e(item.id)}"><div class="eco-track-primary"><span class="eco-track-name">${e(item.trackName)}${duration ? `<span class="eco-track-duration">${e(duration)}</span>` : ''}</span>${artists ? `<span class="eco-track-artists">${e(artists)}</span>` : ''}</div><span class="eco-track-meta">${timeLabel}</span></li>`;
}

function renderExpandedDetails(spotifyId, detail) {
    if (!detail?.expanded) return '';
    if (detail.loading) {
        return '<div class="eco-details-panel" role="status" aria-busy="true"><p class="eco-details-state">Carregando reproduções deste álbum...</p></div>';
    }
    if (detail.error && !detail.items.length) {
        return `<div class="eco-details-panel" role="alert"><p class="eco-details-error">${e(detail.error)}</p><button type="button" class="eco-details-retry" data-retry-album="${e(spotifyId)}">Tentar novamente</button></div>`;
    }
    if (!detail.items.length) {
        return '<div class="eco-details-panel"><p class="eco-details-state">Nenhuma reprodução encontrada para este álbum.</p></div>';
    }
    const listHtml = `<ul class="eco-tracks">${detail.items.map(renderTrackItem).join('')}</ul>`;
    const errorHtml = detail.error
        ? `<div class="eco-details-inline-error" role="alert"><span>${e(detail.error)}</span></div>`
        : '';
    const moreHtml = detail.nextCursor
        ? `<div class="eco-details-more-wrap"><button type="button" class="eco-details-more-btn" data-load-more-album="${e(spotifyId)}" ${detail.loadingMore ? 'disabled' : ''}>${detail.loadingMore ? 'Carregando reproduções...' : 'Carregar mais reproduções deste álbum'}</button></div>`
        : '';
    return `<div class="eco-details-panel">${listHtml}${errorHtml}${moreHtml}</div>`;
}

function renderAlbumRow(item, detail) {
    const { album, lastPlayedAt, listenCount, isPlaying } = item;
    const isExpanded = Boolean(detail?.expanded);
    const timeHtml = isPlaying
        ? '<span class="eco-live-badge"><img src="../assets/icons/ecos/spotify-dot.svg" width="8" height="8" alt="" aria-hidden="true"><span>Ouvindo agora</span></span>'
        : `<time class="eco-time" datetime="${e(lastPlayedAt)}">${e(ecoTimestamp(lastPlayedAt))}</time>`;
    const countLabel = `${listenCount} ${listenCount === 1 ? 'reprodução' : 'reproduções'}`;
    const chevron = isExpanded ? '▾' : '▸';
    const artistHtml = album.artist ? `<span class="eco-artist">${e(album.artist)}</span>` : '';
    const detailsHtml = renderExpandedDetails(album.spotifyId, detail);

    return `<li class="eco-row${isExpanded ? ' is-expanded' : ''}" data-album-id="${e(album.spotifyId)}"><div class="eco-row-main">${renderCover(album)}<div class="eco-info"><button type="button" class="eco-toggle" data-toggle-album="${e(album.spotifyId)}" aria-expanded="${String(isExpanded)}"><span class="eco-album">${e(album.name)}</span>${artistHtml}<span class="eco-summary">${e(countLabel)}</span></button></div><div class="eco-actions">${timeHtml}<button type="button" class="eco-rate-btn" data-album="${e(album.spotifyId)}" aria-label="Avaliar ${e(album.name)}"><span class="eco-rate-label">Avaliar</span><span class="eco-rate-chevron" aria-hidden="true">›</span></button><span class="eco-group-chevron" aria-hidden="true">${chevron}</span></div></div>${detailsHtml}</li>`;
}

function renderEmpty(connection, syncUrl) {
    const status = connection?.status || 'DISCONNECTED';
    if (status === 'CONNECTED' && !connection?.recentListensAuthorized) {
        return `<div class="ecos-empty"><div class="ecos-empty-icon" aria-hidden="true">♫</div><h2>Autorize suas escutas recentes</h2><p>Sua conta do Spotify está conectada, mas sem permissão para escutas recentes. Reconecte para acompanhar os álbuns que você ouviu.</p><a class="ecos-connect-cta" href="${e(syncUrl)}">Reconectar Spotify</a></div>`;
    }
    if (status === 'REAUTHORIZATION_REQUIRED') {
        return `<div class="ecos-empty"><div class="ecos-empty-icon" aria-hidden="true">♫</div><h2>Reconecte seu Spotify</h2><p>Sua autorização do Spotify expirou. Reconecte sua conta para sincronizar suas reproduções recentes.</p><a class="ecos-connect-cta" href="${e(syncUrl)}">Reconectar Spotify</a></div>`;
    }
    if (status === 'CONNECTED' && connection?.recentListensAuthorized) {
        return `<div class="ecos-empty"><div class="ecos-empty-icon" aria-hidden="true">♫</div><h2>Nenhuma reprodução importada ainda</h2><p>Sincronize agora para importar as reproduções mais recentes disponibilizadas pelo Spotify.</p><button type="button" class="ecos-connect-cta" data-refresh>Sincronizar agora</button></div>`;
    }
    return `<div class="ecos-empty"><div class="ecos-empty-icon" aria-hidden="true">♫</div><h2>Conecte seu Spotify</h2><p>Conecte sua conta do Spotify para acompanhar os álbuns e reproduções recentes que você ouviu.</p><a class="ecos-connect-cta" href="${e(syncUrl)}">Conectar ao Spotify</a></div>`;
}

function renderError(message) {
    return `<div class="ecos-error-card" role="alert"><h2>Não foi possível carregar os ecos</h2><p>${e(message)}</p><button type="button" class="profile-primary" data-retry>Tentar novamente</button></div>`;
}

function formatMetaDate(iso) {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// Mount the Ecos page with distinct-album listing, lazy per-album listens, cooldown timer, and shared shell.
export function mountEcos(adapter = resolveEcosAdapter()) {
    const store = createEcosState(adapter);
    const { state } = store;
    const controller = new AbortController();
    const on = (target, type, fn, options = {}) => target.addEventListener(type, fn, { ...options, signal: controller.signal });

    const statusEl = document.getElementById('ecos-status');
    const bannerEl = document.getElementById('ecos-banner');
    const contentEl = document.getElementById('ecos-content');
    const pillEl = document.getElementById('ecos-sync-pill');
    const drawer = document.getElementById('profile-drawer');
    containFocus(drawer);

    document.querySelector('.profile-global-header').innerHTML = globalHeader(adapter.routes?.home);
    document.querySelector('.profile-footer').innerHTML = globalFooter();
    document.getElementById('profile-sidebar').innerHTML = sidebar(false, adapter.routes, 'echoes');
    document.getElementById('ecos-demo').hidden = !adapter.demo;

    const trigger = document.getElementById('open-menu');
    const syncUrl = adapter.routes?.spotifySync || 'spotify-sync.html?source=echoes';
    const notify = message => { statusEl.textContent = message; };

    function remainingCooldownSeconds() {
        return Math.max(0, Math.ceil((state.cooldownUntil - Date.now()) / 1000));
    }

    function renderPill() {
        const busy = state.status === 'loading' || state.refreshing;
        const cooldown = remainingCooldownSeconds();
        const connection = state.data?.connection;
        const connected = state.data?.connected;
        const label = busy
            ? 'Sincronizando...'
            : cooldown > 0
                ? `Aguarde ${cooldown}s`
                : connection?.status === 'CONNECTED' && !connection?.recentListensAuthorized
                    ? 'Permissão pendente'
                    : connection?.status === 'REAUTHORIZATION_REQUIRED'
                        ? 'Reautorização necessária'
                        : connected === false
                            ? 'Spotify desconectado'
                            : state.status === 'error'
                                ? 'Erro ao sincronizar'
                                : 'Conectado · Sincronizar';
        const dot = connected === false || state.status === 'error'
            ? '<span class="ecos-status-dot is-disconnected" aria-hidden="true"></span>'
            : '<span class="ecos-status-dot" aria-hidden="true"><img src="../assets/icons/ecos/spotify-dot.svg" width="8" height="8" alt=""></span>';
        const disabled = busy || cooldown > 0 ? 'disabled' : '';
        pillEl.innerHTML = `${dot}<span>${e(label)}</span><button type="button" class="ecos-refresh-btn" data-refresh aria-label="Sincronizar reproduções" ${disabled}>↻</button>`;
    }

    function renderBanner() {
        if (!bannerEl) return;
        const messages = [];
        const connection = state.data?.connection;
        const hasItems = (state.data?.items?.length || 0) > 0;
        if (hasItems && connection) {
            if (connection.status === 'CONNECTED' && !connection.recentListensAuthorized) {
                messages.push(`<span>Sua conexão atual do Spotify não inclui permissão para escutas recentes.</span> <a href="${e(syncUrl)}">Reconectar Spotify</a>`);
            } else if (connection.status === 'REAUTHORIZATION_REQUIRED') {
                messages.push(`<span>Sua autorização do Spotify expirou. Escutas já importadas continuam disponíveis.</span> <a href="${e(syncUrl)}">Reconectar Spotify</a>`);
            } else if (connection.status === 'DISCONNECTED') {
                messages.push(`<span>Spotify desconectado. Escutas já importadas permanecem salvas no Sonarfy.</span> <a href="${e(syncUrl)}">Conectar ao Spotify</a>`);
            }
        }
        if (state.syncResult?.possibleGap) {
            messages.push('<span>Pode haver uma lacuna entre a janela recente do Spotify (~50 últimas faixas) e sua última sincronização salva.</span>');
        }
        if (state.syncResult && state.syncResult.complete === false) {
            messages.push('<span>A sincronização foi parcial; as escutas já obtidas foram salvas.</span>');
        }
        if (!messages.length) {
            bannerEl.hidden = true;
            bannerEl.innerHTML = '';
            return;
        }
        bannerEl.hidden = false;
        bannerEl.innerHTML = messages.map(msg => `<p class="ecos-banner-item">${msg}</p>`).join('');
    }

    function render() {
        renderPill();
        renderBanner();
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
        if (!state.data?.items?.length) {
            contentEl.innerHTML = renderEmpty(state.data?.connection, syncUrl);
            return;
        }

        const metaParts = [];
        const lastSync = formatMetaDate(state.data.sync?.lastSucceededAt);
        const historyStart = formatMetaDate(state.data.sync?.historyStartsAt);
        if (lastSync) metaParts.push(`Última sincronização: ${lastSync}`);
        if (historyStart) metaParts.push(`Histórico capturado desde: ${historyStart}`);
        const caption = metaParts.length
            ? `${metaParts.join(' · ')} · Spotify disponibiliza apenas reproduções recentes.`
            : `Exibindo ${state.data.items.length} ${state.data.items.length === 1 ? 'álbum sincronizado' : 'álbuns sincronizados'} do Spotify`;

        const loadMoreErrorHtml = state.loadMoreError
            ? `<p class="profile-status" role="alert">${e(state.loadMoreError)}</p>`
            : '';
        const loadMoreHtml = state.data.nextCursor
            ? `<div class="ecos-load-more-wrap">${loadMoreErrorHtml}<button type="button" class="ecos-load-more-btn" data-load-more ${state.loadingMore ? 'disabled' : ''}>${state.loadingMore ? 'Carregando álbuns...' : state.loadMoreError ? 'Tentar carregar mais álbuns' : 'Carregar mais álbuns'}</button></div>`
            : '';

        contentEl.innerHTML = `<ul class="ecos-list">${state.data.items.map(item => renderAlbumRow(item, state.details[item.album.spotifyId])).join('')}</ul>${loadMoreHtml}<p class="ecos-caption">${e(caption)}</p>`;
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
            if (target.hasAttribute('data-refresh')) { store.sync(); return; }
            if (target.hasAttribute('data-load-more')) { store.loadMore(); return; }
            if (target.hasAttribute('data-retry')) { store.load(); return; }
            if (target.dataset.album) { navigation('album', target.dataset.album); return; }
            if (target.dataset.toggleAlbum) {
                const albumId = target.dataset.toggleAlbum;
                const hadFocus = document.activeElement === target;
                store.toggleAlbum(albumId).then(() => {
                    if (hadFocus) contentEl.querySelector(`[data-toggle-album="${CSS.escape(albumId)}"]`)?.focus();
                });
                return;
            }
            if (target.dataset.retryAlbum) { store.loadAlbumListens(target.dataset.retryAlbum); return; }
            if (target.dataset.loadMoreAlbum) { store.loadAlbumListens(target.dataset.loadMoreAlbum, { more: true }); return; }
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
        const rowMain = event.target.closest('.eco-row-main');
        const row = rowMain?.closest('[data-album-id]');
        if (row) store.toggleAlbum(row.dataset.albumId);
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
        document.querySelectorAll('.ecos-main time.eco-time, .ecos-main time.eco-track-time').forEach(time => {
            time.textContent = ecoTimestamp(time.dateTime);
        });
    }, 60000);

    // Update cooldown countdown on the sync pill once per second while active.
    const cooldownTimer = setInterval(() => {
        if (state.cooldownUntil > 0) {
            if (state.cooldownUntil <= Date.now()) state.cooldownUntil = 0;
            renderPill();
        }
    }, 1000);

    const ready = store.load();
    return {
        store,
        ready,
        destroy() {
            clearInterval(clock);
            clearInterval(cooldownTimer);
            unsubscribe();
            controller.abort();
        }
    };
}

if (document.getElementById('ecos-main')) mountEcos();
