import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { SPOTIFY_COOLDOWN_MS, SPOTIFY_SYNCED_KEY, SPOTIFY_SKIPPED_KEY,
    shouldShowSpotifySync, skipSpotifySync, markSpotifySynced,
    getPostLoginDestination, syncSpotify } from '../js/spotify-sync-state.js';

const now = 2_000_000_000_000;

beforeEach(() => localStorage.clear());

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

describe('Interações da página', () => {
    it('salva skip, bloqueia clique duplicado e permite tentar novamente após falha', async () => {
        const html = fs.readFileSync(path.resolve(__dirname, '../pages/spotify-sync.html'), 'utf8');
        document.body.innerHTML = html.match(/<body>([\s\S]*)<\/body>/)[1];
        const { initSpotifySync } = await import('../js/spotify-sync.js');
        // The module initializes the actual page once; use a fresh DOM for dependency injection.
        document.body.innerHTML = html.match(/<body>([\s\S]*)<\/body>/)[1];
        const navigate = vi.fn();
        let reject;
        const handler = vi.fn(() => new Promise((_, no) => { reject = no; }));
        initSpotifySync({ navigate, handler });
        const connect = document.getElementById('spotify-connect');
        const skip = document.getElementById('spotify-skip');
        connect.click();
        connect.click();
        expect(handler).toHaveBeenCalledOnce();
        expect(skip.disabled).toBe(true);
        reject(new Error('Conexão cancelada.'));
        await vi.waitFor(() => expect(connect.disabled).toBe(false));
        expect(document.getElementById('spotify-error').textContent).toBe('Conexão cancelada.');
        expect(navigate).not.toHaveBeenCalled();
        skip.click();
        expect(Number(localStorage.getItem(SPOTIFY_SKIPPED_KEY))).toBeGreaterThan(0);
        expect(navigate).toHaveBeenCalledWith('profile.html');
        expect(document.querySelector('footer')).toBeNull();
    });
});
