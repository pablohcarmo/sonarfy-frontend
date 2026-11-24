import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthClient, resolveApiBaseUrl } from '../js/auth-http.js';
import { logoutAccount } from '../js/account-state.js';
import { logout as logoutFeed } from '../js/feed-state.js';

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

describe('auth-http: ciclo de vida de sessão (refresh e logout)', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    // Valida POST /api/auth/refresh com credentials include, no-store, CSRF e atualização do accessToken.
    it('renova accessToken via POST /api/auth/refresh sem expor refresh token', async () => {
        let currentToken = 'expired-token';
        const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
            accessToken: 'fresh-token',
            tokenType: 'Bearer',
            expiresInSeconds: 900
        }), { status: 200 }));
        const client = createAuthClient({
            baseUrl: 'https://api.example.invalid/api/',
            fetcher,
            getToken: () => currentToken,
            setToken: token => { currentToken = token; }
        });

        const nextToken = await client.refreshSession();

        expect(nextToken).toBe('fresh-token');
        expect(currentToken).toBe('fresh-token');
        expect(fetcher).toHaveBeenCalledExactlyOnceWith('https://api.example.invalid/api/auth/refresh', {
            method: 'POST',
            credentials: 'include',
            cache: 'no-store',
            headers: { 'X-Sonarfy-CSRF': '1' }
        });
    });

    // Deduplica chamadas concorrentes de 401 em um único POST /api/auth/refresh (single-flight).
    it('deduplica chamadas concorrentes após 401 em um único refresh e repete cada requisição uma vez', async () => {
        let currentToken = 'stale-token';
        const pendingRefresh = deferred();
        const fetcher = vi.fn(url => {
            if (url.endsWith('/auth/refresh')) return pendingRefresh.promise;
            if (currentToken === 'stale-token') return Promise.resolve(new Response(null, { status: 401 }));
            return Promise.resolve(new Response(JSON.stringify({ ok: true, url }), { status: 200 }));
        });
        const expire = vi.fn();
        const client = createAuthClient({
            baseUrl: 'https://api.example.invalid/api',
            fetcher,
            getToken: () => currentToken,
            setToken: token => { currentToken = token; },
            expire
        });

        const reqA = client.authorizedFetch('/profile/me');
        const reqB = client.authorizedFetch('/users/me');

        await vi.waitFor(() => {
            expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/auth/refresh'))).toHaveLength(1);
        });

        pendingRefresh.resolve(new Response(JSON.stringify({ accessToken: 'rotated-token' }), { status: 200 }));
        const [resA, resB] = await Promise.all([reqA, reqB]);

        expect(resA.response.status).toBe(200);
        expect(resB.response.status).toBe(200);
        expect(resA.refreshed).toBe(true);
        expect(resB.refreshed).toBe(true);
        expect(expire).not.toHaveBeenCalled();
        expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/auth/refresh'))).toHaveLength(1);
    });

    // Trata falha de refresh com 401 (limpa token) e 403 (preserva token sem repetir).
    it('limpa token em refresh 401 e bloqueia sem limpar em refresh 403', async () => {
        localStorage.setItem('sonarfy_token', 'old-token');
        localStorage.setItem('sonarfy_theme', 'dark');
        const fetcher = vi.fn()
            .mockResolvedValueOnce(new Response(null, { status: 403 }))
            .mockResolvedValueOnce(new Response(null, { status: 401 }));
        const client = createAuthClient({ baseUrl: 'https://api.example.invalid/api', fetcher });

        await expect(client.refreshSession()).rejects.toMatchObject({ status: 403 });
        expect(localStorage.getItem('sonarfy_token')).toBe('old-token');

        await expect(client.refreshSession()).rejects.toMatchObject({ status: 401 });
        expect(localStorage.getItem('sonarfy_token')).toBeNull();
        expect(localStorage.getItem('sonarfy_theme')).toBe('dark');
    });

    // Não repete refresh automaticamente em 5xx ou erro de rede e expira sessão quando 401 não recupera.
    it('não repete refresh em erro 5xx e expira sessão quando retry também retorna 401', async () => {
        let currentToken = 'expired-token';
        const expire = vi.fn();
        const fetcher = vi.fn()
            .mockResolvedValueOnce(new Response(null, { status: 401 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ accessToken: 'still-rejected' }), { status: 200 }))
            .mockResolvedValueOnce(new Response(null, { status: 401 }));
        const client = createAuthClient({
            baseUrl: 'https://api.example.invalid/api',
            fetcher,
            getToken: () => currentToken,
            setToken: token => { currentToken = token; },
            expire
        });

        const result = await client.authorizedFetch('/profile/me');
        expect(result.response.status).toBe(401);
        expect(expire).toHaveBeenCalledTimes(1);
        expect(fetcher).toHaveBeenCalledTimes(3);
    });

    // Valida POST /api/auth/logout com 204 e limpeza garantida no finally mesmo em falha de rede.
    it('envia POST /api/auth/logout com CSRF/credentials e limpa sonarfy_token no finally mesmo em erro', async () => {
        localStorage.setItem('sonarfy_token', 'active-token');
        sessionStorage.setItem('sonarfy_token', 'session-token');
        localStorage.setItem('sonarfy_theme', 'dark');

        const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 204 }));
        const client = createAuthClient({ baseUrl: 'https://api.example.invalid/api', fetcher });
        const result = await client.logoutSession();

        expect(result).toEqual({ ok: true, status: 204 });
        expect(fetcher).toHaveBeenCalledExactlyOnceWith('https://api.example.invalid/api/auth/logout', {
            method: 'POST',
            credentials: 'include',
            cache: 'no-store',
            headers: { 'X-Sonarfy-CSRF': '1' }
        });
        expect(localStorage.getItem('sonarfy_token')).toBeNull();
        expect(sessionStorage.getItem('sonarfy_token')).toBeNull();
        expect(localStorage.getItem('sonarfy_theme')).toBe('dark');

        localStorage.setItem('sonarfy_token', 'active-token-2');
        const failingFetcher = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch'));
        const failingClient = createAuthClient({ baseUrl: 'https://api.example.invalid/api', fetcher: failingFetcher });
        await expect(failingClient.logoutSession()).rejects.toThrow('Failed to fetch');
        expect(localStorage.getItem('sonarfy_token')).toBeNull();
    });

    // Garante que logoutAccount e logout (feed) chamam POST /api/auth/logout e limpam token no finally.
    it('integra logoutAccount e logout do feed ao POST /api/auth/logout', async () => {
        const navigate = vi.fn();
        const fetcher = vi.fn()
            .mockResolvedValueOnce(new Response(null, { status: 204 }))
            .mockRejectedValueOnce(new Error('offline'));

        localStorage.setItem('sonarfy_token', 'acc-token');
        await logoutAccount({}, navigate, { baseUrl: 'https://api.example.invalid/api', fetcher });
        expect(localStorage.getItem('sonarfy_token')).toBeNull();
        expect(navigate).toHaveBeenCalledWith('login.html');

        localStorage.setItem('sonarfy_token', 'feed-token');
        await logoutFeed({}, navigate, { baseUrl: 'https://api.example.invalid/api', fetcher });
        expect(localStorage.getItem('sonarfy_token')).toBeNull();
        expect(navigate).toHaveBeenCalledTimes(2);
        expect(fetcher).toHaveBeenCalledTimes(2);
        expect(fetcher.mock.calls[0][0]).toBe('https://api.example.invalid/api/auth/logout');
        expect(fetcher.mock.calls[1][0]).toBe('https://api.example.invalid/api/auth/logout');
    });

    // Resolve /api na mesma origem fora de localhost/127.0.0.1 para operar atrás do proxy reverso Nginx.
    it('resolve API_BASE_URL na mesma origem fora de localhost', () => {
        const prevApiBase = globalThis.API_BASE_URL;
        delete globalThis.API_BASE_URL;
        vi.stubGlobal('location', { hostname: 'sonarfymusic.duckdns.org', origin: 'https://sonarfymusic.duckdns.org' });
        expect(resolveApiBaseUrl()).toBe('https://sonarfymusic.duckdns.org/api');
        vi.stubGlobal('location', { hostname: 'localhost', origin: 'http://localhost:3000' });
        expect(resolveApiBaseUrl()).toBe('http://localhost:8080/api');
        vi.unstubAllGlobals();
        if (prevApiBase !== undefined) globalThis.API_BASE_URL = prevApiBase;
    });
});
