import { createAuthClient, getAccessToken, setAccessToken, clearAccessToken } from './auth-http.js';
import { validateReview } from './profile-utils.js';

// Normaliza a identidade pública do autor de um item do feed.
function mapFeedAuthor(rawAuthor, errorMessage) {
    if (rawAuthor?.id == null || !rawAuthor.handle || typeof rawAuthor.displayName !== 'string') {
        throw new Error(errorMessage);
    }
    return {
        id: String(rawAuthor.id),
        handle: rawAuthor.handle,
        displayName: rawAuthor.displayName,
        avatar: rawAuthor.avatarUrl || null
    };
}

// Normaliza um item de GET /api/feed preservando identidade Spotify, nota 0..5 e ordem do servidor.
export function mapFeedItem(entry, errorMessage = 'Resposta do feed inválida. Tente novamente.') {
    const rawRating = Number(entry?.rating);
    const createdAt = entry?.createdAt;
    if (
        entry?.reviewId == null
        || !entry?.album?.spotifyId
        || typeof entry.album.name !== 'string'
        || !Number.isFinite(rawRating) || rawRating < 0 || rawRating > 10
        || !Number.isFinite(new Date(createdAt).getTime())
    ) {
        throw new Error(errorMessage);
    }
    const review = typeof entry.reviewText === 'string' ? validateReview(entry.reviewText) : '';
    const title = entry.album.name;
    return {
        id: String(entry.reviewId),
        reviewId: entry.reviewId,
        author: mapFeedAuthor(entry.author, errorMessage),
        album: {
            id: entry.album.spotifyId,
            spotifyId: entry.album.spotifyId,
            title,
            artist: entry.album.artist?.name || '',
            artistSpotifyId: entry.album.artist?.spotifyId || '',
            cover: entry.album.coverUrl || null,
            mark: (title || 'S').slice(0, 2).toUpperCase()
        },
        rating: Math.round((rawRating / 2) * 100) / 100,
        review,
        createdAt,
        updatedAt: entry.updatedAt || null
    };
}

// Normaliza a página de GET /api/feed sem reordenar itens nem fabricar campos sociais.
export function mapFeedPage(dto) {
    const errorMessage = 'Resposta do feed inválida. Tente novamente.';
    const { items: rawItems, followingCount, nextCursor } = dto || {};
    if (
        !Array.isArray(rawItems)
        || !Number.isSafeInteger(followingCount) || followingCount < 0
        || (nextCursor !== null && nextCursor !== undefined && (typeof nextCursor !== 'string' || !nextCursor))
    ) {
        throw new Error(errorMessage);
    }
    return {
        items: rawItems.map(entry => mapFeedItem(entry, errorMessage)),
        followingCount,
        nextCursor: nextCursor ?? null
    };
}

// Cria o adapter HTTP real do feed consumindo GET /api/feed, GET /api/profile/me e rotas próprias de avaliação.
export function createHttpFeedAdapter({
    baseUrl,
    fetcher = (...args) => fetch(...args),
    getToken = () => getAccessToken(),
    setToken = token => setAccessToken(token),
    clearToken = () => clearAccessToken(),
    expire = () => { clearToken(); if (typeof location !== 'undefined') location.assign('login.html'); },
    authClient,
    routes = { home: 'feed.html', echoes: 'echoes.html', profile: 'profile.html', settings: 'account.html', login: 'login.html' }
} = {}) {
    let sessionToken = null;
    const client = authClient || createAuthClient({
        baseUrl,
        fetcher,
        getToken,
        setToken: token => { sessionToken = token; setToken(token); },
        clearToken,
        expire
    });

    // Executa chamada autenticada com Bearer, no-store, cancelamento e tradução segura de erros.
    async function request(path, { method = 'GET', body, expectedStatus = 200, signal, badRequestMessage } = {}) {
        const token = getToken();
        if (!token) {
            expire();
            const error = new Error('Entre novamente para acessar o feed.');
            error.status = 401;
            throw error;
        }
        sessionToken = token;
        const init = { method, credentials: 'omit', cache: 'no-store', signal };
        if (body !== undefined) {
            init.headers = { 'Content-Type': 'application/json' };
            init.body = JSON.stringify(body);
        }
        let result;
        try {
            result = await client.authorizedFetch(path, init, {
                onTokenRefreshed: nextToken => { sessionToken = nextToken; }
            });
        } catch (error) {
            if (signal?.aborted || error?.cause?.name === 'AbortError' || error?.name === 'AbortError') {
                const abortError = new Error('Requisição cancelada.');
                abortError.name = 'AbortError';
                throw abortError;
            }
            throw error;
        }
        const { response, token: usedToken } = result;
        if (response.status !== 401 && getToken() !== usedToken) {
            const error = new Error('A sessão mudou. Atualize o feed.');
            error.status = 409;
            throw error;
        }
        if (response.status !== expectedStatus) {
            const message = response.status === 401 ? 'Sessão expirada. Entre novamente.'
                : response.status === 400 ? (badRequestMessage || 'Parâmetros do feed inválidos. Recarregue do início.')
                : 'Não foi possível carregar o feed. Tente novamente.';
            const error = new Error(message);
            error.status = response.status;
            throw error;
        }
        if (expectedStatus === 204) return null;
        try {
            return await response.json();
        } catch (cause) {
            const error = new Error('Resposta do feed inválida. Tente novamente.');
            error.cause = cause;
            throw error;
        }
    }

    return {
        demo: false,
        routes,
        getSessionKey: () => getToken() || null,
        // Carrega uma página de GET /api/feed enviando nextCursor intacto quando fornecido.
        async loadPage({ limit = 20, cursor = null, signal } = {}) {
            const safeLimit = Number.isInteger(limit) && limit >= 1 && limit <= 50 ? limit : 20;
            const params = new URLSearchParams({ limit: String(safeLimit) });
            if (cursor != null && cursor !== '') params.set('cursor', String(cursor));
            const dto = await request(`/feed?${params.toString()}`, {
                method: 'GET',
                expectedStatus: 200,
                signal,
                badRequestMessage: 'A paginação do feed expirou ou ficou inválida. Recarregue do início.'
            });
            return mapFeedPage(dto);
        },
        // Consulta a identidade pública do visitante em GET /api/profile/me para avatar e autoria.
        async loadViewer({ signal } = {}) {
            const dto = await request('/profile/me', { method: 'GET', expectedStatus: 200, signal });
            const p = dto?.identity;
            if (!p?.id || !p.handle || typeof p.displayName !== 'string') return null;
            const viewer = { id: String(p.id), handle: p.handle, displayName: p.displayName, avatar: p.avatarUrl || null };
            return { session: { userId: viewer.id }, viewer };
        },
        // Atualiza avaliação própria via PUT /api/reviews/{reviewId} convertendo 0..5 estrelas para 0..10.
        async updateReview(reviewId, { rating, reviewText } = {}) {
            if (reviewId == null) throw new Error('Avaliação não identificada.');
            const starsNum = Number(rating);
            const apiRating = Number.isFinite(starsNum) ? Math.round(starsNum * 4) / 2 : NaN;
            if (!Number.isFinite(apiRating) || apiRating < 0 || apiRating > 10 || Math.abs(apiRating - starsNum * 2) > 1e-6) {
                const error = new Error('Selecione uma nota válida entre 0 e 5 estrelas.');
                error.status = 400;
                throw error;
            }
            const trimmed = typeof reviewText === 'string' ? reviewText.trim() : '';
            if (Array.from(trimmed).length > 255 || trimmed.includes('\0')) {
                const error = new Error('A resenha deve ter até 255 caracteres.');
                error.status = 400;
                throw error;
            }
            await request(`/reviews/${encodeURIComponent(reviewId)}`, {
                method: 'PUT',
                body: { rating: apiRating, reviewText: trimmed || null },
                expectedStatus: 200,
                badRequestMessage: 'Verifique a nota e a resenha (até 255 caracteres).'
            });
        },
        // Exclui avaliação própria via DELETE /api/reviews/{reviewId}; 204 e 404 confirmam remoção.
        async deleteReview(reviewId) {
            if (reviewId == null) return;
            try {
                await request(`/reviews/${encodeURIComponent(reviewId)}`, { method: 'DELETE', expectedStatus: 204 });
            } catch (error) {
                if (error?.status === 404) return;
                throw error;
            }
        }
    };
}
