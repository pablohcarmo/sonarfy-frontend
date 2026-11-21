import { SPOTIFY_SYNCED_KEY } from './spotify-sync-state.js';
import { clearAccessToken, logoutSession } from './auth-http.js';

export const HANDLE_PATTERN = /^[a-z0-9._]{3,30}$/;

// Strip leading @ symbols, trim whitespace, and lowercase a handle.
export function normalizeHandle(raw) {
    return String(raw || '').trim().replace(/^@+/, '').toLowerCase();
}

// Validate handle syntax rules before checking remote or local availability.
export function validateHandle(raw) {
    const handle = normalizeHandle(raw);
    if (!handle) return { valid: false, handle, message: 'Informe um nome de usuário.' };
    if (handle.length < 3 || handle.length > 30) return { valid: false, handle, message: 'O usuário deve ter entre 3 e 30 caracteres.' };
    if (!HANDLE_PATTERN.test(handle)) return { valid: false, handle, message: 'Use apenas letras minúsculas, números, ponto ou sublinhado.' };
    if (handle.startsWith('.') || handle.endsWith('.') || handle.includes('..')) {
        return { valid: false, handle, message: 'O usuário não pode começar, terminar ou repetir pontos consecutivos.' };
    }
    return { valid: true, handle, message: '' };
}

// Validate personal information fields before submitting an update.
export function validatePersonalInfo(draft) {
    const firstName = String(draft.firstName || '').trim();
    const lastName = String(draft.lastName || '').trim();
    const city = String(draft.city || '').trim();
    const country = String(draft.country || '').trim();
    const birthDate = String(draft.birthDate || '').trim();
    if (!firstName) throw new Error('Informe seu nome.');
    if (!lastName) throw new Error('Informe seu sobrenome.');
    const handleCheck = validateHandle(draft.handle);
    if (!handleCheck.valid) throw new Error(handleCheck.message);
    if (birthDate) {
        const parsed = new Date(`${birthDate}T00:00:00`);
        if (Number.isNaN(parsed.getTime()) || parsed > new Date()) {
            throw new Error('Informe uma data de nascimento válida.');
        }
    }
    if (!city) throw new Error('Informe sua cidade.');
    return { firstName, lastName, handle: handleCheck.handle, birthDate, city, country, cityId: draft.cityId || null };
}

// Remove session credentials while preserving the user's theme preference.
export function clearSessionCredentials(storage = localStorage, removeSpotify = false) {
    try {
        storage.removeItem('sonarfy_token');
        if (removeSpotify) storage.removeItem(SPOTIFY_SYNCED_KEY);
    } catch {}
}

// Execute account logout via host hook or POST /api/auth/logout and always clear local credentials.
export async function logoutAccount(adapter = {}, navigate = url => { location.href = url; }, options) {
    const destination = adapter?.routes?.login || 'login.html';
    try {
        if (adapter?.actions?.logout) {
            await adapter.actions.logout();
        } else {
            await logoutSession(options);
        }
    } catch {
        // Local cleanup and redirect proceed even when remote revocation fails.
    } finally {
        clearSessionCredentials();
        clearAccessToken();
        navigate(destination);
    }
}

// Manage account state, edit mode, handle availability checks, and mutations.
export function createAccountState(adapter) {
    const state = {
        account: null,
        editing: false,
        loading: false,
        saving: false,
        pendingAction: null,
        handleStatus: 'idle',
        handleMessage: '',
        error: ''
    };
    const listeners = new Set();
    let handleSeq = 0;
    const emit = () => listeners.forEach(fn => fn(state));

    return {
        state,
        subscribe(fn) {
            listeners.add(fn);
            return () => listeners.delete(fn);
        },
        async load() {
            state.loading = true;
            state.error = '';
            emit();
            try {
                const response = await adapter.load();
                state.account = { ...response.account };
                state.editing = false;
                state.handleStatus = 'idle';
                state.handleMessage = '';
                return state.account;
            } catch (error) {
                state.error = error.message || 'Não foi possível carregar as configurações.';
                throw error;
            } finally {
                state.loading = false;
                emit();
            }
        },
        setEditing(active) {
            if (!state.account || state.saving) return;
            state.editing = Boolean(active);
            state.handleStatus = 'idle';
            state.handleMessage = '';
            emit();
        },
        async checkHandle(raw) {
            const result = validateHandle(raw);
            if (!result.valid) {
                state.handleStatus = 'invalid';
                state.handleMessage = result.message;
                emit();
                return { available: false, message: result.message };
            }
            if (state.account && result.handle === normalizeHandle(state.account.handle)) {
                state.handleStatus = 'unchanged';
                state.handleMessage = '';
                emit();
                return { available: true, message: '' };
            }
            const seq = ++handleSeq;
            state.handleStatus = 'checking';
            state.handleMessage = 'Verificando disponibilidade…';
            emit();
            try {
                const check = await adapter.checkHandle(result.handle);
                if (seq !== handleSeq) return null;
                state.handleStatus = check?.available ? 'available' : 'taken';
                state.handleMessage = check?.available ? `@${result.handle} está disponível.` : 'Este nome de usuário já está em uso.';
                emit();
                return { available: Boolean(check?.available), message: state.handleMessage };
            } catch (error) {
                if (seq !== handleSeq) return null;
                state.handleStatus = 'error';
                state.handleMessage = error.message || 'Não foi possível verificar a disponibilidade do usuário.';
                emit();
                return { available: false, message: state.handleMessage };
            }
        },
        async savePersonalInfo(draft) {
            if (state.saving) return null;
            const validated = validatePersonalInfo(draft);
            if (state.handleStatus === 'taken') {
                throw new Error('Este nome de usuário já está em uso.');
            }
            state.saving = true;
            emit();
            try {
                if (state.account && validated.handle !== normalizeHandle(state.account.handle) && typeof adapter.checkHandle === 'function') {
                    const check = await adapter.checkHandle(validated.handle);
                    if (!check?.available) {
                        state.handleStatus = 'taken';
                        state.handleMessage = 'Este nome de usuário já está em uso.';
                        throw new Error('Este nome de usuário já está em uso.');
                    }
                }
                const response = await adapter.updateAccount(validated);
                state.account = { ...state.account, ...(response?.account || validated) };
                state.editing = false;
                state.handleStatus = 'idle';
                state.handleMessage = '';
                return response;
            } finally {
                state.saving = false;
                emit();
            }
        },
        async disconnectSpotify() {
            if (state.pendingAction) return null;
            state.pendingAction = 'spotify';
            emit();
            try {
                const result = await adapter.disconnectSpotify();
                if (state.account) state.account.spotifyConnected = Boolean(result?.spotifyConnected);
                return result;
            } finally {
                state.pendingAction = null;
                emit();
            }
        },
        async deactivateAccount(navigate = url => { location.href = url; }) {
            if (state.pendingAction) return null;
            state.pendingAction = 'deactivate';
            emit();
            try {
                const result = await adapter.deactivateAccount();
                clearSessionCredentials();
                navigate(adapter.routes?.login || 'login.html');
                return result;
            } finally {
                state.pendingAction = null;
                emit();
            }
        },
        async deleteAccount(navigate = url => { location.href = url; }) {
            if (state.pendingAction) return null;
            state.pendingAction = 'delete';
            emit();
            try {
                const result = await adapter.deleteAccount();
                clearSessionCredentials(localStorage, true);
                navigate(adapter.routes?.login || 'login.html');
                return result;
            } finally {
                state.pendingAction = null;
                emit();
            }
        }
    };
}
