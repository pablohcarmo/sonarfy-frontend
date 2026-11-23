import { createAuthClient, getAccessToken, setAccessToken, clearAccessToken } from './auth-http.js';
import { SPOTIFY_SYNCED_KEY, markSpotifySynced } from './spotify-sync-state.js';

export const SPOTIFY_STATUSES = ['CONNECTED', 'DISCONNECTED', 'REAUTHORIZATION_REQUIRED'];

export const SPOTIFY_CALLBACK_MESSAGES = {
    connected: 'Sua conta do Spotify foi conectada com sucesso!',
    denied: 'A conexão com o Spotify foi cancelada. Você pode tentar novamente quando quiser.',
    invalid_state: 'A tentativa de autorização com o Spotify expirou ou foi invalidada. Inicie uma nova tentativa.',
    error: 'Não foi possível concluir a conexão com o Spotify no momento. Tente novamente.'
};

export const SPOTIFY_DISCONNECT_NOTICE = 'Conta do Spotify desconectada do Sonarfy. Para revogar a permissão do aplicativo, remova o acesso no painel de aplicativos conectados da sua conta Spotify.';

// Validate that the Spotify authorization URL points strictly to HTTPS accounts.spotify.com.
export function validateSpotifyAuthorizationUrl(rawUrl) {
    if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
        throw new Error('URL de autorização do Spotify inválida. Tente novamente.');
    }
    let parsed;
    try {
        parsed = new URL(rawUrl.trim());
    } catch {
        throw new Error('URL de autorização do Spotify inválida. Tente novamente.');
    }
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'accounts.spotify.com' || parsed.username || parsed.password) {
        throw new Error('URL de autorização do Spotify inválida. Tente novamente.');
    }
    return parsed.href;
}

// Read and remove the ?spotify= callback query parameter from the current URL.
export function readSpotifyCallbackOutcome(loc = typeof location !== 'undefined' ? location : null, hist = typeof history !== 'undefined' ? history : null) {
    if (!loc || typeof loc.search !== 'string') return null;
    const params = new URLSearchParams(loc.search);
    const outcome = params.get('spotify');
    if (!outcome || !Object.prototype.hasOwnProperty.call(SPOTIFY_CALLBACK_MESSAGES, outcome)) {
        return null;
    }
    params.delete('spotify');
    const query = params.toString();
    const cleaned = `${loc.pathname || ''}${query ? `?${query}` : ''}${loc.hash || ''}`;
    try {
        if (hist && typeof hist.replaceState === 'function') {
            hist.replaceState(null, '', cleaned);
        }
    } catch {}
    return {
        outcome,
        message: SPOTIFY_CALLBACK_MESSAGES[outcome],
        isError: outcome !== 'connected'
    };
}

// Synchronize the local Spotify onboarding marker with the authoritative backend status.
export function syncLocalSpotifyMarker(status, storage = typeof localStorage !== 'undefined' ? localStorage : null) {
    if (!storage) return;
    try {
        if (status === 'CONNECTED') {
            markSpotifySynced(storage);
        } else {
            storage.removeItem(SPOTIFY_SYNCED_KEY);
        }
    } catch {}
}

// Create the HTTP client for Spotify OAuth authorization, connection status, and disconnect.
export function createSpotifyClient({
    baseUrl,
    fetcher = (...args) => fetch(...args),
    getToken = () => getAccessToken(),
    setToken = token => setAccessToken(token),
    expire = () => {
        clearAccessToken();
        if (typeof location !== 'undefined' && typeof location.assign === 'function') {
            location.assign('login.html');
        }
    },
    storage = typeof localStorage !== 'undefined' ? localStorage : null,
    authClient
} = {}) {
    const client = authClient || createAuthClient({
        baseUrl,
        fetcher,
        getToken,
        setToken,
        clearToken: () => clearAccessToken(),
        expire
    });

    return {
        // Request a new OAuth authorization URL via POST /api/spotify/authorization.
        async startAuthorization() {
            const { response } = await client.authorizedFetch('/spotify/authorization', {
                method: 'POST',
                credentials: 'omit',
                cache: 'no-store'
            });
            if (response.status === 401) {
                const error = new Error('Sessão expirada. Entre novamente.');
                error.status = 401;
                throw error;
            }
            if (response.status === 403) {
                const error = new Error('Sua conta precisa estar ativa e verificada para conectar o Spotify.');
                error.status = 403;
                throw error;
            }
            if (response.status === 429) {
                const error = new Error('Muitas tentativas de conexão com o Spotify. Aguarde alguns minutos e tente novamente.');
                error.status = 429;
                throw error;
            }
            if (response.status !== 200) {
                const error = new Error('Não foi possível iniciar a conexão com o Spotify. Tente novamente.');
                error.status = response.status;
                throw error;
            }
            let payload;
            try {
                payload = await response.json();
            } catch (cause) {
                const error = new Error('Resposta inválida ao iniciar conexão com o Spotify.');
                error.cause = cause;
                throw error;
            }
            const authorizationUrl = validateSpotifyAuthorizationUrl(payload?.authorizationUrl);
            return { authorizationUrl };
        },

        // Query the authoritative Spotify connection status via GET /api/spotify/connection.
        async getConnection() {
            const { response } = await client.authorizedFetch('/spotify/connection', {
                method: 'GET',
                credentials: 'omit',
                cache: 'no-store'
            });
            if (response.status === 401) {
                const error = new Error('Sessão expirada. Entre novamente.');
                error.status = 401;
                throw error;
            }
            if (response.status !== 200) {
                const error = new Error('Não foi possível consultar o status da conexão com o Spotify.');
                error.status = response.status;
                throw error;
            }
            let payload;
            try {
                payload = await response.json();
            } catch (cause) {
                const error = new Error('Resposta de conexão do Spotify inválida.');
                error.cause = cause;
                throw error;
            }
            const status = SPOTIFY_STATUSES.includes(payload?.status) ? payload.status : null;
            if (!status) {
                throw new Error('Resposta de conexão do Spotify inválida.');
            }
            const connectedAt = typeof payload.connectedAt === 'string' ? payload.connectedAt : null;
            const recentListensAuthorized = status === 'CONNECTED' && payload.recentListensAuthorized === true;
            syncLocalSpotifyMarker(status, storage);
            return { status, connectedAt, spotifyConnected: status === 'CONNECTED', recentListensAuthorized };
        },

        // Disconnect the Spotify integration idempotently via DELETE /api/spotify/connection.
        async disconnectConnection() {
            const { response } = await client.authorizedFetch('/spotify/connection', {
                method: 'DELETE',
                credentials: 'omit',
                cache: 'no-store'
            });
            if (response.status === 401) {
                const error = new Error('Sessão expirada. Entre novamente.');
                error.status = 401;
                throw error;
            }
            if (response.status !== 204) {
                const error = new Error('Não foi possível desconectar o Spotify. Tente novamente.');
                error.status = response.status;
                throw error;
            }
            syncLocalSpotifyMarker('DISCONNECTED', storage);
            return {
                status: 'DISCONNECTED',
                connectedAt: null,
                spotifyConnected: false,
                recentListensAuthorized: false,
                message: SPOTIFY_DISCONNECT_NOTICE
            };
        }
    };
}
