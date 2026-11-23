import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initLogoutPage, resolveSafeReturnUrl } from '../js/logout.js';
import { sidebar } from '../js/profile-shell.js';

const html = readFileSync('pages/logout.html', 'utf8');

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

function mountLogoutDom() {
    document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)[1];
}

describe('Logout Page (js/logout.js)', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
        delete window.sonarfyLogoutAdapter;
        mountLogoutDom();
    });

    // Render connected user summary from local demo fixtures when no adapter is attached.
    it('renders demo user summary when no host adapter is provided', async () => {
        await initLogoutPage({ document, location: { search: '' }, adapter: null, navigate: vi.fn() });

        expect(document.getElementById('logout-title').textContent).toBe('Sair da sua conta?');
        expect(document.getElementById('logout-description').textContent).toContain('Você será desconectado do Sonarfy neste navegador.');
        expect(document.querySelector('.desktop-home')).toBeNull();
        expect(document.querySelector('.mobile-home')).toBeNull();
        expect(document.querySelector('.brand').getAttribute('href')).toBe('feed.html');
        expect(document.getElementById('logoutUserName').textContent).toBe('Display Name');
        expect(document.getElementById('logoutUserHandle').textContent).toBe('@username_123456');
        expect(document.getElementById('logoutUserAvatar').getAttribute('src')).toBe('../assets/icons/profile/avatar.svg');
    });

    // Render connected user summary from host-provided sonarfyLogoutAdapter.
    it('renders active user summary from host adapter and normalizes handle', async () => {
        const adapter = {
            getUser: vi.fn(async () => ({
                displayName: 'Marina Costa',
                handle: '@marina_som',
                avatar: '../assets/images/sonarfy-symbol.png'
            }))
        };

        await initLogoutPage({ document, location: { search: '' }, adapter, navigate: vi.fn() });

        expect(adapter.getUser).toHaveBeenCalledTimes(1);
        expect(document.getElementById('logoutUserName').textContent).toBe('Marina Costa');
        expect(document.getElementById('logoutUserHandle').textContent).toBe('@marina_som');
        expect(document.getElementById('logoutUserAvatar').getAttribute('src')).toBe('../assets/images/sonarfy-symbol.png');
    });

    // Fetch profile summary via GET /api/profile/me and revoke session via POST /api/auth/logout.
    it('loads GET /api/profile/me, calls POST /api/auth/logout, removes sonarfy_token and preserves sonarfy_theme', async () => {
        localStorage.setItem('sonarfy_token', 'token-local');
        sessionStorage.setItem('sonarfy_token', 'token-session');
        localStorage.setItem('sonarfy_theme', 'dark');
        const navigate = vi.fn();
        const fetcher = vi.fn(async (url) => {
            if (url === 'https://api.example.invalid/api/profile/me') {
                return new Response(JSON.stringify({
                    identity: {
                        id: 1,
                        handle: 'marina_som',
                        displayName: 'Marina Costa',
                        avatarUrl: null
                    }
                }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }
            return new Response(null, { status: 204 });
        });

        await initLogoutPage({
            document,
            location: { search: '' },
            adapter: null,
            navigate,
            baseUrl: 'https://api.example.invalid/api',
            fetcher
        });
        expect(document.getElementById('logoutUserName').textContent).toBe('Marina Costa');
        expect(document.getElementById('logoutUserHandle').textContent).toBe('@marina_som');

        document.getElementById('btnConfirmLogout').click();
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(fetcher).toHaveBeenCalledTimes(2);
        expect(fetcher).toHaveBeenNthCalledWith(1, 'https://api.example.invalid/api/profile/me', expect.objectContaining({
            method: 'GET',
            credentials: 'omit',
            cache: 'no-store',
            headers: { Authorization: 'Bearer token-local' }
        }));
        expect(fetcher).toHaveBeenNthCalledWith(2, 'https://api.example.invalid/api/auth/logout', {
            method: 'POST',
            credentials: 'include',
            cache: 'no-store',
            headers: { 'X-Sonarfy-CSRF': '1' }
        });
        expect(localStorage.getItem('sonarfy_token')).toBeNull();
        expect(sessionStorage.getItem('sonarfy_token')).toBeNull();
        expect(localStorage.getItem('sonarfy_theme')).toBe('dark');
        expect(navigate).toHaveBeenCalledWith('login.html');
    });

    // Allow logout confirmation even when GET /api/profile/me fails with 401/network error.
    it('still allows POST /api/auth/logout when GET /api/profile/me fails', async () => {
        localStorage.setItem('sonarfy_token', 'expired-token');
        const navigate = vi.fn();
        const fetcher = vi.fn(async (url) => {
            if (url === 'https://api.example.invalid/api/profile/me') {
                throw new Error('Network error');
            }
            return new Response(null, { status: 204 });
        });

        await initLogoutPage({
            document,
            location: { search: '' },
            adapter: null,
            navigate,
            baseUrl: 'https://api.example.invalid/api',
            fetcher
        });
        expect(document.getElementById('logoutUserName').textContent).toBe('Display Name');

        document.getElementById('btnConfirmLogout').click();
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(fetcher).toHaveBeenNthCalledWith(2, 'https://api.example.invalid/api/auth/logout', {
            method: 'POST',
            credentials: 'include',
            cache: 'no-store',
            headers: { 'X-Sonarfy-CSRF': '1' }
        });
        expect(localStorage.getItem('sonarfy_token')).toBeNull();
        expect(navigate).toHaveBeenCalledWith('login.html');
    });

    // Skip remote HTTP calls when ?demo=true is explicitly active.
    it('uses demo fixtures without HTTP calls when ?demo=true is set', async () => {
        localStorage.setItem('sonarfy_token', 'demo-token');
        const navigate = vi.fn();
        const fetcher = vi.fn();

        await initLogoutPage({
            document,
            location: { search: '?demo=true' },
            adapter: null,
            navigate,
            baseUrl: 'https://api.example.invalid/api',
            fetcher
        });
        document.getElementById('btnConfirmLogout').click();
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(fetcher).not.toHaveBeenCalled();
        expect(localStorage.getItem('sonarfy_token')).toBeNull();
        expect(navigate).toHaveBeenCalledWith('login.html');
    });

    // Lock confirm button against concurrent clicks while awaiting remote revocation.
    it('locks confirm button against concurrent clicks while remote revocation is pending', async () => {
        const pending = deferred();
        const remoteLogout = vi.fn(() => pending.promise);
        const navigate = vi.fn();
        localStorage.setItem('sonarfy_token', 'active-token');

        await initLogoutPage({
            document,
            location: { search: '' },
            adapter: { logout: remoteLogout },
            navigate,
            fetcher: vi.fn(async () => new Response(null, { status: 401 }))
        });

        const btn = document.getElementById('btnConfirmLogout');
        btn.click();
        btn.click();

        expect(remoteLogout).toHaveBeenCalledTimes(1);
        expect(btn.disabled).toBe(true);
        expect(btn.getAttribute('aria-busy')).toBe('true');
        expect(navigate).not.toHaveBeenCalled();

        pending.resolve();
        await pending.promise;
        await Promise.resolve();

        expect(localStorage.getItem('sonarfy_token')).toBeNull();
        expect(navigate).toHaveBeenCalledTimes(1);
        expect(navigate).toHaveBeenCalledWith('login.html');
    });

    // Still clear sonarfy_token and redirect to login.html if remote revocation rejects.
    it('clears sonarfy_token and redirects even when remote revocation rejects', async () => {
        localStorage.setItem('sonarfy_token', 'active-token');
        localStorage.setItem('sonarfy_theme', 'light');
        const navigate = vi.fn();
        const remoteLogout = vi.fn(async () => {
            throw new Error('Network error');
        });

        await initLogoutPage({
            document,
            location: { search: '' },
            adapter: { actions: { logout: remoteLogout } },
            navigate,
            fetcher: vi.fn(async () => new Response(null, { status: 401 }))
        });

        document.getElementById('btnConfirmLogout').click();
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(remoteLogout).toHaveBeenCalledTimes(1);
        expect(localStorage.getItem('sonarfy_token')).toBeNull();
        expect(localStorage.getItem('sonarfy_theme')).toBe('light');
        expect(navigate).toHaveBeenCalledWith('login.html');
    });

    // Validate safe internal return URLs and block external/open-redirect attempts.
    it('validates safe return URLs and blocks open redirects on cancel and header back links', async () => {
        expect(resolveSafeReturnUrl('https://evil.com/phish')).toBe('feed.html');
        expect(resolveSafeReturnUrl('//evil.com')).toBe('feed.html');
        expect(resolveSafeReturnUrl('javascript:alert(1)')).toBe('feed.html');
        expect(resolveSafeReturnUrl('logout.html')).toBe('feed.html');
        expect(resolveSafeReturnUrl('profile.html?handle=lucas_vinyl')).toBe('profile.html?handle=lucas_vinyl');

        const navigate = vi.fn();
        await initLogoutPage({
            document,
            location: { search: '?from=profile.html%3Fhandle%3Dlucas_vinyl' },
            adapter: null,
            navigate
        });

        const cancelBtn = document.getElementById('btnCancelLogout');
        expect(cancelBtn.getAttribute('href')).toBe('profile.html?handle=lucas_vinyl');
        cancelBtn.click();
        expect(navigate).toHaveBeenCalledWith('profile.html?handle=lucas_vinyl');
    });

    // Wire shared sidebar Sair link to logout.html.
    it('wires shared sidebar Sair item to logout.html', () => {
        document.body.innerHTML = sidebar(true);
        const links = Array.from(document.querySelectorAll('.profile-navigation a'));
        const sair = links.find(link => link.textContent.includes('Sair'));
        expect(sair).toBeTruthy();
        expect(sair.getAttribute('href')).toContain('logout.html');
    });
});
