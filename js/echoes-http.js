import { createAuthClient, getAccessToken, setAccessToken, clearAccessToken } from './auth-http.js';
import { createSpotifyClient } from './spotify-http.js';

// Parse Retry-After header (delta-seconds or HTTP-date) into positive integer seconds.
export function parseRetryAfterSeconds(rawValue, now = Date.now()) {
    if (typeof rawValue !== 'string' || !rawValue.trim()) return null;
    const trimmed = rawValue.trim();
    if (/^\d+$/.test(trimmed)) {
        const seconds = Number(trimmed);
        return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
    }
    const targetMs = Date.parse(trimmed);
    if (!Number.isFinite(targetMs)) return null;
    const deltaSeconds = Math.ceil((targetMs - now) / 1000);
    return deltaSeconds > 0 ? deltaSeconds : null;
}

function createEchoesError(message, status, extras = {}) {
    const error = new Error(message);
    if (status !== undefined) error.status = status;
    Object.assign(error, extras);
    return error;
}

function normalizeSyncMeta(rawSync) {
    return {
        lastSucceededAt: typeof rawSync?.lastSucceededAt === 'string' ? rawSync.lastSucceededAt : null,
        historyStartsAt: typeof rawSync?.historyStartsAt === 'string' ? rawSync.historyStartsAt : null,
        nextAllowedAt: typeof rawSync?.nextAllowedAt === 'string' ? rawSync.nextAllowedAt : null
    };
}

function normalizeCursor(rawCursor) {
    return typeof rawCursor === 'string' && rawCursor.trim() ? rawCursor.trim() : null;
}

// Normalize a distinct album summary item from GET /api/echoes/albums without fabricating missing fields.
function mapAlbumSummaryItem(raw) {
    const spotifyId = typeof raw?.album?.spotifyId === 'string' ? raw.album.spotifyId.trim() : '';
    const name = typeof raw?.album?.name === 'string' ? raw.album.name.trim() : '';
    const lastPlayedAt = typeof raw?.lastPlayedAt === 'string' ? raw.lastPlayedAt : '';
    const listenCount = raw?.listenCount;
    if (!spotifyId || !name || !Number.isFinite(new Date(lastPlayedAt).getTime()) || !Number.isInteger(listenCount) || listenCount < 0) {
        throw new Error('Resposta de álbuns inválida.');
    }
    const coverUrl = typeof raw.album.coverUrl === 'string' && raw.album.coverUrl.trim() ? raw.album.coverUrl.trim() : null;
    const rated = raw?.rated === true;
    const hasReviewId = (typeof raw?.reviewId === 'number' && Number.isFinite(raw.reviewId))
        || (typeof raw?.reviewId === 'string' && raw.reviewId.trim() !== '');
    const reviewId = rated && hasReviewId ? raw.reviewId : null;
    return {
        album: {
            spotifyId,
            id: spotifyId,
            name,
            title: name,
            coverUrl,
            cover: coverUrl
        },
        lastPlayedAt,
        listenCount,
        rated,
        reviewId
    };
}

// Normalize an individual listen item from GET /api/echoes/albums/{spotifyId}/listens.
function mapEchoItem(raw) {
    if (!raw || (typeof raw.id !== 'number' && typeof raw.id !== 'string') || !raw.playedAt || !raw.track?.name || !raw.album?.name) {
        throw new Error('Resposta de reproduções inválida.');
    }
    const artists = Array.isArray(raw.artists)
        ? raw.artists.filter(a => typeof a?.name === 'string' && a.name.trim()).map(a => ({
            spotifyId: typeof a.spotifyId === 'string' ? a.spotifyId : null,
            name: a.name
        }))
        : [];
    const coverUrl = typeof raw.album.coverUrl === 'string' && raw.album.coverUrl.trim() ? raw.album.coverUrl.trim() : null;
    const spotifyId = typeof raw.album.spotifyId === 'string' && raw.album.spotifyId.trim() ? raw.album.spotifyId.trim() : null;
    return {
        id: String(raw.id),
        playedAt: String(raw.playedAt),
        isPlaying: false,
        trackName: raw.track.name,
        track: {
            spotifyId: typeof raw.track.spotifyId === 'string' ? raw.track.spotifyId : null,
            name: raw.track.name,
            durationMs: typeof raw.track.durationMs === 'number' && Number.isFinite(raw.track.durationMs) ? raw.track.durationMs : null,
            explicit: Boolean(raw.track.explicit)
        },
        artists,
        album: {
            id: spotifyId || `album-${raw.id}`,
            spotifyId,
            title: raw.album.name,
            name: raw.album.name,
            cover: coverUrl,
            coverUrl
        }
    };
}

function buildPaginationQuery(limit, cursor) {
    const safeLimit = Math.min(50, Math.max(1, Math.trunc(Number(limit) || 20)));
    const params = new URLSearchParams({ limit: String(safeLimit) });
    if (typeof cursor === 'string') {
        const trimmed = cursor.trim();
        if (trimmed && trimmed !== 'null' && trimmed !== 'undefined') {
            params.set('cursor', trimmed);
        }
    }
    return params.toString();
}

// Create the authenticated HTTP client for /api/echoes/albums, per-album listens, and /api/echoes/sync.
export function createEchoesClient({
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
        // List distinct albums ordered by most recent play via GET /api/echoes/albums.
        async listAlbums({ limit = 20, cursor = null } = {}) {
            const query = buildPaginationQuery(limit, cursor);
            const { response } = await client.authorizedFetch(`/echoes/albums?${query}`, {
                method: 'GET',
                credentials: 'omit',
                cache: 'no-store'
            });
            if (response.status === 401) {
                throw createEchoesError('Sessão expirada. Entre novamente.', 401);
            }
            if (response.status === 400) {
                throw createEchoesError('Parâmetro de paginação inválido. Tente recarregar a lista.', 400, { code: 'INVALID_CURSOR' });
            }
            if (response.status !== 200) {
                throw createEchoesError('Não foi possível carregar seus álbuns agora. Tente novamente.', response.status);
            }
            let payload;
            try {
                payload = await response.json();
            } catch (cause) {
                throw createEchoesError('Resposta de álbuns inválida.', undefined, { cause });
            }
            if (!Array.isArray(payload?.items)) {
                throw createEchoesError('Resposta de álbuns inválida.');
            }
            return {
                items: payload.items.map(mapAlbumSummaryItem),
                nextCursor: normalizeCursor(payload.nextCursor),
                sync: normalizeSyncMeta(payload.sync)
            };
        },

        // List individual listens for a specific album via GET /api/echoes/albums/{spotifyId}/listens.
        async listAlbumListens(spotifyId, { limit = 20, cursor = null } = {}) {
            const safeId = typeof spotifyId === 'string' ? spotifyId.trim() : '';
            if (!safeId) {
                throw createEchoesError('Identificador do álbum inválido.', 400);
            }
            const query = buildPaginationQuery(limit, cursor);
            const { response } = await client.authorizedFetch(`/echoes/albums/${encodeURIComponent(safeId)}/listens?${query}`, {
                method: 'GET',
                credentials: 'omit',
                cache: 'no-store'
            });
            if (response.status === 401) {
                throw createEchoesError('Sessão expirada. Entre novamente.', 401);
            }
            if (response.status === 400) {
                throw createEchoesError('Não foi possível continuar a paginação deste álbum.', 400, { code: 'INVALID_CURSOR' });
            }
            if (response.status !== 200) {
                throw createEchoesError('Não foi possível carregar as reproduções deste álbum. Tente novamente.', response.status);
            }
            let payload;
            try {
                payload = await response.json();
            } catch (cause) {
                throw createEchoesError('Resposta de reproduções inválida.', undefined, { cause });
            }
            if (!Array.isArray(payload?.items)) {
                throw createEchoesError('Resposta de reproduções inválida.');
            }
            return {
                items: payload.items.map(mapEchoItem),
                nextCursor: normalizeCursor(payload.nextCursor),
                sync: normalizeSyncMeta(payload.sync)
            };
        },

        // Trigger manual Spotify recent-listens sync via POST /api/echoes/sync.
        async sync() {
            const { response } = await client.authorizedFetch('/echoes/sync', {
                method: 'POST',
                credentials: 'omit',
                cache: 'no-store'
            });
            const retryAfterSeconds = parseRetryAfterSeconds(response.headers?.get?.('Retry-After'));

            if (response.status === 401) {
                throw createEchoesError('Sessão expirada. Entre novamente.', 401);
            }
            if (response.status === 403) {
                throw createEchoesError('Sua conta precisa estar ativa e verificada para sincronizar com o Spotify.', 403);
            }
            if (response.status === 409) {
                throw createEchoesError('Sua conexão com o Spotify precisa ser configurada ou reautorizada.', 409, { code: 'SPOTIFY_CONFLICT' });
            }
            if (response.status === 429 || response.status === 503) {
                const waitText = retryAfterSeconds
                    ? `Aguarde ${retryAfterSeconds}s antes de tentar sincronizar novamente.`
                    : 'Muitas solicitações ou serviço ocupado no momento. Aguarde alguns instantes e tente novamente.';
                throw createEchoesError(waitText, response.status, { retryAfterSeconds });
            }
            if (response.status === 502 || response.status === 504) {
                throw createEchoesError('O Spotify está temporariamente indisponível no momento. Tente novamente em instantes.', response.status);
            }
            if (response.status !== 200) {
                throw createEchoesError('Não foi possível sincronizar suas reproduções agora. Tente novamente.', response.status);
            }

            let payload;
            try {
                payload = await response.json();
            } catch (cause) {
                throw createEchoesError('Resposta de sincronização inválida.', undefined, { cause });
            }
            return {
                fetched: Number(payload?.fetched) || 0,
                imported: Number(payload?.imported) || 0,
                alreadyKnown: Number(payload?.alreadyKnown) || 0,
                skipped: Number(payload?.skipped) || 0,
                complete: Boolean(payload?.complete),
                possibleGap: Boolean(payload?.possibleGap),
                newestPlayedAt: typeof payload?.newestPlayedAt === 'string' ? payload.newestPlayedAt : null,
                syncedAt: typeof payload?.syncedAt === 'string' ? payload.syncedAt : null,
                retryAfterSeconds
            };
        }
    };
}

// Create the HTTP Ecos adapter backed by /api/echoes/albums, /api/echoes/albums/{id}/listens, and /api/echoes/sync.
export function createHttpEchoesAdapter(options = {}) {
    const echoesClient = options.echoesClient || createEchoesClient(options);
    const spotifyClient = options.spotifyClient || createSpotifyClient(options);

    return {
        demo: false,
        routes: {
            home: 'feed.html',
            echoes: 'echoes.html',
            profile: 'profile.html',
            settings: 'account.html',
            login: 'login.html',
            spotifySync: 'spotify-sync.html?source=echoes',
            album: 'album-review.html'
        },
        async load({ limit = 20, cursor = null } = {}) {
            if (cursor) {
                return echoesClient.listAlbums({ limit, cursor });
            }

            const [page, connection] = await Promise.all([
                echoesClient.listAlbums({ limit }),
                spotifyClient.getConnection().catch(error => {
                    if (error?.status === 401) throw error;
                    return { status: 'DISCONNECTED', connectedAt: null, spotifyConnected: false, recentListensAuthorized: false };
                })
            ]);

            return {
                ...page,
                connection,
                connected: connection.status === 'CONNECTED' && Boolean(connection.recentListensAuthorized)
            };
        },
        async loadAlbumListens(spotifyId, { limit = 20, cursor = null } = {}) {
            return echoesClient.listAlbumListens(spotifyId, { limit, cursor });
        },
        async sync() {
            try {
                return await echoesClient.sync();
            } catch (error) {
                if (error?.status === 409) {
                    const connection = await spotifyClient.getConnection().catch(() => ({
                        status: 'DISCONNECTED',
                        connectedAt: null,
                        spotifyConnected: false,
                        recentListensAuthorized: false
                    }));
                    throw createEchoesError(
                        connection.status === 'REAUTHORIZATION_REQUIRED'
                            ? 'Sua autorização do Spotify expirou. Reconecte sua conta para sincronizar.'
                            : connection.status === 'CONNECTED' && !connection.recentListensAuthorized
                                ? 'Sua conexão atual não possui permissão para escutas recentes. Reconecte o Spotify para habilitar Ecos.'
                                : 'Conecte sua conta do Spotify para sincronizar suas reproduções recentes.',
                        409,
                        { code: 'SPOTIFY_CONFLICT', connection }
                    );
                }
                throw error;
            }
        }
    };
}
