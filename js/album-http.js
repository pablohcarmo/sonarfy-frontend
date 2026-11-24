import { createAuthClient, getAccessToken, setAccessToken, clearAccessToken } from './auth-http.js';
import { apiRatingToStars, starsToApiRating } from './album-review-http.js';
import { parseRetryAfterSeconds } from './echoes-http.js';
import { timestamp, validateReview } from './profile-utils.js';

const MONTHS_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function createAlbumError(message, status, extras = {}) {
    const error = new Error(message);
    if (status !== undefined) error.status = status;
    Object.assign(error, extras);
    return error;
}

function normalizePrecision(raw) {
    if (typeof raw !== 'string') return null;
    const value = raw.trim().toLowerCase();
    if (value === 'ano' || value === 'year') return 'ano';
    if (value === 'mes' || value === 'month') return 'mes';
    if (value === 'dia' || value === 'day') return 'dia';
    return null;
}

// Format releaseOn honoring releasePrecision (ano, mes, dia) without inventing missing date parts.
export function formatReleaseDate(releaseOn, releasePrecision) {
    if (typeof releaseOn !== 'string' || !releaseOn.trim()) return '';
    const precision = normalizePrecision(releasePrecision);
    if (!precision) return '';
    const raw = releaseOn.trim();

    if (precision === 'ano') {
        const match = raw.match(/^(\d{4})/);
        return match ? match[1] : '';
    }
    if (precision === 'mes') {
        const match = raw.match(/^(\d{4})-(\d{2})/);
        if (!match) return '';
        const monthIndex = Number(match[2]) - 1;
        if (monthIndex < 0 || monthIndex > 11) return '';
        return `${MONTHS_PT[monthIndex]} ${match[1]}`;
    }
    if (precision === 'dia') {
        const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!match) return '';
        const year = Number(match[1]);
        const monthIndex = Number(match[2]) - 1;
        const day = Number(match[3]);
        if (monthIndex < 0 || monthIndex > 11 || day < 1 || day > 31) return '';
        const check = new Date(Date.UTC(year, monthIndex, day));
        if (check.getUTCFullYear() !== year || check.getUTCMonth() !== monthIndex || check.getUTCDate() !== day) return '';
        return `${String(day).padStart(2, '0')} ${MONTHS_PT[monthIndex]} ${year}`;
    }
    return '';
}

// Normalize GET /api/albums/{spotifyId} payload into the Album Page model.
export function mapAlbumDetails(dto) {
    const invalidMessage = 'Resposta de detalhes do álbum inválida.';
    const spotifyId = typeof dto?.spotifyId === 'string' ? dto.spotifyId.trim() : '';
    const name = typeof dto?.name === 'string' ? dto.name.trim() : '';
    if (!spotifyId || !name) {
        throw createAlbumError(invalidMessage);
    }

    const reviewCount = dto?.reviewCount;
    if (!Number.isSafeInteger(reviewCount) || reviewCount < 0) {
        throw createAlbumError(invalidMessage);
    }

    let averageRating = null;
    let averageRatingApi = null;
    if (dto.averageRating !== null && dto.averageRating !== undefined) {
        const rawAvg = Number(dto.averageRating);
        if (!Number.isFinite(rawAvg) || rawAvg < 0 || rawAvg > 10) {
            throw createAlbumError(invalidMessage);
        }
        averageRatingApi = rawAvg;
        averageRating = apiRatingToStars(rawAvg);
    }

    let totalTracks = null;
    if (dto.totalTracks !== null && dto.totalTracks !== undefined) {
        if (!Number.isSafeInteger(dto.totalTracks) || dto.totalTracks < 0) {
            throw createAlbumError(invalidMessage);
        }
        totalTracks = dto.totalTracks;
    }

    const releasePrecision = normalizePrecision(dto.releasePrecision);
    const releaseOn = typeof dto.releaseOn === 'string' && dto.releaseOn.trim() ? dto.releaseOn.trim() : null;
    const releaseLabel = formatReleaseDate(releaseOn, releasePrecision);
    const releaseYear = releaseOn && /^(\d{4})/.test(releaseOn) ? releaseOn.slice(0, 4) : '';
    const coverUrl = typeof dto.coverUrl === 'string' && dto.coverUrl.trim() ? dto.coverUrl.trim() : null;

    return {
        spotifyId,
        name,
        coverUrl,
        artist: typeof dto.artist?.name === 'string' ? dto.artist.name.trim() : '',
        artistSpotifyId: typeof dto.artist?.spotifyId === 'string' ? dto.artist.spotifyId.trim() : null,
        releaseOn,
        releasePrecision,
        releaseLabel,
        releaseYear,
        totalTracks,
        trackCount: totalTracks,
        spotifyUrl: `https://open.spotify.com/album/${encodeURIComponent(spotifyId)}`,
        averageRating,
        averageRatingApi,
        reviewCount
    };
}

// Normalize own review DTO from GET/POST/PUT review endpoints.
export function mapOwnReview(dto, viewer = null) {
    if (!dto || dto.reviewId == null) return null;
    const rawRating = Number(dto.rating);
    if (!Number.isFinite(rawRating) || rawRating < 0 || rawRating > 10) {
        throw createAlbumError('Resposta de avaliação inválida.');
    }
    const reviewText = typeof dto.reviewText === 'string' ? validateReview(dto.reviewText) : '';
    return {
        reviewId: dto.reviewId,
        rating: apiRatingToStars(rawRating),
        ratingApi: rawRating,
        reviewText,
        createdAt: dto.createdAt || null,
        updatedAt: dto.updatedAt || null,
        publishedLabel: dto.createdAt ? timestamp(dto.createdAt) : '',
        authorName: viewer?.displayName || 'Você',
        authorHandle: viewer?.handle || ''
    };
}

// Create the authenticated HTTP adapter for Album details and own review lifecycle.
export function createHttpAlbumAdapter({
    baseUrl = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : 'http://localhost:8080/api',
    fetcher = (...args) => fetch(...args),
    getToken = () => getAccessToken(),
    setToken = token => setAccessToken(token),
    clearToken = () => clearAccessToken(),
    expire = () => {
        clearToken();
        if (typeof location !== 'undefined' && typeof location.assign === 'function') {
            location.assign('login.html');
        }
    },
    authClient,
    routes = {
        home: 'feed.html',
        profile: 'profile.html',
        settings: 'account.html',
        echoes: 'echoes.html',
        review: 'album-review.html',
        login: 'login.html'
    }
} = {}) {
    const client = authClient || createAuthClient({
        baseUrl,
        fetcher,
        getToken,
        setToken,
        clearToken,
        expire
    });

    async function authorizedRequest(path, init = {}) {
        const token = getToken();
        if (!token) {
            expire();
            throw createAlbumError('Entre novamente para acessar este álbum.', 401, { retryable: false });
        }
        let result;
        try {
            result = await client.authorizedFetch(path, {
                credentials: 'omit',
                cache: 'no-store',
                ...init
            });
        } catch (error) {
            if (init.signal?.aborted || error?.cause?.name === 'AbortError' || error?.name === 'AbortError') {
                const abortError = new Error('Requisição cancelada.');
                abortError.name = 'AbortError';
                throw abortError;
            }
            throw error;
        }
        const { response, token: usedToken } = result;
        if (response.status !== 401 && getToken() !== usedToken) {
            throw createAlbumError('A sessão mudou. Recarregando informações.', 409, { code: 'SESSION_CHANGED', retryable: true });
        }
        return response;
    }

    async function fetchAlbumDetails(spotifyId, { signal } = {}) {
        const safeId = typeof spotifyId === 'string' ? spotifyId.trim() : '';
        if (!safeId) {
            throw createAlbumError('Identificador do álbum inválido.', 400, { code: 'INVALID_ALBUM_ID', retryable: false });
        }
        const response = await authorizedRequest(`/albums/${encodeURIComponent(safeId)}`, { method: 'GET', signal });
        const retryAfterSeconds = parseRetryAfterSeconds(response.headers?.get?.('Retry-After'));

        if (response.status === 400) {
            throw createAlbumError('Identificador do álbum inválido.', 400, { code: 'INVALID_ALBUM_ID', retryable: false });
        }
        if (response.status === 401) {
            throw createAlbumError('Sessão expirada. Entre novamente.', 401, { retryable: false });
        }
        if (response.status === 404) {
            throw createAlbumError('Álbum não encontrado.', 404, { code: 'ALBUM_NOT_FOUND', retryable: false });
        }
        if (response.status === 502) {
            throw createAlbumError('Não foi possível consultar o catálogo no momento. Tente novamente em instantes.', 502, {
                code: 'PROVIDER_ERROR',
                retryable: true
            });
        }
        if (response.status === 503) {
            const message = retryAfterSeconds
                ? `O serviço do catálogo está temporariamente indisponível. Aguarde ${retryAfterSeconds}s e tente novamente.`
                : 'O serviço do catálogo está temporariamente indisponível. Tente novamente em instantes.';
            throw createAlbumError(message, 503, {
                code: 'PROVIDER_UNAVAILABLE',
                retryAfterSeconds,
                retryable: true
            });
        }
        if (response.status === 504) {
            throw createAlbumError('O serviço do catálogo demorou para responder. Tente novamente em instantes.', 504, {
                code: 'PROVIDER_TIMEOUT',
                retryable: true
            });
        }
        if (response.status !== 200) {
            throw createAlbumError('Não foi possível carregar este álbum agora. Tente novamente.', response.status, {
                retryAfterSeconds,
                retryable: true
            });
        }

        let dto;
        try {
            dto = await response.json();
        } catch (cause) {
            throw createAlbumError('Resposta de detalhes do álbum inválida.', undefined, { cause, retryable: true });
        }
        return mapAlbumDetails(dto);
    }

    async function fetchViewer({ signal } = {}) {
        try {
            const response = await authorizedRequest('/profile/me', { method: 'GET', signal });
            if (response.status !== 200) return null;
            const dto = await response.json();
            const identity = dto?.identity;
            if (!identity?.handle && typeof identity?.displayName !== 'string') return null;
            return {
                id: identity.id != null ? String(identity.id) : null,
                displayName: identity.displayName || 'Você',
                handle: identity.handle || ''
            };
        } catch (error) {
            if (error?.name === 'AbortError' || error?.status === 401 || error?.code === 'SESSION_CHANGED') throw error;
            return null;
        }
    }

    async function fetchOwnReview(spotifyId, { signal, viewer = null } = {}) {
        const safeId = typeof spotifyId === 'string' ? spotifyId.trim() : '';
        if (!safeId) return null;
        const response = await authorizedRequest(`/albums/${encodeURIComponent(safeId)}/reviews/me`, { method: 'GET', signal });
        if (response.status === 404) return null;
        if (response.status === 401) {
            throw createAlbumError('Sessão expirada. Entre novamente.', 401, { retryable: false });
        }
        if (response.status !== 200) {
            throw createAlbumError('Não foi possível carregar sua avaliação deste álbum.', response.status, { retryable: true });
        }
        let dto;
        try {
            dto = await response.json();
        } catch (cause) {
            throw createAlbumError('Resposta de avaliação inválida.', undefined, { cause, retryable: true });
        }
        return mapOwnReview(dto, viewer);
    }

    async function loadAlbum({ albumId, signal } = {}) {
        const safeId = typeof albumId === 'string' ? albumId.trim() : '';
        if (!safeId) {
            throw createAlbumError('Identificador do álbum inválido.', 400, { code: 'INVALID_ALBUM_ID', retryable: false });
        }

        const [albumResult, ownReviewResult, viewerResult] = await Promise.allSettled([
            fetchAlbumDetails(safeId, { signal }),
            fetchOwnReview(safeId, { signal }),
            fetchViewer({ signal })
        ]);

        if (albumResult.status === 'rejected') {
            throw albumResult.reason;
        }
        if (ownReviewResult.status === 'rejected') {
            const err = ownReviewResult.reason;
            if (err?.name === 'AbortError' || err?.status === 401 || err?.code === 'SESSION_CHANGED') {
                throw err;
            }
        }
        if (viewerResult.status === 'rejected') {
            const err = viewerResult.reason;
            if (err?.name === 'AbortError' || err?.status === 401 || err?.code === 'SESSION_CHANGED') {
                throw err;
            }
        }

        const viewer = viewerResult.status === 'fulfilled' ? viewerResult.value : null;
        let userReview = ownReviewResult.status === 'fulfilled' ? ownReviewResult.value : null;
        if (userReview && viewer) {
            userReview = {
                ...userReview,
                authorName: viewer.displayName || userReview.authorName,
                authorHandle: viewer.handle || userReview.authorHandle
            };
        }

        const userReviewError = ownReviewResult.status === 'rejected'
            ? (ownReviewResult.reason?.message || 'Não foi possível verificar sua avaliação agora.')
            : '';

        return {
            album: albumResult.value,
            userReview,
            userReviewError,
            reviews: [],
            communityReviewsAvailable: false
        };
    }

    function prepareReviewPayload({ rating, reviewText }) {
        const apiRating = starsToApiRating(rating);
        if (apiRating === null) {
            throw createAlbumError('Selecione uma nota válida entre 0 e 5 estrelas.', 400);
        }
        const trimmed = typeof reviewText === 'string' ? reviewText.trim() : '';
        if ([...trimmed].length > 255 || trimmed.includes('\0')) {
            throw createAlbumError('A resenha deve ter até 255 caracteres.', 400);
        }
        return JSON.stringify({ rating: apiRating, reviewText: trimmed || null });
    }

    async function createReview(spotifyId, { rating, reviewText }, { signal } = {}) {
        const safeId = typeof spotifyId === 'string' ? spotifyId.trim() : '';
        if (!safeId) throw createAlbumError('Identificador do álbum inválido.', 400);
        const body = prepareReviewPayload({ rating, reviewText });
        const response = await authorizedRequest(`/albums/${encodeURIComponent(safeId)}/reviews`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            signal
        });
        if (response.status === 401) throw createAlbumError('Sessão expirada. Entre novamente.', 401);
        if (response.status === 409) {
            const existingReview = await fetchOwnReview(safeId, { signal }).catch(() => null);
            throw createAlbumError('Você já avaliou este álbum. Carregamos sua avaliação para edição.', 409, {
                existingReview
            });
        }
        if (response.status === 400) throw createAlbumError('Dados de avaliação inválidos.', 400);
        if (response.status === 404) throw createAlbumError('Álbum não encontrado.', 404);
        if (response.status !== 201) throw createAlbumError('Não foi possível publicar a avaliação.', response.status);
        return mapOwnReview(await response.json());
    }

    async function updateReview(reviewId, { rating, reviewText }, { signal } = {}) {
        if (reviewId == null) throw createAlbumError('Avaliação não identificada.', 400);
        const body = prepareReviewPayload({ rating, reviewText });
        const response = await authorizedRequest(`/reviews/${encodeURIComponent(reviewId)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body,
            signal
        });
        if (response.status === 401) throw createAlbumError('Sessão expirada. Entre novamente.', 401);
        if (response.status === 400) throw createAlbumError('Dados de avaliação inválidos.', 400);
        if (response.status === 404) throw createAlbumError('Avaliação não encontrada.', 404);
        if (response.status !== 200) throw createAlbumError('Não foi possível atualizar a avaliação.', response.status);
        return mapOwnReview(await response.json());
    }

    async function deleteReview(reviewId, { signal } = {}) {
        if (reviewId == null) return;
        const response = await authorizedRequest(`/reviews/${encodeURIComponent(reviewId)}`, {
            method: 'DELETE',
            signal
        });
        if (response.status === 204 || response.status === 404) return;
        if (response.status === 401) throw createAlbumError('Sessão expirada. Entre novamente.', 401);
        throw createAlbumError('Não foi possível excluir a avaliação.', response.status);
    }

    return {
        isDemo: false,
        communityReviewsAvailable: false,
        routes,
        getSessionKey: () => getToken() || null,
        loadAlbum,
        fetchAlbumDetails,
        fetchOwnReview,
        createReview,
        updateReview,
        deleteReview
    };
}
