import { createAuthClient, getAccessToken, setAccessToken, clearAccessToken, resolveApiBaseUrl } from './auth-http.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Validate new email and current password before submitting POST /api/users/me/email-change-request.
export function validateEmailChangeInput({ newEmail, currentPassword }) {
    const email = typeof newEmail === 'string' ? newEmail : '';
    if (!email || email !== email.trim() || email.length > 150 || !EMAIL_PATTERN.test(email)) {
        const error = new Error('Informe um endereço de e-mail válido (até 150 caracteres, sem espaços).');
        error.status = 400;
        throw error;
    }
    if (typeof currentPassword !== 'string' || !currentPassword) {
        const error = new Error('Informe sua senha atual para continuar.');
        error.status = 400;
        throw error;
    }
    return { newEmail: email, currentPassword };
}

// Create the HTTP client for authenticated email change requests and public token confirmation.
export function createEmailChangeClient({
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
        // Request an email change via POST /api/users/me/email-change-request (202 Accepted).
        async requestEmailChange(input) {
            const { newEmail, currentPassword } = validateEmailChangeInput(input || {});
            const token = getToken();
            if (!token) {
                expire();
                const error = new Error('Sessão expirada. Entre novamente.');
                error.status = 401;
                throw error;
            }
            const url = `${resolveApiBaseUrl(baseUrl)}/users/me/email-change-request`;
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
                        body: JSON.stringify({ newEmail, currentPassword })
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
                    message: 'Solicitação enviada! Verifique a caixa de entrada do novo endereço de e-mail para confirmar a alteração.'
                };
            }

            const message = response.status === 401
                ? (passwordRejectedAfterRefresh
                    ? 'Senha atual incorreta. Verifique e tente novamente.'
                    : 'Sessão expirada. Entre novamente.')
                : response.status === 409
                    ? 'Este endereço de e-mail já está em uso por outra conta.'
                    : response.status === 429
                        ? 'Aguarde alguns instantes antes de solicitar uma nova alteração de e-mail.'
                        : response.status === 404
                            ? 'A troca de e-mail não está habilitada neste ambiente no momento.'
                            : response.status === 400
                                ? 'Verifique o novo e-mail informado (deve ser válido, diferente do atual e ter até 150 caracteres).'
                                : 'Não foi possível solicitar a alteração de e-mail. Tente novamente.';
            const error = new Error(message);
            error.status = response.status;
            throw error;
        },

        // Confirm an email change via public POST /api/auth/email-change-confirmation (no Bearer).
        async confirmEmailChange(rawToken) {
            const token = typeof rawToken === 'string' ? rawToken.trim() : '';
            if (!token || token.length > 4096) {
                const error = new Error('Link de confirmação inválido ou ausente. Solicite uma nova troca nas configurações.');
                error.status = 400;
                throw error;
            }
            let response;
            try {
                response = await fetcher(`${resolveApiBaseUrl(baseUrl)}/auth/email-change-confirmation`, {
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

            if (response.status === 200) {
                clearAccessToken();
                let payload = {};
                try { payload = await response.json(); } catch {}
                return {
                    confirmed: true,
                    requiresLogin: payload?.requiresLogin !== false,
                    message: 'Seu e-mail foi alterado com sucesso! Faça login novamente com o novo endereço.'
                };
            }

            const message = response.status === 409
                ? 'O novo endereço de e-mail já está em uso por outra conta. Escolha outro e-mail nas configurações.'
                : response.status === 404
                    ? 'A confirmação de troca de e-mail não está habilitada neste ambiente.'
                    : response.status === 400
                        ? 'Link de confirmação inválido, expirado ou já utilizado. Solicite uma nova troca nas configurações.'
                        : 'Não foi possível confirmar a troca de e-mail no momento. Tente novamente.';
            const error = new Error(message);
            error.status = response.status;
            throw error;
        }
    };
}
