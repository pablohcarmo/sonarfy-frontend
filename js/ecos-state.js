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

// Validate and normalize Ecos payload, enforcing the 50-item cap.
export function validateEcos(data) {
    if (!data || typeof data.connected !== 'boolean') {
        throw new Error('Dados dos ecos indisponíveis.');
    }
    if (!data.connected) {
        return { connected: false, items: [] };
    }
    if (!Array.isArray(data.items)) {
        throw new Error('Lista de reproduções inválida.');
    }
    const items = data.items.slice(0, ECOS_MAX_ITEMS).map(item => {
        const trackName = item?.trackName || item?.track;
        const playedAtValid = item?.isPlaying || Number.isFinite(new Date(item?.playedAt).getTime());
        if (!item?.id || !item.album?.id || !item.album.title || !item.album.artist || !trackName || !playedAtValid) {
            throw new Error('Reprodução inválida.');
        }
        return {
            ...item,
            trackName,
            isPlaying: Boolean(item.isPlaying)
        };
    });
    return { connected: true, items };
}

// Manage Ecos loading, refresh concurrency lock, error recovery, and connected/empty state.
export function createEcosState(adapter) {
    const state = { status: 'idle', data: null, error: null, refreshing: false };
    const listeners = new Set();
    const emit = () => listeners.forEach(fn => fn(state));

    async function fetchData(isRefresh = false) {
        if (state.status === 'loading' || state.refreshing) return;
        if (isRefresh && state.data) {
            state.refreshing = true;
        } else {
            state.status = 'loading';
        }
        state.error = null;
        emit();
        try {
            const loader = isRefresh && typeof adapter.refresh === 'function' ? adapter.refresh : adapter.load;
            const payload = validateEcos(await loader());
            state.data = structuredClone(payload);
            state.status = 'ready';
        } catch (error) {
            state.error = error.message || 'Não foi possível carregar suas reproduções.';
            if (!state.data) state.status = 'error';
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
        load: () => fetchData(false),
        refresh: () => fetchData(true)
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
