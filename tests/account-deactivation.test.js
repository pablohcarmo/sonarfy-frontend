import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAccountDeactivationClient, validateDeactivationPassword } from '../js/account-deactivation-http.js';
import { initConfirmAccountDeactivation } from '../js/confirm-account-deactivation.js';
import { createHttpAccountAdapter } from '../js/account-http.js';
import { mountAccount } from '../js/account.js';

const confirmHtml = readFileSync('pages/confirm-account-deactivation.html', 'utf8');
const accountHtml = readFileSync('pages/account.html', 'utf8');

const json = (body, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
});

describe('account-deactivation: solicitação autenticada e confirmação pública', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
        document.body.innerHTML = '';
    });

    // Valida senha obrigatória não vazia e limite de 72 bytes UTF-8 sem truncamento.
    it('valida senha atual obrigatória e limite de 72 bytes UTF-8 antes do envio', () => {
        expect(() => validateDeactivationPassword('')).toThrow('senha atual');
        expect(() => validateDeactivationPassword('   ')).toThrow('senha atual');
        expect(() => validateDeactivationPassword('a'.repeat(73))).toThrow('72 bytes');
        expect(() => validateDeactivationPassword('é'.repeat(37))).toThrow('72 bytes');
        expect(validateDeactivationPassword(' Senha@2026 ')).toEqual({ currentPassword: ' Senha@2026 ' });
    });

    // Trata 202, 401 (senha incorreta vs sessão expirada), 400, 404 e 429 no POST /api/users/me/account-deactivation-request.
    it('envia POST /api/users/me/account-deactivation-request e distingue senha incorreta de sessão expirada', async () => {
        let token = 'access-1';
        const expire = vi.fn();
        const fetcher = vi.fn()
            .mockResolvedValueOnce(json({ message: 'Account deactivation request accepted for delivery.', expiresInSeconds: 900 }, 202))
            .mockResolvedValueOnce(new Response(null, { status: 401 }))
            .mockResolvedValueOnce(json({ accessToken: 'access-2', tokenType: 'Bearer', expiresInSeconds: 900 }, 200))
            .mockResolvedValueOnce(new Response(null, { status: 401 }))
            .mockResolvedValueOnce(new Response(null, { status: 429 }))
            .mockResolvedValueOnce(new Response(null, { status: 404 }))
            .mockResolvedValueOnce(new Response(null, { status: 401 }))
            .mockResolvedValueOnce(new Response(null, { status: 401 }));
        const client = createAccountDeactivationClient({
            baseUrl: 'https://api.example.invalid/api',
            fetcher,
            getToken: () => token,
            setToken: next => { token = next; },
            expire
        });

        const accepted = await client.requestAccountDeactivation({ currentPassword: 'ok' });
        expect(accepted).toMatchObject({ accepted: true, expiresInSeconds: 900, cooldownSeconds: 30 });

        await expect(client.requestAccountDeactivation({ currentPassword: 'errada' }))
            .rejects.toMatchObject({ status: 401, message: expect.stringContaining('Senha atual incorreta') });
        expect(expire).not.toHaveBeenCalled();

        await expect(client.requestAccountDeactivation({ currentPassword: 'ok' })).rejects.toMatchObject({ status: 429 });
        await expect(client.requestAccountDeactivation({ currentPassword: 'ok' })).rejects.toMatchObject({ status: 404 });

        await expect(client.requestAccountDeactivation({ currentPassword: 'ok' }))
            .rejects.toMatchObject({ status: 401, message: expect.stringContaining('Sessão expirada') });
        expect(expire).toHaveBeenCalledTimes(1);
    });

    // Integra o modal "Desativar Conta" em pages/account.html ao POST /api/users/me/account-deactivation-request sem encerrar sessão.
    it('coleta senha atual no modal de account.html, mantém sessão e inicia cooldown em 202', async () => {
        document.body.innerHTML = accountHtml.split('<body class="account-page">')[1].split('</body>')[0];
        for (const dlg of document.querySelectorAll('dialog')) {
            if (!dlg.showModal) dlg.showModal = () => { dlg.setAttribute('open', ''); dlg.open = true; };
            if (!dlg.close) dlg.close = () => { dlg.removeAttribute('open'); dlg.open = false; dlg.dispatchEvent(new Event('close')); };
        }
        localStorage.setItem('sonarfy_token', 'tok-acc');
        const user = { id: 1, name: 'Ana', surname: 'Ribeiro', handle: 'ana', email: 'ana@sonarfy.com', city: 'SP', country: 'BR', birthDate: '2000-01-01', active: true };
        const fetcher = vi.fn()
            .mockResolvedValueOnce(json(user, 200))
            .mockResolvedValueOnce(json({ status: 'DISCONNECTED', connectedAt: null }, 200))
            .mockResolvedValueOnce(json({ message: 'Account deactivation request accepted for delivery.', expiresInSeconds: 900 }, 202));
        const adapter = createHttpAccountAdapter({
            baseUrl: 'https://api.example.invalid/api',
            fetcher,
            getToken: () => localStorage.getItem('sonarfy_token')
        });
        const app = mountAccount(adapter);
        await app.ready;

        document.getElementById('deactivate-account-btn').click();
        const dialog = document.getElementById('account-dialog');
        expect(dialog.open).toBe(true);
        expect(dialog.textContent).toContain('Reativar conta');
        dialog.querySelector('#deactivate-password').value = 'SenhaAtual@1';
        dialog.querySelector('[data-confirm]').click();

        await vi.waitFor(() => {
            expect(dialog.open).toBe(true);
            expect(dialog.textContent).toContain('Solicitação enviada! Verifique seu e-mail para confirmar a desativação da conta.');
            expect(document.getElementById('deactivate-account-btn').disabled).toBe(true);
        });
        const okButtons = dialog.querySelectorAll('button');
        expect(okButtons).toHaveLength(1);
        expect(okButtons[0].textContent.trim()).toBe('OK');
        expect(document.getElementById('account-status').textContent).toBe('');
        okButtons[0].click();
        expect(dialog.open).toBe(false);
        expect(fetcher.mock.calls[2][0]).toBe('https://api.example.invalid/api/users/me/account-deactivation-request');
        expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({ currentPassword: 'SenhaAtual@1' });
        expect(localStorage.getItem('sonarfy_token')).toBe('tok-acc');
        app.destroy();
    });

    // Confirma desativação em confirm-account-deactivation.html apenas via clique explícito, limpa sonarfy_token em 204 e trata 400.
    it('extrai #token com replaceState, exige confirmação explícita, limpa sonarfy_token em 204 e trata 400', async () => {
        document.body.innerHTML = confirmHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i)[1];
        localStorage.setItem('sonarfy_token', 'old-session-token');
        localStorage.setItem('sonarfy_theme', 'dark');
        const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 204 }));
        const replaceState = vi.fn();
        const deactivationClient = createAccountDeactivationClient({ baseUrl: 'https://api.example.invalid/api', fetcher });

        const ctrl = initConfirmAccountDeactivation({
            doc: document,
            locationObj: { pathname: '/pages/confirm-account-deactivation.html', search: '', hash: '#token=deactivation.tok-77' },
            historyObj: { replaceState },
            deactivationClient
        });

        expect(ctrl.hasToken).toBe(true);
        expect(replaceState).toHaveBeenCalledWith(null, '', '/pages/confirm-account-deactivation.html');
        // Abrir o link não envia POST automaticamente.
        expect(fetcher).not.toHaveBeenCalled();
        expect(document.getElementById('confirm-state').hidden).toBe(false);

        document.getElementById('btnConfirmAccountDeactivation').click();
        await vi.waitFor(() => expect(document.getElementById('success-state').hidden).toBe(false));

        expect(fetcher).toHaveBeenCalledExactlyOnceWith('https://api.example.invalid/api/auth/account-deactivation-confirmation', {
            method: 'POST',
            credentials: 'omit',
            cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: 'deactivation.tok-77' })
        });
        expect(localStorage.getItem('sonarfy_token')).toBeNull();
        expect(localStorage.getItem('sonarfy_theme')).toBe('dark');

        // Rejeita token acima de 256 caracteres localmente e trata 400 do backend orientando nova solicitação.
        await expect(deactivationClient.confirmAccountDeactivation('a'.repeat(257))).rejects.toMatchObject({ status: 400 });
        const fetcher400 = vi.fn().mockResolvedValueOnce(new Response(null, { status: 400 }));
        const client400 = createAccountDeactivationClient({ baseUrl: 'https://api.example.invalid/api', fetcher: fetcher400 });
        document.body.innerHTML = confirmHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i)[1];
        initConfirmAccountDeactivation({
            doc: document,
            locationObj: { pathname: '/pages/confirm-account-deactivation.html', search: '', hash: '#token=deactivation.expired' },
            historyObj: { replaceState: vi.fn() },
            deactivationClient: client400
        });
        document.getElementById('btnConfirmAccountDeactivation').click();
        await vi.waitFor(() => expect(document.getElementById('error-state').hidden).toBe(false));
        expect(document.getElementById('error-message-text').textContent).toContain('nova desativação');
    });
});
