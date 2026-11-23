import { createFixtures } from './profile-fixtures.js';
import { clearAccessToken, createAuthClient, getAccessToken, logoutSession, setAccessToken } from './auth-http.js';

const DEFAULT_AVATAR = '../assets/icons/profile/avatar.svg';
const INTERNAL_BASE = 'https://sonarfy.local/pages/';

// Format a user handle with a single leading @.
export function formatHandle(handle) {
    const clean = String(handle || '').trim().replace(/^@+/, '');
    return `@${clean || 'usuario'}`;
}

// Validate a relative internal route under /pages/ and block open redirects.
export function resolveSafeReturnUrl(fromParam, fallback = 'feed.html') {
    const safeFallback = isSafeInternalPath(fallback) ? normalizeRelativePath(fallback) : 'feed.html';
    if (typeof fromParam !== 'string') return safeFallback;
    const candidate = fromParam.trim();
    if (!isSafeInternalPath(candidate)) return safeFallback;
    return normalizeRelativePath(candidate);
}

function isSafeInternalPath(candidate) {
    if (!candidate || candidate.startsWith('//') || candidate.includes('\\') || /[\u0000-\u001F\u007F]/.test(candidate)) {
        return false;
    }
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(candidate)) return false;
    try {
        const resolved = new URL(candidate, INTERNAL_BASE);
        if (resolved.origin !== 'https://sonarfy.local') return false;
        if (!resolved.pathname.startsWith('/pages/')) return false;
        if (resolved.pathname === '/pages/logout.html') return false;
        return true;
    } catch {
        return false;
    }
}

function normalizeRelativePath(candidate) {
    const resolved = new URL(candidate, INTERNAL_BASE);
    return `${resolved.pathname.slice('/pages/'.length)}${resolved.search}${resolved.hash}`;
}

// Remove sonarfy_token from web storages while preserving sonarfy_theme.
export function clearSessionToken(storages = getDefaultStorages()) {
    clearAccessToken(storages);
}

function getDefaultStorages() {
    const list = [];
    try { if (typeof localStorage !== 'undefined') list.push(localStorage); } catch {}
    try { if (typeof sessionStorage !== 'undefined') list.push(sessionStorage); } catch {}
    return list;
}

function readStoredToken(storages) {
    for (const storage of storages) {
        const token = getAccessToken(storage);
        if (typeof token === 'string' && token.trim()) return token.trim();
    }
    return null;
}

function isDemoSearch(search = '') {
    return new URLSearchParams(search).get('demo') === 'true';
}

// Resolve the active user summary from the host adapter, GET /api/profile/me, or demo fixtures.
export async function resolveLogoutUser(adapter = globalThis.sonarfyLogoutAdapter, options = {}) {
    const fallbackProfile = createFixtures().profile;
    const storages = options.storages || getDefaultStorages();
    const search = options.location?.search ?? (typeof location !== 'undefined' ? location.search : '');
    let source = null;
    try {
        if (typeof adapter?.getUser === 'function') {
            source = await adapter.getUser();
        } else if (adapter?.user && typeof adapter.user === 'object') {
            source = adapter.user;
        } else if (!isDemoSearch(search) && readStoredToken(storages)) {
            const client = createAuthClient({
                baseUrl: options.baseUrl,
                fetcher: options.fetcher,
                getToken: () => readStoredToken(storages),
                setToken: token => setAccessToken(token, storages[0]),
                clearToken: () => clearSessionToken(storages),
                expire: () => {}
            });
            const { response } = await client.authorizedFetch('/profile/me', {
                method: 'GET',
                credentials: 'omit',
                cache: 'no-store'
            });
            if (response?.status === 200) {
                const dto = await response.json();
                if (dto?.identity && typeof dto.identity === 'object') {
                    source = {
                        displayName: dto.identity.displayName,
                        handle: dto.identity.handle,
                        avatar: dto.identity.avatarUrl
                    };
                }
            }
        }
    } catch {
        source = null;
    }
    const displayName = String(source?.displayName || fallbackProfile.displayName || 'Usuário Sonarfy').trim();
    const handle = formatHandle(source?.handle || fallbackProfile.handle);
    const avatar = String(source?.avatar || fallbackProfile.avatar || DEFAULT_AVATAR).trim() || DEFAULT_AVATAR;
    return { displayName, handle, avatar };
}

// Initialize the logout confirmation page, summary, and safe navigation actions.
export async function initLogoutPage(options = {}) {
    const doc = options.document || (typeof document !== 'undefined' ? document : null);
    if (!doc) return null;

    const loc = options.location || (typeof location !== 'undefined' ? location : { search: '' });
    const adapter = options.adapter !== undefined ? options.adapter : globalThis.sonarfyLogoutAdapter;
    const navigate = options.navigate || (url => { window.location.assign(url); });
    const storages = options.storages || getDefaultStorages();

    const params = new URLSearchParams(loc.search || '');
    const fallbackRoute = adapter?.routes?.fallback || 'feed.html';
    const loginRoute = resolveSafeReturnUrl(adapter?.routes?.login || 'login.html', 'login.html');
    const returnUrl = resolveSafeReturnUrl(params.get('from'), fallbackRoute);

    doc.querySelectorAll('[data-logout-back]').forEach(link => {
        link.setAttribute('href', returnUrl);
        link.addEventListener('click', event => {
            event.preventDefault();
            navigate(returnUrl);
        });
    });

    const user = await resolveLogoutUser(adapter, {
        baseUrl: options.baseUrl,
        fetcher: options.fetcher,
        location: loc,
        storages
    });
    const avatarEl = doc.getElementById('logoutUserAvatar');
    const nameEl = doc.getElementById('logoutUserName');
    const handleEl = doc.getElementById('logoutUserHandle');

    if (nameEl) nameEl.textContent = user.displayName;
    if (handleEl) handleEl.textContent = user.handle;
    if (avatarEl) {
        avatarEl.src = user.avatar;
        avatarEl.addEventListener('error', () => {
            if (!avatarEl.src.endsWith('avatar.svg')) avatarEl.src = DEFAULT_AVATAR;
        }, { once: true });
    }

    const confirmBtn = doc.getElementById('btnConfirmLogout');
    let isLoggingOut = false;

    const handleConfirm = async () => {
        if (isLoggingOut) return;
        isLoggingOut = true;
        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.setAttribute('aria-busy', 'true');
            confirmBtn.textContent = 'Saindo...';
        }
        const remoteLogout = typeof adapter?.logout === 'function'
            ? adapter.logout
            : typeof adapter?.actions?.logout === 'function'
                ? adapter.actions.logout
                : isDemoSearch(loc.search || '')
                    ? null
                    : () => logoutSession({
                        baseUrl: options.baseUrl,
                        fetcher: options.fetcher,
                        clearToken: () => clearSessionToken(storages)
                    });
        try {
            if (remoteLogout) await remoteLogout();
        } catch {
            // Local session cleanup and redirect still proceed if remote revocation fails.
        } finally {
            clearSessionToken(storages);
            navigate(loginRoute);
        }
    };

    if (confirmBtn) {
        confirmBtn.addEventListener('click', handleConfirm);
    }

    return { returnUrl, loginRoute, user, handleConfirm };
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { initLogoutPage(); });
    } else {
        initLogoutPage();
    }
}
