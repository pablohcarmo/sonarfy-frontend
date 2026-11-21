import { createAuthClient, getAccessToken, setAccessToken, clearAccessToken, resolveApiBaseUrl } from './auth-http.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Validate new password rules shared with the backend (8+ chars, <= 72 UTF-8 bytes, matching confirmation).
export function validateNewPassword(newPassword, confirmNewPassword) {
    const pwd = typeof newPassword === 'string' ? newPassword : '';
    const confirm = typeof confirmNewPassword === 'string' ? confirmNewPassword : '';
    if (!pwd || pwd.length < 8) {
        throw new Error('A nova senha deve ter pelo menos 8 caracteres.');
    }
    const byteLength = typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(pwd).length : pwd.length;
    if (byteLength > 72) {
        throw new Error('A nova senha não pode ultrapassar 72 bytes.');
    }
    if (pwd !== confirm) {
        throw new Error('A confirmação da nova senha não confere.');
    }
}

// Extract and remove a one-time token from query string (?token=...) or hash (#token=...) in memory.
export function extractUrlToken(paramName, loc = typeof location !== 'undefined' ? location : null, hist = typeof history !== 'undefined' ? history : null) {
    if (!loc) return null;
    let token = null;
    let hashCleaned = loc.hash || '';
    let searchCleaned = loc.search || '';

    if (typeof loc.hash === 'string' && loc.hash.length > 1) {
        const hashParams = new URLSearchParams(loc.hash.slice(1));
        const fromHash = hashParams.get(paramName);
        if (fromHash && fromHash.trim()) {
            token = fromHash.trim();
            hashParams.delete(paramName);
            const nextHash = hashParams.toString();
            hashCleaned = nextHash ? `#${nextHash}` : '';
        }
    }

    if (!token && typeof loc.search === 'string' && loc.search.length > 1) {
        const searchParams = new URLSearchParams(loc.search);
        const fromSearch = searchParams.get(paramName);
        if (fromSearch && fromSearch.trim()) {
            token = fromSearch.trim();
            searchParams.delete(paramName);
            const nextSearch = searchParams.toString();
            searchCleaned = nextSearch ? `?${nextSearch}` : '';
        }
    }

    if (token && hist && typeof hist.replaceState === 'function') {
        try {
            hist.replaceState(null, '', `${loc.pathname || ''}${searchCleaned}${hashCleaned}`);
        } catch {}
    }

    return token;
}

// Create the HTTP client for public password recovery and authenticated password change flows.
export function createPasswordClient({
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
        // Request public password reset instructions via POST /api/auth/forgot-password without account enumeration.
        async requestForgotPassword(rawEmail) {
            const email = String(rawEmail || '').trim();
            if (!email || !EMAIL_PATTERN.test(email)) {
                const error = new Error('Informe um endereço de e-mail válido.');
                error.status = 400;
                throw error;
            }
            let response;
            try {
                response = await fetcher(`${resolveApiBaseUrl(baseUrl)}/auth/forgot-password`, {
                    method: 'POST',
                    credentials: 'omit',
                    cache: 'no-store',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });
            } catch (cause) {
                const error = new Error('Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.');
                error.cause = cause;
                throw error;
            }
            if (response.status === 200) {
                return {
                    ok: true,
                    message: 'Se existir uma conta elegível para este e-mail, enviaremos as instruções de recuperação. Verifique sua caixa de entrada.'
                };
            }
            if (response.status === 400) {
                const error = new Error('Informe um endereço de e-mail válido.');
                error.status = 400;
                throw error;
            }
            const error = new Error('Não foi possível processar a solicitação no momento. Tente novamente.');
            error.status = response.status;
            throw error;
        },

        // Complete public password reset via POST /api/auth/reset-password.
        async resetPassword({ token, newPassword, confirmNewPassword }) {
            const cleanToken = String(token || '').trim();
            if (!cleanToken) {
                const error = new Error('Link de recuperação inválido ou ausente. Solicite um novo link.');
                error.status = 400;
                throw error;
            }
            validateNewPassword(newPassword, confirmNewPassword);
            let response;
            try {
                response = await fetcher(`${resolveApiBaseUrl(baseUrl)}/auth/reset-password`, {
                    method: 'POST',
                    credentials: 'omit',
                    cache: 'no-store',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: cleanToken, newPassword, confirmNewPassword })
                });
            } catch (cause) {
                const error = new Error('Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.');
                error.cause = cause;
                throw error;
            }
            if (response.status === 200) {
                clearAccessToken();
                return { ok: true, message: 'Senha redefinida com sucesso!' };
            }
            const message = response.status === 404
                ? 'Conta não encontrada para este link de recuperação.'
                : response.status === 400
                    ? 'Link inválido/expirado ou nova senha inválida (use pelo menos 8 caracteres e diferente da senha atual).'
                    : 'Não foi possível redefinir a senha no momento. Tente novamente.';
            const error = new Error(message);
            error.status = response.status;
            throw error;
        },

        // Request authenticated password change email via POST /api/users/me/password-change-request (no body).
        async requestPasswordChange() {
            const { response } = await client.authorizedFetch('/users/me/password-change-request', {
                method: 'POST',
                credentials: 'omit',
                cache: 'no-store'
            });
            if (response.status === 200) {
                return {
                    message: 'Solicitação registrada. Verifique sua caixa de entrada para continuar a alteração de senha.',
                    cooldownSeconds: 30
                };
            }
            const message = response.status === 401
                ? 'Sessão expirada. Entre novamente.'
                : response.status === 429
                    ? 'Aguarde alguns instantes antes de solicitar um novo e-mail de troca de senha.'
                    : 'Não foi possível solicitar a troca de senha agora. Tente novamente mais tarde.';
            const error = new Error(message);
            error.status = response.status;
            throw error;
        },

        // Complete authenticated password change via PUT /api/users/me/password and clear local credentials on 200.
        async changePassword({ token, currentPassword, newPassword, confirmNewPassword }) {
            const cleanToken = String(token || '').trim();
            if (!cleanToken) {
                const error = new Error('Autorização de troca de senha ausente ou expirada. Solicite um novo link.');
                error.status = 400;
                throw error;
            }
            if (!currentPassword) {
                const error = new Error('Informe sua senha atual.');
                error.status = 400;
                throw error;
            }
            validateNewPassword(newPassword, confirmNewPassword);
            const { response } = await client.authorizedFetch('/users/me/password', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'omit',
                cache: 'no-store',
                body: JSON.stringify({
                    token: cleanToken,
                    currentPassword,
                    newPassword,
                    confirmNewPassword
                })
            });
            if (response.status === 200) {
                clearAccessToken();
                return { ok: true, message: 'Senha atualizada com sucesso. Faça login novamente.' };
            }
            const message = response.status === 401
                ? 'Sessão expirada. Entre novamente.'
                : response.status === 403
                    ? 'Este link de alteração de senha pertence a outra conta.'
                    : response.status === 404
                        ? 'Conta não encontrada.'
                        : response.status === 400
                            ? 'Verifique a senha atual, a nova senha (mínimo 8 caracteres e diferente da atual) ou solicite um novo link.'
                            : 'Não foi possível atualizar a senha no momento. Tente novamente.';
            const error = new Error(message);
            error.status = response.status;
            throw error;
        }
    };
}
