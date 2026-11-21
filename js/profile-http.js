// Seleciona somente os campos públicos usados pelo cabeçalho, sem dados cadastrais.
export function mapProfile(dto) {
    const { identity: p, viewer, statistics } = dto || {};
    if (!p?.id || !p.handle || typeof p.displayName !== 'string' || typeof viewer?.isFollowing !== 'boolean' || typeof viewer?.isSelf !== 'boolean'
        || ![statistics?.followers, statistics?.following].every(n => Number.isSafeInteger(n) && n >= 0))
        throw new Error('Resposta de perfil inválida. Tente novamente.');
    return { id: String(p.id), handle: p.handle, displayName: p.displayName, avatar: p.avatarUrl,
        cover: p.coverUrl, bio: p.biography, city: p.location?.city, country: p.location?.country,
        joinedAt: p.joinedAt, followers: statistics.followers, following: statistics.following,
        isFollowing: viewer.isFollowing, followUncertain: false, editable: false };
}

// O token é lido a cada operação e nunca entra na URL, nas fixtures ou nas mensagens.
export function createHttpProfileAdapter({ baseUrl = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : 'http://localhost:8080/api',
    fetcher = (...args) => fetch(...args), getToken = () => localStorage.getItem('sonarfy_token'),
    expire = () => { localStorage.removeItem('sonarfy_token'); location.assign('login.html'); } } = {}) {
    let loaded, sessionToken, needsRefresh = false;
    // Traduz falhas de transporte e leitura JSON para mensagens seguras, sem expor erros brutos do navegador.
    async function request(path, method = 'GET') {
        const token = getToken();
        if (!token || (sessionToken && token !== sessionToken)) {
            const error = new Error('Entre novamente para acessar o perfil.'); error.status = 401;
            if (!token) expire();
            throw error;
        }
        let response;
        try {
            response = await fetcher(`${baseUrl.replace(/\/$/, '')}${path}`, {
                method, headers: { Authorization: `Bearer ${token}` }, credentials: 'omit', cache: 'no-store'
            });
        } catch (cause) {
            const error = new Error('Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.');
            error.cause = cause; throw error;
        }
        if (getToken() !== token) throw new Error('A sessão mudou. Recarregue o perfil.');
        if (response.status === 401) expire();
        if (response.status !== (method === 'GET' ? 200 : 204)) {
            const error = new Error(response.status === 401 ? 'Sessão expirada. Entre novamente.'
                : response.status === 404 ? 'Perfil indisponível.' : 'Não foi possível concluir. Tente novamente.');
            error.status = response.status; throw error;
        }
        if (method !== 'GET') return null;
        try { return await response.json(); }
        catch (cause) {
            const error = new Error('Resposta de perfil inválida. Tente novamente.');
            error.cause = cause; throw error;
        }
    }
    const read = handle => request(`/profile/by-handle/${encodeURIComponent(handle)}`);
    return {
        demo: false,
        async load(handle) {
            loaded = null; needsRefresh = false; sessionToken = getToken();
            const me = mapProfile(await request('/profile/me'));
            const profile = handle ? mapProfile(await read(handle)) : me;
            loaded = { profile, session: { userId: me.id }, contentAvailable: false,
                activities: [], replies: [], collection: [] };
            return loaded;
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
