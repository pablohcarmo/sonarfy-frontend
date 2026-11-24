import { createAuthClient, getAccessToken, setAccessToken, clearAccessToken, resolveApiBaseUrl } from './auth-http.js';

const MAX_PASSWORD_BYTES = 72;
const MAX_TOKEN_LENGTH = 256;

// Calculate UTF-8 byte length to match backend bcrypt password limit without truncation.
function utf8ByteLength(value) {
    if (typeof TextEncoder !== 'undefined') {
        return new TextEncoder().encode(value).length;
    }
    return value.length;
}

// Validate current password before submitting POST /api/users/me/account-deactivation-request.
export function validateDeactivationPassword(currentPassword) {
    if (typeof currentPassword !== 'string' || !currentPassword.trim()) {
        const error = new Error('Informe sua senha atual para continuar.');
        error.status = 400;
        throw error;
    }
    if (utf8ByteLength(currentPassword) > MAX_PASSWORD_BYTES) {
        const error = new Error('A senha atual não pode ultrapassar 72 bytes em UTF-8.');
        error.status = 400;
        throw error;
    }
    return { currentPassword };
}

// Create the HTTP client for authenticated account deactivation requests and public confirmation.
export function createAccountDeactivationClient({
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
        // Request account deactivation via POST /api/users/me/account-deactivation-request (202 Accepted).
        async requestAccountDeactivation(input) {
            const { currentPassword } = validateDeactivationPassword(input?.currentPassword);
            const token = getToken();
            if (!token) {
                expire();
                const error = new Error('Sessão expirada. Entre novamente.');
                error.status = 401;
                throw error;
            }
            const url = `${resolveApiBaseUrl(baseUrl)}/users/me/account-deactivation-request`;
            const send = async bearer => {
                try {
                    return await fetcher(url, {
                        method: 'POST',
                        credentials: 'omit',
                        cache: 'no-store',
                        headers: {
                            Authorization: `Bearer ${bearer}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ currentPassword })
                    });
                } catch (cause) {
                    const error = new Error('Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.');
                    error.cause = cause;
                    throw error;
                }
            };

            let response = await send(token);
            let passwordRejectedAfterRefresh = false;
            if (response.status === 401) {
                // Retry once after session refresh to distinguish an expired JWT from an invalid current password.
                try {
                    const refreshed = await client.refreshSession();
                    response = await send(refreshed);
                    if (response.status === 401) {
                        passwordRejectedAfterRefresh = true;
                    }
                } catch (refreshError) {
                    if (refreshError?.status === 401) {
                        expire();
                        const error = new Error('Sessão expirada. Entre novamente.');
                        error.status = 401;
                        throw error;
                    }
                    passwordRejectedAfterRefresh = true;
                }
            }

            if (response.status === 202) {
                let payload = {};
                try { payload = await response.json(); } catch {}
                return {
                    accepted: true,
                    expiresInSeconds: Number.isFinite(payload?.expiresInSeconds) ? payload.expiresInSeconds : 900,
                    cooldownSeconds: 30,
                    message: 'Solicitação enviada! Verifique seu e-mail para confirmar a desativação da conta.'
                };
            }

            const message = response.status === 401
                ? (passwordRejectedAfterRefresh
                    ? 'Senha atual incorreta. Verifique e tente novamente.'
                    : 'Sessão expirada. Entre novamente.')
                : response.status === 429
                    ? 'Aguarde alguns instantes antes de solicitar uma nova desativação de conta.'
                    : response.status === 404
                        ? 'A desativação de conta não está habilitada neste ambiente no momento.'
                        : response.status === 403
                            ? 'Solicitação recusada pela verificação de segurança. Verifique o endereço de acesso e tente novamente.'
                            : response.status === 400
                                ? 'Informe sua senha atual para continuar.'
                                : 'Não foi possível solicitar a desativação da conta. Tente novamente.';
            const error = new Error(message);
            error.status = response.status;
            throw error;
        },

        // Confirm account deactivation via public POST /api/auth/account-deactivation-confirmation (204, no Bearer).
        async confirmAccountDeactivation(rawToken) {
            const token = typeof rawToken === 'string' ? rawToken.trim() : '';
            if (!token || token.length > MAX_TOKEN_LENGTH) {
                const error = new Error('Link de confirmação inválido ou ausente. Solicite uma nova desativação nas configurações da conta.');
                error.status = 400;
                throw error;
            }
            let response;
            try {
                response = await fetcher(`${resolveApiBaseUrl(baseUrl)}/auth/account-deactivation-confirmation`, {
                    method: 'POST',
                    credentials: 'omit',
                    cache: 'no-store',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token })
                });
            } catch (cause) {
                const error = new Error('Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.');
                error.cause = cause;
                throw error;
            }

            if (response.status === 204) {
                clearAccessToken();
                return {
                    confirmed: true,
                    message: 'Sua conta foi desativada com sucesso e todas as sessões foram encerradas.'
                };
            }

            const message = response.status === 404
                ? 'A confirmação de desativação de conta não está habilitada neste ambiente.'
                : response.status === 403
                    ? 'Solicitação recusada pela verificação de segurança. Verifique o endereço de acesso e tente novamente.'
                    : response.status === 400
                        ? 'Link de confirmação inválido, expirado ou já utilizado. Solicite uma nova desativação nas configurações da conta.'
                        : 'Não foi possível confirmar a desativação da conta no momento. Tente novamente.';
            const error = new Error(message);
            error.status = response.status;
            throw error;
        }
    };
}
