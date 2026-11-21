import { createAuthClient, getAccessToken, setAccessToken, clearAccessToken, resolveApiBaseUrl } from './auth-http.js';
import { SPOTIFY_SYNCED_KEY } from './spotify-sync-state.js';

// Read local Spotify sync marker until the dedicated Spotify HTTP integration lands.
function readLocalSpotifyStatus() {
    try {
        return typeof localStorage !== 'undefined' && localStorage.getItem(SPOTIFY_SYNCED_KEY) === 'true';
    } catch {
        return false;
    }
}

// Map backend UserDto to the Account page state snapshot.
export function mapUserDto(dto) {
    if (!dto || dto.id === undefined || dto.id === null || typeof dto.name !== 'string' || typeof dto.surname !== 'string'
        || typeof dto.handle !== 'string' || typeof dto.email !== 'string') {
        throw new Error('Resposta de conta inválida. Tente novamente.');
    }
    return {
        id: String(dto.id),
        firstName: dto.name,
        lastName: dto.surname,
        handle: dto.handle,
        birthDate: typeof dto.birthDate === 'string' ? dto.birthDate : '',
        city: typeof dto.city === 'string' ? dto.city : '',
        country: typeof dto.country === 'string' ? dto.country : '',
        cityId: null,
        email: dto.email,
        spotifyConnected: readLocalSpotifyStatus()
    };
}

// Map backend CityDto items to the autocomplete suggestion format used by account.js.
export function mapCitySuggestions(items) {
    if (!Array.isArray(items)) return [];
    return items
        .filter(item => Number.isInteger(item?.cityId) && item.cityId > 0 && typeof item?.name === 'string' && item.name.trim())
        .map(item => ({
            id: item.cityId,
            name: item.name.trim(),
            adminName1: typeof item.region === 'string' ? item.region.trim() : '',
            countryName: typeof item.country === 'string' ? item.country.trim() : ''
        }));
}

// Create the HTTP account adapter backed by GET/PUT /api/users/me and GET /api/locations/cities.
export function createHttpAccountAdapter({
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

    const unavailable = feature => async () => {
        throw new Error(`${feature} ainda não está disponível no backend.`);
    };

    return {
        demo: false,
        routes: {
            home: 'feed.html',
            profile: 'profile.html',
            settings: 'account.html',
            login: 'login.html',
            spotifySync: 'spotify-sync.html?source=account'
        },
        // Load authenticated user registration data from GET /api/users/me.
        async load() {
            const { response } = await client.authorizedFetch('/users/me', {
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
                const error = new Error('Não foi possível carregar as configurações. Tente novamente.');
                error.status = response.status;
                throw error;
            }
            let dto;
            try {
                dto = await response.json();
            } catch (cause) {
                const error = new Error('Resposta de conta inválida. Tente novamente.');
                error.cause = cause;
                throw error;
            }
            return { account: mapUserDto(dto) };
        },
        // Search cities through the public GET /api/locations/cities endpoint without sending Bearer.
        async searchCities(query, { signal } = {}) {
            if (typeof globalThis.sonarfyCitySearch === 'function') {
                const custom = await globalThis.sonarfyCitySearch(query, { signal });
                return Array.isArray(custom) ? custom.map(item => ({
                    id: item.id ?? item.cityId ?? null,
                    name: item.name || '',
                    adminName1: item.adminName1 ?? item.region ?? '',
                    countryName: item.countryName ?? item.country ?? ''
                })) : [];
            }
            const trimmed = String(query || '').trim();
            if (trimmed.length < 2) return [];
            const url = `${resolveApiBaseUrl(baseUrl)}/locations/cities?q=${encodeURIComponent(trimmed)}`;
            let response;
            try {
                response = await fetcher(url, {
                    method: 'GET',
                    credentials: 'omit',
                    cache: 'no-store',
                    signal
                });
            } catch (cause) {
                if (cause?.name === 'AbortError') throw cause;
                const error = new Error('Não foi possível buscar cidades no momento. Tente novamente.');
                error.cause = cause;
                throw error;
            }
            if (response.status !== 200) {
                const error = new Error(response.status === 503
                    ? 'Serviço de localização temporariamente indisponível. Tente novamente mais tarde.'
                    : 'Não foi possível buscar cidades no momento. Tente novamente.');
                error.status = response.status;
                throw error;
            }
            try {
                return mapCitySuggestions(await response.json());
            } catch {
                return [];
            }
        },
        // Update personal data via PUT /api/users/me sending cityId only when a new city was chosen.
        async updateAccount(payload) {
            const body = {
                name: payload.firstName,
                surname: payload.lastName,
                handle: payload.handle,
                birthDate: payload.birthDate
            };
            if (Number.isInteger(payload.cityId) && payload.cityId > 0) {
                body.cityId = payload.cityId;
            }
            const { response } = await client.authorizedFetch('/users/me', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'omit',
                cache: 'no-store',
                body: JSON.stringify(body)
            });
            if (response.status === 401) {
                const error = new Error('Sessão expirada. Entre novamente.');
                error.status = 401;
                throw error;
            }
            if (response.status === 409) {
                const error = new Error('Este nome de usuário já está em uso. Escolha outro @.');
                error.status = 409;
                throw error;
            }
            if (response.status === 400) {
                const error = new Error('Verifique os dados informados (nome, sobrenome, usuário de 1 a 15 caracteres e idade mínima de 13 anos).');
                error.status = 400;
                throw error;
            }
            if (response.status === 503) {
                const error = new Error('Serviço de localização temporariamente indisponível. Tente novamente sem alterar a cidade ou mais tarde.');
                error.status = 503;
                throw error;
            }
            if (response.status !== 200) {
                const error = new Error('Não foi possível salvar as alterações. Tente novamente.');
                error.status = response.status;
                throw error;
            }
            let dto;
            try {
                dto = await response.json();
            } catch (cause) {
                const error = new Error('Resposta de conta inválida. Tente novamente.');
                error.cause = cause;
                throw error;
            }
            return { account: mapUserDto(dto), cooldownSeconds: 30 };
        },
        requestEmailChange: unavailable('Alteração de e-mail'),
        requestPasswordReset: unavailable('Redefinição de senha'),
        disconnectSpotify: unavailable('Desconexão do Spotify'),
        deactivateAccount: unavailable('Desativação de conta'),
        deleteAccount: unavailable('Exclusão permanente de conta')
    };
}
