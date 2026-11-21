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
    async function request(path, method = 'GET', { body, expectedStatus = method === 'GET' ? 200 : 204 } = {}) {
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
                : response.status === 400 || response.status === 422 ? 'Verifique os dados informados (nome até 60 caracteres e bio até 150 caracteres).'
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
            const me = mapProfile(await request('/profile/me'));
            const profile = handle ? mapProfile(await read(handle)) : me;
            loaded = { profile, session: { userId: me.id }, contentAvailable: false,
                activities: [], replies: [], collection: [] };
            return loaded;
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
