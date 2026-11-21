// Resolve the API base URL without a trailing slash.
export function resolveApiBaseUrl(baseUrl) {
    if (typeof baseUrl === 'string' && baseUrl.trim()) {
        return baseUrl.trim().replace(/\/$/, '');
    }
    if (typeof globalThis.API_BASE_URL === 'string' && globalThis.API_BASE_URL.trim()) {
        return globalThis.API_BASE_URL.trim().replace(/\/$/, '');
    }
    const host = typeof location !== 'undefined' ? location.hostname : '';
    const fallback = host === 'localhost' || host === '127.0.0.1'
        ? 'http://localhost:8080/api'
        : 'https://api.sonarfy.com/api';
    return fallback;
}

// Collect available web storages without throwing in restricted contexts.
export function getDefaultStorages() {
    const storages = [];
    try { if (typeof localStorage !== 'undefined') storages.push(localStorage); } catch {}
    try { if (typeof sessionStorage !== 'undefined') storages.push(sessionStorage); } catch {}
    return storages;
}

// Read the current access token from storage.
export function getAccessToken(storage) {
    try {
        const target = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
        return target ? target.getItem('sonarfy_token') : null;
    } catch {
        return null;
    }
}

// Persist the access token in storage without exposing refresh cookies.
export function setAccessToken(token, storage) {
    if (typeof token !== 'string' || !token.trim()) return;
    try {
        const target = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
        if (target) target.setItem('sonarfy_token', token);
    } catch {}
}

// Remove sonarfy_token from storages while preserving user preferences like sonarfy_theme.
export function clearAccessToken(storages = getDefaultStorages()) {
    for (const storage of storages) {
        if (!storage) continue;
        try {
            storage.removeItem('sonarfy_token');
        } catch {}
    }
}

// Build a normalized error with an optional HTTP status and original cause.
function createHttpError(message, status, cause) {
    const error = new Error(message);
    if (status !== undefined) error.status = status;
    if (cause !== undefined) error.cause = cause;
    return error;
}

// Create an authenticated HTTP session client with single-flight refresh and remote logout.
export function createAuthClient({
    baseUrl,
    fetcher = (...args) => fetch(...args),
    getToken = () => getAccessToken(),
    setToken = token => setAccessToken(token),
    clearToken = () => clearAccessToken(),
    expire = () => {
        clearToken();
        if (typeof location !== 'undefined' && typeof location.assign === 'function') {
            location.assign('login.html');
        }
    }
} = {}) {
    let inFlightRefresh = null;

    // Rotate the HttpOnly refresh cookie via POST /api/auth/refresh with single-flight deduplication.
    function refreshSession() {
        if (inFlightRefresh) return inFlightRefresh;
        const url = `${resolveApiBaseUrl(baseUrl)}/auth/refresh`;
        inFlightRefresh = (async () => {
            let response;
            try {
                response = await fetcher(url, {
                    method: 'POST',
                    credentials: 'include',
                    cache: 'no-store',
                    headers: { 'X-Sonarfy-CSRF': '1' }
                });
            } catch (cause) {
                throw createHttpError(
                    'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.',
                    undefined,
                    cause
                );
            }
            if (!response || typeof response.status !== 'number') {
                throw createHttpError('Não foi possível renovar a sessão. Tente novamente.');
            }
            if (response.status === 401) {
                clearToken();
                throw createHttpError('Sessão expirada. Entre novamente.', 401);
            }
            if (response.status === 403) {
                throw createHttpError('Requisição bloqueada pela verificação de segurança.', 403);
            }
            if (response.status !== 200) {
                throw createHttpError('Não foi possível renovar a sessão. Tente novamente.', response.status);
            }
            let payload;
            try {
                payload = await response.json();
            } catch (cause) {
                throw createHttpError('Resposta de autenticação inválida. Tente novamente.', undefined, cause);
            }
            const nextToken = typeof payload?.accessToken === 'string' ? payload.accessToken.trim() : '';
            if (!nextToken) {
                throw createHttpError('Resposta de autenticação inválida. Tente novamente.');
            }
            setToken(nextToken);
            return nextToken;
        })().finally(() => {
            inFlightRefresh = null;
        });
        return inFlightRefresh;
    }

    // Revoke the server-side refresh session via POST /api/auth/logout and always clear local token.
    async function logoutSession() {
        const url = `${resolveApiBaseUrl(baseUrl)}/auth/logout`;
        try {
            const response = await fetcher(url, {
                method: 'POST',
                credentials: 'include',
                cache: 'no-store',
                headers: { 'X-Sonarfy-CSRF': '1' }
            });
            return {
                ok: response?.status === 204,
                status: response?.status ?? 0
            };
        } finally {
            clearToken();
        }
    }

    // Send a Bearer-authenticated request with a single refresh-and-retry attempt on HTTP 401.
    async function authorizedFetch(path, init = {}, { requireToken = true, onTokenRefreshed } = {}) {
        const token = getToken();
        if (!token && requireToken) {
            expire();
            throw createHttpError('Entre novamente para continuar.', 401);
        }

        const url = path.startsWith('http://') || path.startsWith('https://')
            ? path
            : `${resolveApiBaseUrl(baseUrl)}${path}`;

        const send = async bearer => {
            const headers = { ...(init.headers || {}) };
            if (bearer) headers.Authorization = `Bearer ${bearer}`;
            try {
                return await fetcher(url, {
                    ...init,
                    headers,
                    credentials: init.credentials ?? 'omit',
                    cache: init.cache ?? 'no-store'
                });
            } catch (cause) {
                throw createHttpError(
                    'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.',
                    undefined,
                    cause
                );
            }
        };

        const response = await send(token);
        if (response.status !== 401) {
            return { response, token, refreshed: false };
        }

        let nextToken;
        try {
            nextToken = await refreshSession();
        } catch {
            expire();
            return { response, token, refreshed: false };
        }

        if (typeof onTokenRefreshed === 'function') {
            onTokenRefreshed(nextToken);
        }

        const retryResponse = await send(nextToken);
        if (retryResponse.status === 401) {
            expire();
        }
        return { response: retryResponse, token: nextToken, refreshed: true };
    }

    return {
        refreshSession,
        logoutSession,
        authorizedFetch,
        getToken,
        setToken,
        clearToken
    };
}

const defaultAuthClient = createAuthClient();

// Refresh the default browser session using POST /api/auth/refresh.
export function refreshSession(options) {
    return options ? createAuthClient(options).refreshSession() : defaultAuthClient.refreshSession();
}

// Revoke the default browser session using POST /api/auth/logout.
export function logoutSession(options) {
    return options ? createAuthClient(options).logoutSession() : defaultAuthClient.logoutSession();
}

// Perform a Bearer-authenticated request using the default session client.
export function authorizedFetch(path, init, options) {
    return options?.fetcher || options?.baseUrl || options?.getToken || options?.setToken || options?.clearToken || options?.expire
        ? createAuthClient(options).authorizedFetch(path, init, options)
        : defaultAuthClient.authorizedFetch(path, init, options);
}
