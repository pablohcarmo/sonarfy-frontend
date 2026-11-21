import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createSpotifyClient,
    readSpotifyCallbackOutcome,
    validateSpotifyAuthorizationUrl,
    SPOTIFY_DISCONNECT_NOTICE
} from '../js/spotify-http.js';
import { initSpotifySync } from '../js/spotify-sync.js';
import { createHttpAccountAdapter } from '../js/account-http.js';
import { mountAccount } from '../js/account.js';
import { SPOTIFY_SYNCED_KEY } from '../js/spotify-sync-state.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
});

describe('spotify-http: OAuth authorization, connection, disconnect e callback', () => {
    beforeEach(() => {
        localStorage.clear();
        delete window.sonarfySpotifyOAuth;
        history.replaceState(null, '', '/pages/spotify-sync.html');
    });

    // Valida URL de autorização do Spotify estritamente em HTTPS accounts.spotify.com.
    it('valida authorizationUrl e bloqueia esquemas ou hosts inseguros', () => {
        expect(validateSpotifyAuthorizationUrl('https://accounts.spotify.com/authorize?state=abc')).toBe(
            'https://accounts.spotify.com/authorize?state=abc'
        );
        expect(() => validateSpotifyAuthorizationUrl('http://accounts.spotify.com/authorize')).toThrow('inválida');
        expect(() => validateSpotifyAuthorizationUrl('https://evil.example/authorize')).toThrow('inválida');
        expect(() => validateSpotifyAuthorizationUrl('javascript:alert(1)')).toThrow('inválida');
    });

    // Inicia autorização via POST /api/spotify/authorization e trata 401/403/429.
    it('chama POST /api/spotify/authorization com Bearer e trata 403/429', async () => {
        const authUrl = 'https://accounts.spotify.com/authorize?response_type=code&state=s1';
        const fetcher = vi.fn()
            .mockResolvedValueOnce(json({ authorizationUrl: authUrl }))
            .mockResolvedValueOnce(new Response(null, { status: 403 }))
            .mockResolvedValueOnce(new Response(null, { status: 429 }));
        const client = createSpotifyClient({
            baseUrl: 'https://api.example.invalid/api',
            fetcher,
            getToken: () => 'access-tok'
        });

        expect(await client.startAuthorization()).toEqual({ authorizationUrl: authUrl });
        expect(fetcher.mock.calls[0]).toEqual([
            'https://api.example.invalid/api/spotify/authorization',
            expect.objectContaining({
                method: 'POST',
                credentials: 'omit',
                cache: 'no-store',
                headers: { Authorization: 'Bearer access-tok' }
            })
        ]);
        await expect(client.startAuthorization()).rejects.toMatchObject({ status: 403 });
        await expect(client.startAuthorization()).rejects.toMatchObject({ status: 429 });
    });

    // Consulta GET /api/spotify/connection para CONNECTED, REAUTHORIZATION_REQUIRED e DISCONNECTED e executa DELETE.
    it('consulta status da conexão e desconecta via DELETE /api/spotify/connection (204)', async () => {
        const fetcher = vi.fn()
            .mockResolvedValueOnce(json({ status: 'CONNECTED', connectedAt: '2026-11-10T03:00:00Z' }))
            .mockResolvedValueOnce(json({ status: 'REAUTHORIZATION_REQUIRED', connectedAt: '2026-11-10T03:00:00Z' }))
            .mockResolvedValueOnce(new Response(null, { status: 204 }));
        const client = createSpotifyClient({
            baseUrl: 'https://api.example.invalid/api',
            fetcher,
            getToken: () => 'access-tok'
        });

        const connected = await client.getConnection();
        expect(connected).toEqual({ status: 'CONNECTED', connectedAt: '2026-11-10T03:00:00Z', spotifyConnected: true });
        expect(localStorage.getItem(SPOTIFY_SYNCED_KEY)).toBe('true');

        const reauth = await client.getConnection();
        expect(reauth).toEqual({ status: 'REAUTHORIZATION_REQUIRED', connectedAt: '2026-11-10T03:00:00Z', spotifyConnected: false });
        expect(localStorage.getItem(SPOTIFY_SYNCED_KEY)).toBeNull();

        const disconnected = await client.disconnectConnection();
        expect(disconnected).toMatchObject({ status: 'DISCONNECTED', spotifyConnected: false, message: SPOTIFY_DISCONNECT_NOTICE });
        expect(fetcher.mock.calls[2][0]).toBe('https://api.example.invalid/api/spotify/connection');
        expect(fetcher.mock.calls[2][1].method).toBe('DELETE');
    });

    // Lê todos os desfechos de ?spotify= e limpa o parâmetro da barra de endereços via replaceState.
    it.each([
        ['connected', false, 'conectada com sucesso'],
        ['denied', true, 'cancelada'],
        ['invalid_state', true, 'expirou ou foi invalidada'],
        ['error', true, 'Não foi possível concluir']
    ])('interpreta ?spotify=%s e remove o parâmetro da URL', (outcome, isError, expectedSnippet) => {
        const replaceState = vi.fn();
        const result = readSpotifyCallbackOutcome(
            { pathname: '/pages/account.html', search: `?foo=1&spotify=${outcome}`, hash: '#sec' },
            { replaceState }
        );
        expect(result.outcome).toBe(outcome);
        expect(result.isError).toBe(isError);
        expect(result.message).toContain(expectedSnippet);
        expect(replaceState).toHaveBeenCalledExactlyOnceWith(null, '', '/pages/account.html?foo=1#sec');
    });

    // Integra spotify-sync.html ao POST /api/spotify/authorization e ao retorno ?spotify=connected.
    it('redireciona para authorizationUrl em spotify-sync.html e trata callback ?spotify=connected', async () => {
        const html = readFileSync('pages/spotify-sync.html', 'utf8');
        document.body.innerHTML = html.match(/<body>([\s\S]*)<\/body>/)[1];
        const navigate = vi.fn();
        const authUrl = 'https://accounts.spotify.com/authorize?response_type=code&state=xyz';
        const spotifyClient = {
            startAuthorization: vi.fn(async () => ({ authorizationUrl: authUrl })),
            getConnection: vi.fn(async () => ({ status: 'CONNECTED', connectedAt: '2026-11-20T00:00:00Z', spotifyConnected: true }))
        };

        initSpotifySync({
            navigate,
            spotifyClient,
            locationObj: { pathname: '/pages/spotify-sync.html', search: '?spotify=connected', hash: '' },
            historyObj: { replaceState: vi.fn() }
        });

        await vi.waitFor(() => {
            expect(spotifyClient.getConnection).toHaveBeenCalledOnce();
            expect(document.getElementById('spotify-error').textContent).toContain('conectada com sucesso');
        });

        document.getElementById('spotify-connect').click();
        await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith(authUrl));
        expect(spotifyClient.startAuthorization).toHaveBeenCalledOnce();
    });

    // Integra pages/account.html aos estados REAUTHORIZATION_REQUIRED, CONNECTED e DELETE /api/spotify/connection.
    it('reflete REAUTHORIZATION_REQUIRED e executa DELETE /api/spotify/connection em account.html', async () => {
        const html = readFileSync('pages/account.html', 'utf8');
        document.body.innerHTML = html.split('<body class="account-page">')[1].split('</body>')[0];
        const user = { id: 1, name: 'Ana', surname: 'Ribeiro', handle: 'ana', email: 'ana@sonarfy.com', city: 'SP', country: 'BR', birthDate: '2000-01-01', active: true };
        const fetcher = vi.fn()
            .mockResolvedValueOnce(json(user))
            .mockResolvedValueOnce(json({ status: 'REAUTHORIZATION_REQUIRED', connectedAt: '2026-11-10T03:00:00Z' }));
        const adapter = createHttpAccountAdapter({ baseUrl: 'https://api.example.invalid/api', fetcher, getToken: () => 'tok' });
        const app = mountAccount(adapter, { location: { pathname: '/pages/account.html', search: '?spotify=denied', hash: '' }, history: { replaceState: vi.fn() } });
        await app.ready;

        expect(document.getElementById('spotify-sync-link').textContent).toBe('Reconectar Spotify');
        expect(document.getElementById('account-status').textContent).toContain('cancelada');
        app.destroy();

        const fetcher2 = vi.fn()
            .mockResolvedValueOnce(json(user))
            .mockResolvedValueOnce(json({ status: 'CONNECTED', connectedAt: '2026-11-10T03:00:00Z' }))
            .mockResolvedValueOnce(new Response(null, { status: 204 }));
        const adapter2 = createHttpAccountAdapter({ baseUrl: 'https://api.example.invalid/api', fetcher: fetcher2, getToken: () => 'tok' });
        const app2 = mountAccount(adapter2);
        await app2.ready;

        document.getElementById('spotify-disconnect-btn').click();
        await vi.waitFor(() => {
            expect(document.getElementById('spotify-sync-link')).not.toBeNull();
            expect(document.getElementById('account-status').textContent).toContain('painel de aplicativos conectados');
        });
        app2.destroy();
    });
});
