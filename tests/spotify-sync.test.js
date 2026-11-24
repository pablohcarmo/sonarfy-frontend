import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { SPOTIFY_COOLDOWN_MS, SPOTIFY_SYNCED_KEY, SPOTIFY_SKIPPED_KEY,
    shouldShowSpotifySync, skipSpotifySync, markSpotifySynced,
    getPostLoginDestination, syncSpotify } from '../js/spotify-sync-state.js';

const now = 2_000_000_000_000;
const html = fs.readFileSync(path.resolve(__dirname, '../pages/spotify-sync.html'), 'utf8');
let initSpotifySync;

beforeEach(async () => {
    localStorage.clear();
    document.body.innerHTML = html.match(/<body>([\s\S]*)<\/body>/)[1];
    if (!initSpotifySync) {
        ({ initSpotifySync } = await import('../js/spotify-sync.js'));
        document.body.innerHTML = html.match(/<body>([\s\S]*)<\/body>/)[1];
    }
});

describe('Elegibilidade do Spotify após login', () => {
    it('define o cooldown como exatamente 7 dias', () => {
        expect(SPOTIFY_COOLDOWN_MS).toBe(7 * 24 * 60 * 60 * 1000);
    });
    it('exibe no primeiro login', () => {
        expect(shouldShowSpotifySync(localStorage, now)).toBe(true);
        expect(getPostLoginDestination(localStorage, now)).toBe('spotify-sync.html');
    });
    it('envia contas sincronizadas diretamente ao perfil, mesmo com skip antigo', () => {
        localStorage.setItem(SPOTIFY_SYNCED_KEY, 'true');
        localStorage.setItem(SPOTIFY_SKIPPED_KEY, '1');
        expect(getPostLoginDestination(localStorage, now)).toBe('profile.html');
    });
    it.each([0, 1, SPOTIFY_COOLDOWN_MS - 1])('oculta durante o cooldown, após %i ms', elapsed => {
        skipSpotifySync(localStorage, now - elapsed);
        expect(shouldShowSpotifySync(localStorage, now)).toBe(false);
        expect(getPostLoginDestination(localStorage, now)).toBe('profile.html');
    });
    it.each([SPOTIFY_COOLDOWN_MS, SPOTIFY_COOLDOWN_MS + 1])('reexibe a partir de 7 dias (%i ms)', elapsed => {
        skipSpotifySync(localStorage, now - elapsed);
        expect(shouldShowSpotifySync(localStorage, now)).toBe(true);
    });
    it.each(['', 'invalid', 'Infinity', '-1', String(now + 1)])('recupera timestamp inválido: %s', value => {
        localStorage.setItem(SPOTIFY_SKIPPED_KEY, value);
        expect(shouldShowSpotifySync(localStorage, now)).toBe(true);
    });
    it('tolera armazenamento indisponível na leitura', () => {
        expect(shouldShowSpotifySync({ getItem() { throw new Error(); } }, now)).toBe(true);
    });
    it('marca sincronização e limpa o cooldown', () => {
        skipSpotifySync(localStorage, now);
        markSpotifySynced();
        expect(localStorage.getItem(SPOTIFY_SYNCED_KEY)).toBe('true');
        expect(localStorage.getItem(SPOTIFY_SKIPPED_KEY)).toBeNull();
    });
});

describe('Confirmação do OAuth', () => {
    it('aguarda confirmação antes de gravar sucesso', async () => {
        let complete;
        const handler = vi.fn(() => new Promise(resolve => { complete = resolve; }));
        skipSpotifySync(localStorage, now);
        const pending = syncSpotify(handler);
        expect(localStorage.getItem(SPOTIFY_SYNCED_KEY)).toBeNull();
        complete({ synced: true });
        await pending;
        expect(handler).toHaveBeenCalledOnce();
        expect(localStorage.getItem(SPOTIFY_SYNCED_KEY)).toBe('true');
        expect(localStorage.getItem(SPOTIFY_SKIPPED_KEY)).toBeNull();
    });
    it.each([undefined, () => undefined, () => ({ synced: false }), () => Promise.reject(new Error('Cancelado'))])('não grava sucesso em falha/cancelamento/ausência do handler', async handler => {
        skipSpotifySync(localStorage, now);
        await expect(syncSpotify(handler)).rejects.toThrow();
        expect(localStorage.getItem(SPOTIFY_SYNCED_KEY)).toBeNull();
        expect(localStorage.getItem(SPOTIFY_SKIPPED_KEY)).toBe(String(now));
    });
});

describe('Interações e estados da página', () => {
    it('renderiza estado inicial por padrão e omite rodapé global', () => {
        initSpotifySync({ navigate: vi.fn() });
        const card = document.getElementById('spotify-card');
        expect(card.dataset.state).toBe('initial');
        expect(card.querySelector('[data-sync-panel="initial"]').hidden).toBe(false);
        expect(card.querySelector('[data-sync-panel="success"]').hidden).toBe(true);
        expect(card.querySelector('[data-sync-panel="failure"]').hidden).toBe(true);
        expect(document.querySelector('footer')).toBeNull();
    });

    it('transiciona para estado de sucesso quando handler resolve e navega ao clicar Continuar no Sonarfy', async () => {
        const navigate = vi.fn();
        const handler = vi.fn().mockResolvedValue({ synced: true });
        initSpotifySync({ navigate, handler, locationObj: { search: '', pathname: '/pages/spotify-sync.html', hash: '' } });

        document.getElementById('spotify-connect').click();
        await vi.waitFor(() => expect(document.getElementById('spotify-card').dataset.state).toBe('success'));

        const continueBtn = document.getElementById('spotify-continue');
        expect(document.querySelector('[data-sync-panel="success"]').hidden).toBe(false);
        expect(document.querySelector('[data-sync-panel="initial"]').hidden).toBe(true);
        expect(document.getElementById('spotify-status-announcer').textContent).toBe('Conta conectada com sucesso!');
        expect(document.activeElement).toBe(continueBtn);
        expect(navigate).not.toHaveBeenCalled();

        continueBtn.click();
        expect(navigate).toHaveBeenCalledWith('profile.html');
    });

    it('redireciona Continuar no Sonarfy para echoes.html quando source=echoes', async () => {
        const navigate = vi.fn();
        const handler = vi.fn().mockResolvedValue({ synced: true });
        initSpotifySync({
            navigate,
            handler,
            locationObj: { search: '?source=echoes', pathname: '/pages/spotify-sync.html', hash: '' }
        });

        document.getElementById('spotify-connect').click();
        await vi.waitFor(() => expect(document.getElementById('spotify-card').dataset.state).toBe('success'));

        document.getElementById('spotify-continue').click();
        expect(navigate).toHaveBeenCalledWith('echoes.html');
    });

    it('bloqueia clique duplicado, transiciona para falha em rejeição e permite tentar novamente até sucesso', async () => {
        const navigate = vi.fn();
        let rejectFirst;
        const handler = vi.fn()
            .mockImplementationOnce(() => new Promise((_, reject) => { rejectFirst = reject; }))
            .mockResolvedValueOnce({ synced: true });
        initSpotifySync({ navigate, handler });

        const connect = document.getElementById('spotify-connect');
        const skip = document.getElementById('spotify-skip');
        connect.click();
        connect.click();
        expect(handler).toHaveBeenCalledOnce();
        expect(skip.disabled).toBe(true);

        rejectFirst(new Error('Conexão cancelada.'));
        await vi.waitFor(() => expect(document.getElementById('spotify-card').dataset.state).toBe('failure'));

        const retry = document.getElementById('spotify-retry');
        expect(document.querySelector('[data-sync-panel="failure"]').hidden).toBe(false);
        expect(document.getElementById('spotify-status-announcer').textContent).toBe('Não foi possível conectar ao Spotify.');
        expect(document.activeElement).toBe(retry);
        expect(navigate).not.toHaveBeenCalled();

        retry.click();
        await vi.waitFor(() => expect(document.getElementById('spotify-card').dataset.state).toBe('success'));
        expect(handler).toHaveBeenCalledTimes(2);
    });

    it('permite pular no estado de falha e salva cooldown', async () => {
        const navigate = vi.fn();
        const handler = vi.fn().mockRejectedValue(new Error('Cancelado'));
        initSpotifySync({ navigate, handler });

        document.getElementById('spotify-connect').click();
        await vi.waitFor(() => expect(document.getElementById('spotify-card').dataset.state).toBe('failure'));

        document.getElementById('spotify-failure-skip').click();
        expect(Number(localStorage.getItem(SPOTIFY_SKIPPED_KEY))).toBeGreaterThan(0);
        expect(navigate).toHaveBeenCalledWith('profile.html');
    });

    it('transiciona para sucesso ou falha conforme callback OAuth da URL', async () => {
        const navigate = vi.fn();
        const getConnection = vi.fn().mockResolvedValue({ status: 'CONNECTED', recentListensAuthorized: true });
        initSpotifySync({
            navigate,
            spotifyClient: { getConnection, startAuthorization: vi.fn() },
            locationObj: { search: '?spotify=connected', pathname: '/pages/spotify-sync.html', hash: '' },
            historyObj: { replaceState: vi.fn() }
        });
        await vi.waitFor(() => expect(document.getElementById('spotify-card').dataset.state).toBe('success'));
        expect(localStorage.getItem(SPOTIFY_SYNCED_KEY)).toBe('true');

        document.body.innerHTML = html.match(/<body>([\s\S]*)<\/body>/)[1];
        initSpotifySync({
            navigate,
            spotifyClient: { getConnection: vi.fn(), startAuthorization: vi.fn() },
            locationObj: { search: '?spotify=denied', pathname: '/pages/spotify-sync.html', hash: '' },
            historyObj: { replaceState: vi.fn() }
        });
        expect(document.getElementById('spotify-card').dataset.state).toBe('failure');
    });
});
