import { createAuthClient, getAccessToken, setAccessToken, clearAccessToken } from './auth-http.js';
import { AVATAR_UPLOAD_POLICY, validateAvatarCrop, validateAvatarFile } from './avatar-crop.js';

// Seleciona somente os campos públicos usados pelo cabeçalho, sem dados cadastrais.
export function mapProfile(dto) {
    const { identity: p, viewer, statistics } = dto || {};
    if (!p?.id || !p.handle || typeof p.displayName !== 'string' || typeof viewer?.isFollowing !== 'boolean' || typeof viewer?.isSelf !== 'boolean'
        || ![statistics?.followers, statistics?.following].every(n => Number.isSafeInteger(n) && n >= 0))
        throw new Error('Resposta de perfil inválida. Tente novamente.');
    return { id: String(p.id), handle: p.handle, displayName: p.displayName, avatar: p.avatarUrl,
        cover: p.coverUrl, bio: p.biography, city: p.location?.city, country: p.location?.country,
        joinedAt: p.joinedAt, followers: statistics.followers, following: statistics.following,
        isFollowing: viewer.isFollowing, followUncertain: false, editable: Boolean(viewer.canEdit) };
}

// Normaliza a identidade pública do autor em respostas paginadas de avaliações/coleção.
function mapReviewAuthor(rawAuthor, errorMessage) {
    if (!rawAuthor?.id || !rawAuthor.handle || typeof rawAuthor.displayName !== 'string') {
        throw new Error(errorMessage);
    }
    return {
        id: String(rawAuthor.id),
        handle: rawAuthor.handle,
        displayName: rawAuthor.displayName,
        avatar: rawAuthor.avatarUrl || null
    };
}

// Normaliza um item ReviewDto preservando a ordem do servidor e sem fabricar contadores sociais.
function mapReviewItem(entry, author, errorMessage) {
    const rawRating = Number(entry?.rating);
    if (entry?.reviewId == null || !entry?.album || !Number.isFinite(rawRating) || rawRating < 0 || rawRating > 10) {
        throw new Error(errorMessage);
    }
    const title = entry.album.name || '';
    return {
        id: String(entry.reviewId),
        reviewId: entry.reviewId,
        author,
        album: {
            id: entry.album.spotifyId || '',
            spotifyId: entry.album.spotifyId || '',
            title,
            artist: entry.album.artist?.name || '',
            cover: entry.album.coverUrl || null,
            mark: (title || 'S').slice(0, 2).toUpperCase()
        },
        rating: Math.round((rawRating / 2) * 100) / 100,
        review: typeof entry.reviewText === 'string' ? entry.reviewText : '',
        createdAt: entry.createdAt || null,
        updatedAt: entry.updatedAt || null,
        liked: false,
        likeCount: 0,
        commentCount: 0,
        socialAvailable: false
    };
}

// Normaliza a resposta paginada de GET /api/profile/by-handle/{handle}/reviews preservando a ordem do servidor.
export function mapProfileReviews(dto) {
    const errorMessage = 'Resposta de avaliações inválida. Tente novamente.';
    const { author: rawAuthor, items: rawItems, nextBeforeId } = dto || {};
    if (!Array.isArray(rawItems)
        || (nextBeforeId !== null && nextBeforeId !== undefined && (!Number.isSafeInteger(nextBeforeId) || nextBeforeId <= 0))) {
        throw new Error(errorMessage);
    }
    const author = mapReviewAuthor(rawAuthor, errorMessage);
    const items = rawItems.map(entry => mapReviewItem(entry, author, errorMessage));
    return { author, items, nextBeforeId: nextBeforeId ?? null };
}

// Normaliza a resposta paginada de GET /api/profile/by-handle/{handle}/collection preservando cursor opaco e totais.
export function mapProfileCollection(dto) {
    const errorMessage = 'Resposta da coleção inválida. Tente novamente.';
    const { author: rawAuthor, items: rawItems, totalReviews, matchingReviews, nextCursor } = dto || {};
    if (!Array.isArray(rawItems)
        || !Number.isSafeInteger(totalReviews) || totalReviews < 0
        || !Number.isSafeInteger(matchingReviews) || matchingReviews < 0
        || (nextCursor !== null && nextCursor !== undefined && (typeof nextCursor !== 'string' || !nextCursor))) {
        throw new Error(errorMessage);
    }
    const author = mapReviewAuthor(rawAuthor, errorMessage);
    const items = rawItems.map(entry => mapReviewItem(entry, author, errorMessage));
    return { author, items, totalReviews, matchingReviews, nextCursor: nextCursor ?? null };
}

// O token é lido a cada operação e nunca entra na URL, nas fixtures ou nas mensagens.
export function createHttpProfileAdapter({ baseUrl = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : 'http://localhost:8080/api',
    fetcher = (...args) => fetch(...args), getToken = () => getAccessToken(),
    setToken = token => setAccessToken(token),
    expire = () => { clearAccessToken(); location.assign('login.html'); },
    authClient } = {}) {
    let loaded, sessionToken, needsRefresh = false;
    const client = authClient || createAuthClient({
        baseUrl,
        fetcher,
        getToken,
        setToken: token => {
            sessionToken = token;
            setToken(token);
        },
        clearToken: () => clearAccessToken(),
        expire
    });
    // Traduz falhas de transporte e leitura JSON para mensagens seguras, sem expor erros brutos do navegador.
    async function request(path, method = 'GET', { body, expectedStatus = method === 'GET' ? 200 : 204, badRequestMessage } = {}) {
        const token = getToken();
        if (!token || (sessionToken && token !== sessionToken)) {
            const error = new Error('Entre novamente para acessar o perfil.'); error.status = 401;
            if (!token) expire();
            throw error;
        }
        const init = { method, credentials: 'omit', cache: 'no-store' };
        if (body !== undefined) {
            init.headers = { 'Content-Type': 'application/json' };
            init.body = JSON.stringify(body);
        }
        const { response, token: usedToken } = await client.authorizedFetch(path, init, {
            onTokenRefreshed: nextToken => { sessionToken = nextToken; }
        });
        if (response.status !== 401 && getToken() !== usedToken) throw new Error('A sessão mudou. Recarregue o perfil.');
        if (response.status !== expectedStatus) {
            const error = new Error(response.status === 401 ? 'Sessão expirada. Entre novamente.'
                : response.status === 404 ? 'Perfil indisponível.'
                : response.status === 400 || response.status === 422 ? (badRequestMessage || 'Verifique os dados informados (nome até 60 caracteres e bio até 150 caracteres).')
                : 'Não foi possível concluir. Tente novamente.');
            error.status = response.status; throw error;
        }
        if (expectedStatus === 204) return null;
        try { return await response.json(); }
        catch (cause) {
            const error = new Error('Resposta de perfil inválida. Tente novamente.');
            error.cause = cause; throw error;
        }
    }
    const read = handle => request(`/profile/by-handle/${encodeURIComponent(handle)}`);
    return {
        demo: false,
        uploadPolicy: AVATAR_UPLOAD_POLICY,
        async load(handle) {
            loaded = null; needsRefresh = false; sessionToken = getToken();
            const cleanHandle = String(handle || '').trim().replace(/^@+/, '');
            const me = mapProfile(await request('/profile/me'));
            const profile = cleanHandle ? mapProfile(await read(cleanHandle)) : me;
            loaded = { profile, session: { userId: me.id }, contentAvailable: false,
                activities: [], replies: [], collection: [] };
            return loaded;
        },
        // Carrega página de avaliações públicas do perfil por handle sem @ e com cursor opcional.
        async loadReviews(handle, { limit = 20, beforeId = null } = {}) {
            if (!sessionToken) sessionToken = getToken();
            const cleanHandle = String(handle || '').trim().replace(/^@+/, '');
            if (!cleanHandle) {
                const error = new Error('Perfil indisponível.'); error.status = 404;
                throw error;
            }
            const safeLimit = Number.isInteger(limit) && limit >= 1 && limit <= 50 ? limit : 20;
            const params = new URLSearchParams({ limit: String(safeLimit) });
            if (beforeId != null) params.set('beforeId', String(beforeId));
            const dto = await request(
                `/profile/by-handle/${encodeURIComponent(cleanHandle)}/reviews?${params.toString()}`,
                'GET',
                { expectedStatus: 200, badRequestMessage: 'Parâmetros de paginação inválidos.' }
            );
            return mapProfileReviews(dto);
        },
        // Carrega página da coleção pública do perfil por handle sem @, com ordenação, filtro e cursor opaco.
        async loadCollection(handle, { limit = 20, sort = 'recent', writtenOnly = false, cursor = null } = {}) {
            if (!sessionToken) sessionToken = getToken();
            const cleanHandle = String(handle || '').trim().replace(/^@+/, '');
            if (!cleanHandle) {
                const error = new Error('Perfil indisponível.'); error.status = 404;
                throw error;
            }
            const safeLimit = Number.isInteger(limit) && limit >= 1 && limit <= 50 ? limit : 20;
            const resolvedSort = sort === 'written' ? 'recent'
                : ['recent', 'oldest', 'highest', 'lowest'].includes(sort) ? sort : 'recent';
            const resolvedWrittenOnly = sort === 'written' ? true : Boolean(writtenOnly);
            const params = new URLSearchParams({
                limit: String(safeLimit),
                sort: resolvedSort,
                writtenOnly: String(resolvedWrittenOnly)
            });
            if (cursor != null && cursor !== '') params.set('cursor', String(cursor));
            const dto = await request(
                `/profile/by-handle/${encodeURIComponent(cleanHandle)}/collection?${params.toString()}`,
                'GET',
                { expectedStatus: 200, badRequestMessage: 'Parâmetros de coleção inválidos.' }
            );
            return mapProfileCollection(dto);
        },
        // Atualiza nota (0-5 estrelas -> 0-10 API em passos de 0,5) e texto via PUT /api/reviews/{reviewId}.
        async updateReview(reviewId, { rating, reviewText } = {}) {
            if (reviewId == null) throw new Error('Avaliação não identificada.');
            if (!sessionToken) sessionToken = getToken();
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
            const dto = await request(
                `/reviews/${encodeURIComponent(reviewId)}`,
                'PUT',
                {
                    body: { rating: apiRating, reviewText: trimmed || null },
                    expectedStatus: 200,
                    badRequestMessage: 'Verifique a nota e a resenha (até 255 caracteres).'
                }
            );
            const fallbackAuthor = loaded?.profile || { id: '0', handle: 'user', displayName: 'Usuário' };
            return mapReviewItem(dto, fallbackAuthor, 'Resposta de avaliação inválida. Tente novamente.');
        },
        // Exclui avaliação própria via DELETE /api/reviews/{reviewId}; 204 e 404 confirmam remoção.
        async deleteReview(reviewId) {
            if (reviewId == null) return;
            if (!sessionToken) sessionToken = getToken();
            try {
                await request(`/reviews/${encodeURIComponent(reviewId)}`, 'DELETE', { expectedStatus: 204 });
            } catch (error) {
                if (error?.status === 404) return;
                throw error;
            }
        },
        // Atualiza nome de exibição e biografia via PUT /api/profile/me e reconcilia o ProfileDto retornado.
        async updateProfile({ displayName, bio }) {
            if (loaded && !loaded.profile.editable) throw new Error('Sem permissão para editar este perfil.');
            const payload = {
                displayName: typeof displayName === 'string' ? displayName.trim() : '',
                biography: typeof bio === 'string' ? bio : ''
            };
            const updated = mapProfile(await request('/profile/me', 'PUT', { body: payload, expectedStatus: 200 }));
            if (loaded) loaded.profile = updated;
            return updated;
        },
        // Envia arquivo único em multipart/form-data para /profile/me/avatar ou /profile/me/wallpaper.
        async uploadMedia(path, file, extraFields = null, fallbackMessage = 'Não foi possível enviar a imagem. Tente novamente.') {
            if (loaded && !loaded.profile.editable) throw new Error('Sem permissão para editar este perfil.');
            validateAvatarFile(file);
            const token = getToken();
            if (!token || (sessionToken && token !== sessionToken)) {
                const error = new Error('Entre novamente para acessar o perfil.'); error.status = 401;
                if (!token) expire();
                throw error;
            }
            const formData = new FormData();
            formData.append('file', file);
            if (extraFields) {
                for (const [key, value] of Object.entries(extraFields)) {
                    formData.append(key, String(value));
                }
            }
            const { response, token: usedToken } = await client.authorizedFetch(path, {
                method: 'POST',
                body: formData,
                credentials: 'omit',
                cache: 'no-store'
            }, {
                onTokenRefreshed: nextToken => { sessionToken = nextToken; }
            });
            if (response.status !== 401 && getToken() !== usedToken) throw new Error('A sessão mudou. Recarregue o perfil.');
            if (response.status !== 200) {
                const message = response.status === 401 ? 'Sessão expirada. Entre novamente.'
                    : response.status === 413 ? 'A imagem excede o limite máximo de 5 MiB.'
                    : response.status === 415 ? 'Formato de imagem não suportado. Use apenas JPEG ou PNG estático.'
                    : response.status === 400 ? 'Imagem ou recorte inválido. Envie um JPEG ou PNG estático de até 16 milhões de pixels.'
                    : response.status === 503 ? 'Serviço de armazenamento temporariamente indisponível. Tente novamente.'
                    : fallbackMessage;
                const error = new Error(message);
                error.status = response.status;
                throw error;
            }
            let dto;
            try { dto = await response.json(); }
            catch (cause) {
                const error = new Error('Resposta de perfil inválida. Tente novamente.');
                error.cause = cause;
                throw error;
            }
            const updated = mapProfile(dto);
            if (loaded) loaded.profile = updated;
            return updated;
        },
        // Envia avatar em multipart/form-data com recorte inteiro opcional para POST /api/profile/me/avatar.
        async uploadAvatar(file, crop = null) {
            const validatedCrop = validateAvatarCrop(crop);
            return this.uploadMedia('/profile/me/avatar', file, validatedCrop, 'Não foi possível enviar o avatar. Tente novamente.');
        },
        // Envia capa/wallpaper em multipart/form-data (campo único file) para POST /api/profile/me/wallpaper.
        async uploadWallpaper(file) {
            return this.uploadMedia('/profile/me/wallpaper', file, null, 'Não foi possível enviar a capa. Tente novamente.');
        },
        async follow(following) {
            if (!loaded || loaded.profile.id === loaded.session.userId) throw new Error('Este é o perfil autenticado.');
            try {
                if (!needsRefresh) {
                    needsRefresh = true;
                    await request(`/profile/${encodeURIComponent(loaded.profile.id)}/following`, following ? 'PUT' : 'DELETE');
                }
                const profile = mapProfile(await read(loaded.profile.handle));
                if (profile.id !== loaded.profile.id) throw new Error('O perfil mudou. Recarregue a página.');
                needsRefresh = false;
                return profile;
            } catch (error) {
                error.reconcileRequired = true;
                if (error.status !== 401 && error.status !== 404)
                    error.message = 'Não foi possível confirmar o relacionamento. Atualize o estado antes de tentar novamente.';
                throw error;
            }
        }
    };
}
