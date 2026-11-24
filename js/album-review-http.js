import { createAuthClient, getAccessToken, setAccessToken, clearAccessToken } from './auth-http.js';

// Convert 0..5 star UI rating into 0..10 API rating in 0.5 increments.
export function starsToApiRating(stars) {
    const num = Number(stars);
    if (!Number.isFinite(num) || num < 0 || num > 5) return null;
    return Math.round(num * 4) / 2;
}

// Convert 0..10 API rating into 0..5 star UI rating.
export function apiRatingToStars(rating) {
    const num = Number(rating);
    if (!Number.isFinite(num) || num < 0 || num > 10) return 0;
    return Math.round((num / 2) * 100) / 100;
}

function createReviewError(message, status, extras = {}) {
    const error = new Error(message);
    if (status !== undefined) error.status = status;
    Object.assign(error, extras);
    return error;
}

function mapReviewDto(dto) {
    if (!dto || dto.reviewId == null) return null;
    const album = dto.album ? {
        spotifyId: dto.album.spotifyId || '',
        name: dto.album.name || '',
        artist: dto.album.artist?.name || '',
        coverUrl: dto.album.coverUrl || null
    } : null;
    return {
        reviewId: dto.reviewId,
        album,
        rating: apiRatingToStars(dto.rating),
        reviewText: typeof dto.reviewText === 'string' ? dto.reviewText : '',
        createdAt: dto.createdAt || null,
        updatedAt: dto.updatedAt || null
    };
}

// Create the HTTP adapter for /api/albums/{spotifyId}/reviews and /api/reviews/{reviewId}.
export function createHttpAlbumReviewAdapter({
    baseUrl,
    apiBaseUrl,
    fetcher,
    fetchImpl,
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
    routes = { home: 'feed.html', profile: 'profile.html', settings: 'account.html', echoes: 'echoes.html', login: 'login.html' }
} = {}) {
    const resolvedBaseUrl = baseUrl ?? apiBaseUrl ?? (typeof API_BASE_URL === 'string' ? API_BASE_URL : 'http://localhost:8080/api');
    const resolvedFetcher = fetcher ?? fetchImpl ?? ((...args) => fetch(...args));
    const client = authClient || createAuthClient({
        baseUrl: resolvedBaseUrl,
        fetcher: resolvedFetcher,
        getToken,
        setToken,
        clearToken,
        expire
    });

    async function request(path, options = {}) {
        const token = getToken();
        if (!token) {
            expire();
            throw createReviewError('Sua sessão expirou. Faça login novamente.', 401);
        }
        const { response, token: usedToken } = await client.authorizedFetch(path, {
            credentials: 'omit',
            cache: 'no-store',
            ...options
        });
        if (response.status === 401) {
            throw createReviewError('Sua sessão expirou. Faça login novamente.', 401);
        }
        if (getToken() !== usedToken) {
            throw createReviewError('A sessão mudou. Tente novamente.', 409, { code: 'SESSION_CHANGED' });
        }
        return response;
    }

    async function loadAlbumReview(spotifyId) {
        if (!spotifyId) return { album: null, review: null };
        const response = await request(`/albums/${encodeURIComponent(spotifyId)}/reviews/me`, { method: 'GET' });
        if (response.status === 404) return { album: null, review: null };
        if (!response.ok) throw createReviewError('Não foi possível carregar a avaliação deste álbum.', response.status);
        const dto = await response.json();
        const review = mapReviewDto(dto);
        return { album: review?.album || null, review };
    }

    async function publishReview({ spotifyId, reviewId, rating, reviewText }) {
        const apiRating = starsToApiRating(rating);
        if (apiRating === null) throw createReviewError('Selecione uma nota válida antes de publicar.', 400);
        const trimmed = typeof reviewText === 'string' ? reviewText.trim() : '';
        if ([...trimmed].length > 255 || trimmed.includes('\0')) {
            throw createReviewError('A resenha deve ter até 255 caracteres.', 400);
        }
        const payload = JSON.stringify({ rating: apiRating, reviewText: trimmed || null });
        const headers = { 'Content-Type': 'application/json' };

        if (reviewId != null) {
            const response = await request(`/reviews/${encodeURIComponent(reviewId)}`, { method: 'PUT', headers, body: payload });
            if (response.status === 400) throw createReviewError('Dados de avaliação inválidos.', 400);
            if (response.status === 404) throw createReviewError('Avaliação não encontrada.', 404);
            if (!response.ok) throw createReviewError('Não foi possível atualizar a avaliação.', response.status);
            return mapReviewDto(await response.json());
        }

        if (!spotifyId) throw createReviewError('Álbum não identificado para avaliação.', 400);
        const response = await request(`/albums/${encodeURIComponent(spotifyId)}/reviews`, { method: 'POST', headers, body: payload });
        if (response.status === 409) {
            const current = await loadAlbumReview(spotifyId).catch(() => ({ review: null }));
            throw createReviewError('Você já avaliou este álbum. Carregamos sua avaliação para edição.', 409, {
                existingReview: current.review || null
            });
        }
        if (response.status === 400) throw createReviewError('Dados de avaliação inválidos.', 400);
        if (response.status === 404) throw createReviewError('Álbum não encontrado no catálogo.', 404);
        if (!response.ok) throw createReviewError('Não foi possível publicar a avaliação.', response.status);
        return mapReviewDto(await response.json());
    }

    async function deleteReview(reviewId) {
        if (reviewId == null) return;
        const response = await request(`/reviews/${encodeURIComponent(reviewId)}`, { method: 'DELETE' });
        if (response.status === 204 || response.status === 404) return;
        if (!response.ok) throw createReviewError('Não foi possível excluir a avaliação.', response.status);
    }

    async function logout() {
        if (typeof client.logoutSession === 'function') {
            await client.logoutSession();
        } else {
            clearToken();
        }
    }

    return {
        routes,
        loadAlbumReview,
        publishReview,
        deleteReview,
        logout
    };
}
