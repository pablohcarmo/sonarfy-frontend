import { clearAccessToken, logoutSession } from './auth-http.js';

export const ECOS_MAX_ITEMS = 50;

const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// Format Eco timestamps: live playback, relative < 24h (18m / 3h), and Mês Dia >= 24h.
export function ecoTimestamp(value, { isPlaying = false, now = Date.now() } = {}) {
    if (isPlaying) return 'Ouvindo agora';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const diffMs = Math.max(0, now - date.getTime());
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(diffMs / 3600000);
    if (hours < 24) return `${hours}h`;
    return `${months[date.getMonth()]} ${String(date.getDate()).padStart(2, '0')}`;
}

// Validate and normalize /api/echoes/albums payload without fabricating missing fields.
export function validateEcos(data) {
    if (!data || !Array.isArray(data.items)) {
        throw new Error('Dados dos ecos indisponíveis.');
    }

    const items = data.items.map(item => {
        const spotifyId = typeof item?.album?.spotifyId === 'string' && item.album.spotifyId.trim()
            ? item.album.spotifyId.trim()
            : typeof item?.album?.id === 'string' && item.album.id.trim()
                ? item.album.id.trim()
                : '';
        const name = item?.album?.name || item?.album?.title;
        const lastPlayedAt = item?.lastPlayedAt || item?.playedAt;
        const listenCount = item?.listenCount;
        if (!spotifyId || !name || !Number.isFinite(new Date(lastPlayedAt).getTime()) || !Number.isInteger(listenCount) || listenCount < 0) {
            throw new Error('Álbum inválido.');
        }
        return {
            album: {
                ...item.album,
                spotifyId,
                id: spotifyId,
                name,
                title: name,
                coverUrl: item.album.coverUrl ?? item.album.cover ?? null,
                cover: item.album.coverUrl ?? item.album.cover ?? null
            },
            lastPlayedAt: String(lastPlayedAt),
            listenCount,
            isPlaying: Boolean(item.isPlaying)
        };
    });

    const connection = data.connection || {
        status: data.connected === false ? 'DISCONNECTED' : 'CONNECTED',
        connectedAt: null,
        recentListensAuthorized: data.connected !== false
    };
    const nextCursor = typeof data.nextCursor === 'string' && data.nextCursor.trim() ? data.nextCursor.trim() : null;
    const sync = {
        lastSucceededAt: data.sync?.lastSucceededAt || null,
        historyStartsAt: data.sync?.historyStartsAt || null,
        nextAllowedAt: data.sync?.nextAllowedAt || null
    };

    return {
        connected: connection.status === 'CONNECTED' && Boolean(connection.recentListensAuthorized),
        connection,
        items,
        nextCursor,
        sync
    };
}

// Validate and normalize /api/echoes/albums/{spotifyId}/listens payload without deduplicating by track.spotifyId.
export function validateAlbumListens(data) {
    if (!data || !Array.isArray(data.items)) {
        throw new Error('Resposta de reproduções inválida.');
    }
    const items = data.items.map(item => {
        const trackName = item?.track?.name || item?.trackName;
        if (!item?.id && item?.id !== 0) throw new Error('Reprodução inválida.');
        if (!trackName || !Number.isFinite(new Date(item?.playedAt).getTime())) {
            throw new Error('Reprodução inválida.');
        }
        const artists = Array.isArray(item.artists)
            ? item.artists.filter(a => typeof a?.name === 'string' && a.name.trim())
            : [];
        return {
            ...item,
            id: String(item.id),
            playedAt: String(item.playedAt),
            isPlaying: Boolean(item.isPlaying),
            trackName,
            artists,
            track: {
                ...(item.track || {}),
                name: trackName,
                durationMs: typeof item.track?.durationMs === 'number' && Number.isFinite(item.track.durationMs) ? item.track.durationMs : null
            }
        };
    });
    const nextCursor = typeof data.nextCursor === 'string' && data.nextCursor.trim() ? data.nextCursor.trim() : null;
    return { items, nextCursor };
}

function resolveCooldownUntil(sync, retryAfterSeconds) {
    const candidates = [];
    if (typeof retryAfterSeconds === 'number' && retryAfterSeconds > 0) {
        candidates.push(Date.now() + retryAfterSeconds * 1000);
    }
    if (sync?.nextAllowedAt) {
        const parsed = Date.parse(sync.nextAllowedAt);
        if (Number.isFinite(parsed) && parsed > Date.now()) {
            candidates.push(parsed);
        }
    }
    return candidates.length ? Math.max(...candidates) : 0;
}

function createEmptyDetail() {
    return {
        expanded: false,
        loaded: false,
        loading: false,
        loadingMore: false,
        error: null,
        items: [],
        nextCursor: null
    };
}

// Manage distinct-album listing, per-album lazy listen histories, generation invalidation, and sync lock.
export function createEcosState(adapter) {
    let generation = 0;
    const state = {
        status: 'idle',
        data: null,
        error: null,
        loadMoreError: null,
        refreshing: false,
        loadingMore: false,
        syncResult: null,
        cooldownUntil: 0,
        details: {}
    };
    const listeners = new Set();
    const emit = () => listeners.forEach(fn => fn(state));

    function ensureDetail(spotifyId) {
        if (!state.details[spotifyId]) {
            state.details[spotifyId] = createEmptyDetail();
        }
        return state.details[spotifyId];
    }

    async function loadInitial() {
        if (state.status === 'loading' || state.refreshing) return;
        const reqGen = ++generation;
        state.status = 'loading';
        state.error = null;
        state.loadMoreError = null;
        emit();
        try {
            const payload = validateEcos(await adapter.load());
            if (reqGen !== generation) return;
            state.data = structuredClone(payload);
            state.cooldownUntil = resolveCooldownUntil(payload.sync, null);
            state.status = 'ready';
        } catch (error) {
            if (reqGen !== generation) return;
            state.error = error.message || 'Não foi possível carregar seus álbuns.';
            if (!state.data) state.status = 'error';
        } finally {
            if (reqGen === generation) emit();
        }
    }

    async function loadMore() {
        const cursor = state.data?.nextCursor;
        if (!cursor || state.status === 'loading' || state.refreshing || state.loadingMore) return;
        const reqGen = generation;
        state.loadingMore = true;
        state.loadMoreError = null;
        emit();
        try {
            const payload = validateEcos(await adapter.load({ cursor }));
            if (reqGen !== generation) return;
            const seen = new Set(state.data.items.map(item => item.album.spotifyId));
            const appended = payload.items.filter(item => !seen.has(item.album.spotifyId));
            state.data = {
                ...state.data,
                items: [...state.data.items, ...structuredClone(appended)],
                nextCursor: payload.nextCursor,
                sync: payload.sync
            };
            state.cooldownUntil = Math.max(state.cooldownUntil, resolveCooldownUntil(payload.sync, null));
        } catch (error) {
            if (reqGen !== generation) return;
            state.loadMoreError = error.message || 'Não foi possível carregar mais álbuns.';
        } finally {
            if (reqGen === generation) {
                state.loadingMore = false;
                emit();
            }
        }
    }

    async function loadAlbumListens(spotifyId, { more = false } = {}) {
        const detail = ensureDetail(spotifyId);
        if (detail.loading || detail.loadingMore) return;
        const cursor = more ? detail.nextCursor : null;
        if (more && !cursor) return;
        if (typeof adapter.loadAlbumListens !== 'function') return;

        const reqGen = generation;
        if (more) {
            detail.loadingMore = true;
        } else {
            detail.loading = true;
        }
        detail.error = null;
        emit();
        try {
            const payload = validateAlbumListens(await adapter.loadAlbumListens(spotifyId, cursor ? { cursor } : {}));
            if (reqGen !== generation) return;
            if (more) {
                const seen = new Set(detail.items.map(item => item.id));
                const appended = payload.items.filter(item => !seen.has(item.id));
                detail.items = [...detail.items, ...structuredClone(appended)];
            } else {
                detail.items = structuredClone(payload.items);
            }
            detail.nextCursor = payload.nextCursor;
            detail.loaded = true;
        } catch (error) {
            if (reqGen !== generation) return;
            detail.error = error.message || 'Não foi possível carregar as reproduções deste álbum.';
        } finally {
            if (reqGen === generation) {
                detail.loading = false;
                detail.loadingMore = false;
                emit();
            }
        }
    }

    async function toggleAlbum(spotifyId) {
        if (!spotifyId) return;
        const detail = ensureDetail(spotifyId);
        detail.expanded = !detail.expanded;
        emit();
        if (detail.expanded && !detail.loaded && !detail.loading) {
            await loadAlbumListens(spotifyId);
        }
    }

    async function syncNow() {
        if (state.status === 'loading' || state.refreshing || state.loadingMore) return;
        if (state.cooldownUntil > Date.now()) return;
        if (!state.data) {
            return loadInitial();
        }
        state.refreshing = true;
        state.error = null;
        state.loadMoreError = null;
        emit();
        try {
            if (typeof adapter.sync === 'function') {
                const result = await adapter.sync();
                state.syncResult = result;
                // Invalidate list, cursors, and all per-album histories so stale responses are discarded.
                const nextGen = ++generation;
                state.details = {};
                const payload = validateEcos(await adapter.load());
                if (nextGen !== generation) return;
                state.data = structuredClone(payload);
                state.cooldownUntil = resolveCooldownUntil(payload.sync, result.retryAfterSeconds);
            } else {
                const nextGen = ++generation;
                state.details = {};
                const loader = typeof adapter.refresh === 'function' ? adapter.refresh : adapter.load;
                const payload = validateEcos(await loader());
                if (nextGen !== generation) return;
                state.data = structuredClone(payload);
            }
            state.status = 'ready';
        } catch (error) {
            if (error?.status === 409 && error.connection && state.data) {
                state.data = {
                    ...state.data,
                    connection: error.connection,
                    connected: error.connection.status === 'CONNECTED' && Boolean(error.connection.recentListensAuthorized)
                };
            }
            if (typeof error?.retryAfterSeconds === 'number' && error.retryAfterSeconds > 0) {
                state.cooldownUntil = Date.now() + error.retryAfterSeconds * 1000;
            }
            state.error = error.message || 'Não foi possível sincronizar suas reproduções.';
        } finally {
            state.refreshing = false;
            emit();
        }
    }

    return {
        state,
        subscribe(fn) {
            listeners.add(fn);
            return () => listeners.delete(fn);
        },
        load: loadInitial,
        loadMore,
        toggleAlbum,
        loadAlbumListens,
        sync: syncNow,
        refresh: syncNow
    };
}

// Revoke the server session via host hook or POST /api/auth/logout and clear local credentials.
export async function logout(adapter = {}, navigate = url => window.location.assign(url), options) {
    if (adapter?.actions?.logout) {
        clearAccessToken();
        try {
            await adapter.actions.logout();
        } finally {
            clearAccessToken();
        }
        return;
    }
    try {
        await logoutSession(options);
    } catch {
        // Local cleanup and redirect proceed even when remote revocation fails.
    } finally {
        clearAccessToken();
        navigate(adapter?.routes?.login || 'login.html');
    }
}
