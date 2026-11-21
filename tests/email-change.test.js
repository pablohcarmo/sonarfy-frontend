import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmailChangeClient, validateEmailChangeInput } from '../js/email-change-http.js';
import { initConfirmEmailChange } from '../js/confirm-email-change.js';
import { createHttpAccountAdapter } from '../js/account-http.js';
import { mountAccount } from '../js/account.js';

const confirmHtml = readFileSync('pages/confirm-email-change.html', 'utf8');
const accountHtml = readFileSync('pages/account.html', 'utf8');

const json = (body, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
});

describe('email-change: solicitação autenticada e confirmação pública', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
        document.body.innerHTML = '';
    });

    // Valida formato do novo e-mail, ausência de espaços externos, limite de 150 chars e senha atual obrigatória.
    it('valida novo e-mail e senha atual antes do envio', () => {
        expect(() => validateEmailChangeInput({ newEmail: ' invalido@example.com', currentPassword: '123' })).toThrow('válido');
        expect(() => validateEmailChangeInput({ newEmail: 'a@b.com', currentPassword: '' })).toThrow('senha atual');
        expect(validateEmailChangeInput({ newEmail: 'novo@example.com', currentPassword: 'secret' })).toEqual({
            newEmail: 'novo@example.com',
            currentPassword: 'secret'
        });
    });

    // Trata 202, 409, 429, 404 (feature flag desligada) e 401 de senha incorreta sem expirar sessão.
    it('envia POST /api/users/me/email-change-request e distingue senha incorreta de sessão expirada', async () => {
        let token = 'access-1';
        const expire = vi.fn();
        const fetcher = vi.fn()
            .mockResolvedValueOnce(json({ message: 'Email change request accepted for delivery.', expiresInSeconds: 900 }, 202))
            .mockResolvedValueOnce(new Response(null, { status: 401 }))
            .mockResolvedValueOnce(json({ accessToken: 'access-2', tokenType: 'Bearer', expiresInSeconds: 900 }, 200))
            .mockResolvedValueOnce(new Response(null, { status: 401 }))
            .mockResolvedValueOnce(new Response(null, { status: 409 }))
            .mockResolvedValueOnce(new Response(null, { status: 429 }))
            .mockResolvedValueOnce(new Response(null, { status: 404 }));
        const client = createEmailChangeClient({
            baseUrl: 'https://api.example.invalid/api',
            fetcher,
            getToken: () => token,
            setToken: next => { token = next; },
            expire
        });

        const accepted = await client.requestEmailChange({ newEmail: 'novo@example.com', currentPassword: 'ok' });
        expect(accepted).toMatchObject({ accepted: true, expiresInSeconds: 900, cooldownSeconds: 30 });

        await expect(client.requestEmailChange({ newEmail: 'novo@example.com', currentPassword: 'errada' }))
            .rejects.toMatchObject({ status: 401, message: expect.stringContaining('Senha atual incorreta') });
        expect(expire).not.toHaveBeenCalled();

        await expect(client.requestEmailChange({ newEmail: 'ocupado@example.com', currentPassword: 'ok' })).rejects.toMatchObject({ status: 409 });
        await expect(client.requestEmailChange({ newEmail: 'novo@example.com', currentPassword: 'ok' })).rejects.toMatchObject({ status: 429 });
        await expect(client.requestEmailChange({ newEmail: 'novo@example.com', currentPassword: 'ok' })).rejects.toMatchObject({ status: 404 });
    });

    // Integra o modal "Alterar E-mail" em pages/account.html ao POST /api/users/me/email-change-request.
    it('coleta novo e-mail e senha atual no modal de account.html e inicia cooldown em 202', async () => {
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
            .mockResolvedValueOnce(json({ message: 'Accepted', expiresInSeconds: 900 }, 202));
        const adapter = createHttpAccountAdapter({
            baseUrl: 'https://api.example.invalid/api',
            fetcher,
            getToken: () => localStorage.getItem('sonarfy_token')
        });
        const app = mountAccount(adapter);
        await app.ready;

        document.getElementById('change-email-btn').click();
        const dialog = document.getElementById('account-dialog');
        expect(dialog.open).toBe(true);
        dialog.querySelector('#email-change-new').value = 'nova.ana@sonarfy.com';
        dialog.querySelector('#email-change-password').value = 'SenhaAtual@1';
        dialog.querySelector('[data-confirm]').click();

        await vi.waitFor(() => {
            expect(dialog.open).toBe(false);
            expect(document.getElementById('change-email-btn').disabled).toBe(true);
        });
        expect(fetcher.mock.calls[2][0]).toBe('https://api.example.invalid/api/users/me/email-change-request');
        expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({
            newEmail: 'nova.ana@sonarfy.com',
            currentPassword: 'SenhaAtual@1'
        });
        app.destroy();
    });

    // Confirma troca de e-mail em confirm-email-change.html apenas mediante clique explícito e limpa sonarfy_token.
    it('extrai #token com replaceState, exige confirmação explícita e limpa sonarfy_token em 200', async () => {
        document.body.innerHTML = confirmHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i)[1];
        localStorage.setItem('sonarfy_token', 'old-session-token');
        localStorage.setItem('sonarfy_theme', 'dark');
        const fetcher = vi.fn().mockResolvedValueOnce(json({ message: 'Email changed successfully.', requiresLogin: true }, 200));
        const replaceState = vi.fn();
        const emailChangeClient = createEmailChangeClient({ baseUrl: 'https://api.example.invalid/api', fetcher });

        const ctrl = initConfirmEmailChange({
            doc: document,
            locationObj: { pathname: '/pages/confirm-email-change.html', search: '', hash: '#token=email-tok-77' },
            historyObj: { replaceState },
            emailChangeClient
        });

        expect(ctrl.hasToken).toBe(true);
        expect(replaceState).toHaveBeenCalledWith(null, '', '/pages/confirm-email-change.html');
        // Abrir o link não envia POST automaticamente.
        expect(fetcher).not.toHaveBeenCalled();
        expect(document.getElementById('confirm-state').hidden).toBe(false);

        document.getElementById('btnConfirmEmailChange').click();
        await vi.waitFor(() => expect(document.getElementById('success-state').hidden).toBe(false));

        expect(fetcher).toHaveBeenCalledExactlyOnceWith('https://api.example.invalid/api/auth/email-change-confirmation', {
            method: 'POST',
            credentials: 'omit',
            cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: 'email-tok-77' })
        });
        expect(localStorage.getItem('sonarfy_token')).toBeNull();
        expect(localStorage.getItem('sonarfy_theme')).toBe('dark');
    });
});
