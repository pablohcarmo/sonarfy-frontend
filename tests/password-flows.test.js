import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPasswordClient, extractUrlToken, validateNewPassword } from '../js/password-http.js';
import { initPasswordRecovery } from '../js/password-recovery.js';
import { createHttpAccountAdapter } from '../js/account-http.js';
import { mountAccount } from '../js/account.js';

const recoveryHtml = readFileSync('pages/reset-password.html', 'utf8');
const accountHtml = readFileSync('pages/account.html', 'utf8');

describe('password-flows: recuperação pública e troca autenticada', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
        document.body.innerHTML = '';
    });

    // Valida regras de nova senha (mínimo 8 caracteres, <= 72 bytes UTF-8 e confirmação igual).
    it('valida regras de senha mínima, limite BCrypt de 72 bytes e confirmação', () => {
        expect(() => validateNewPassword('1234567', '1234567')).toThrow('8 caracteres');
        expect(() => validateNewPassword('SenhaValida1!', 'Diferente1!')).toThrow('não confere');
        expect(() => validateNewPassword('a'.repeat(73), 'a'.repeat(73))).toThrow('72 bytes');
        expect(() => validateNewPassword('SenhaValida1!', 'SenhaValida1!')).not.toThrow();
    });

    // Extrai token de query ou fragmento em memória e limpa a URL via replaceState.
    it('extrai token de query ou hash e limpa a URL via replaceState', () => {
        const replaceState = vi.fn();
        expect(extractUrlToken('password-change-token', {
            pathname: '/pages/account.html', search: '', hash: '#password-change-token=tok-abc'
        }, { replaceState })).toBe('tok-abc');
        expect(replaceState).toHaveBeenCalledWith(null, '', '/pages/account.html');

        const replaceState2 = vi.fn();
        expect(extractUrlToken('token', {
            pathname: '/pages/reset-password.html', search: '?token=reset-xyz', hash: ''
        }, { replaceState: replaceState2 })).toBe('reset-xyz');
        expect(replaceState2).toHaveBeenCalledWith(null, '', '/pages/reset-password.html');
    });

    // Solicita recuperação em POST /api/auth/forgot-password com mensagem uniforme sem enumeração.
    it('envia POST /api/auth/forgot-password com resposta uniforme e trata 400', async () => {
        const fetcher = vi.fn()
            .mockResolvedValueOnce(new Response('If an eligible account exists...', { status: 200 }))
            .mockResolvedValueOnce(new Response(null, { status: 400 }));
        const client = createPasswordClient({ baseUrl: 'https://api.example.invalid/api', fetcher });

        const ok = await client.requestForgotPassword('usuario@example.com');
        expect(ok.ok).toBe(true);
        expect(ok.message).toContain('Se existir uma conta elegível');
        expect(fetcher.mock.calls[0]).toEqual([
            'https://api.example.invalid/api/auth/forgot-password',
            expect.objectContaining({
                method: 'POST',
                credentials: 'omit',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: 'usuario@example.com' })
            })
        ]);
        await expect(client.requestForgotPassword('invalido')).rejects.toMatchObject({ status: 400 });
        await expect(client.requestForgotPassword('b@c.com')).rejects.toMatchObject({ status: 400 });
    });

    // Redefine senha em reset-password.html via POST /api/auth/reset-password e redireciona para login.html?reset=true.
    it('conclui POST /api/auth/reset-password em reset-password.html e redireciona para login.html?reset=true', async () => {
        document.body.innerHTML = recoveryHtml.match(/<body>([\s\S]*)<\/body>/i)[1];
        const fetcher = vi.fn().mockResolvedValueOnce(new Response('Password reset successfully.', { status: 200 }));
        const navigate = vi.fn();
        const replaceState = vi.fn();
        const passwordClient = createPasswordClient({ baseUrl: 'https://api.example.invalid/api', fetcher });

        const ctrl = initPasswordRecovery({
            doc: document,
            locationObj: { pathname: '/pages/reset-password.html', search: '?token=reset-123', hash: '' },
            historyObj: { replaceState },
            navigate,
            passwordClient
        });

        expect(ctrl.isResetMode).toBe(true);
        expect(replaceState).toHaveBeenCalledWith(null, '', '/pages/reset-password.html');
        document.getElementById('newPassword').value = 'NovaSenha@2026';
        document.getElementById('confirmNewPassword').value = 'NovaSenha@2026';
        document.getElementById('resetPasswordForm').dispatchEvent(new Event('submit', { cancelable: true }));

        await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('login.html?reset=true'));
        expect(fetcher.mock.calls[0][0]).toBe('https://api.example.invalid/api/auth/reset-password');
        expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
            token: 'reset-123',
            newPassword: 'NovaSenha@2026',
            confirmNewPassword: 'NovaSenha@2026'
        });
    });

    // Solicita troca autenticada (POST /api/users/me/password-change-request) e conclui PUT /api/users/me/password em account.html.
    it('integra password-change-request e PUT /api/users/me/password via #password-change-token em account.html', async () => {
        document.body.innerHTML = accountHtml.split('<body class="account-page">')[1].split('</body>')[0];
        for (const dlg of document.querySelectorAll('dialog')) {
            if (!dlg.showModal) dlg.showModal = () => { dlg.setAttribute('open', ''); dlg.open = true; };
            if (!dlg.close) dlg.close = () => { dlg.removeAttribute('open'); dlg.open = false; dlg.dispatchEvent(new Event('close')); };
        }
        localStorage.setItem('sonarfy_token', 'tok-active');
        const user = { id: 1, name: 'Ana', surname: 'Ribeiro', handle: 'ana', email: 'ana@sonarfy.com', city: 'SP', country: 'BR', birthDate: '2000-01-01', active: true };
        const fetcher = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify(user), { status: 200 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'DISCONNECTED', connectedAt: null }), { status: 200 }))
            .mockResolvedValueOnce(new Response(null, { status: 400 }))
            .mockResolvedValueOnce(new Response('Password updated successfully.', { status: 200 }));
        const navigate = vi.fn();
        const replaceState = vi.fn();
        const adapter = createHttpAccountAdapter({
            baseUrl: 'https://api.example.invalid/api',
            fetcher,
            getToken: () => localStorage.getItem('sonarfy_token')
        });

        const app = mountAccount(adapter, {
            navigate,
            location: { pathname: '/pages/account.html', search: '', hash: '#password-change-token=pwd-tok-9' },
            history: { replaceState }
        });
        await app.ready;

        expect(replaceState).toHaveBeenCalledWith(null, '', '/pages/account.html');
        const dialog = document.getElementById('account-dialog');
        expect(dialog.open).toBe(true);
        dialog.querySelector('#pwd-current').value = 'SenhaErrada!';
        dialog.querySelector('#pwd-new').value = 'NovaSenha@2026';
        dialog.querySelector('#pwd-confirm').value = 'NovaSenha@2026';
        dialog.querySelector('[data-confirm]').click();

        await vi.waitFor(() => {
            expect(dialog.querySelector('.account-dialog-status').textContent).toContain('Verifique a senha atual');
        });
        expect(localStorage.getItem('sonarfy_token')).toBe('tok-active');

        dialog.querySelector('#pwd-current').value = 'SenhaAtual@2026';
        dialog.querySelector('[data-confirm]').click();

        await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('login.html?reset=true'));
        expect(localStorage.getItem('sonarfy_token')).toBeNull();
        expect(fetcher.mock.calls[3][0]).toBe('https://api.example.invalid/api/users/me/password');
        expect(JSON.parse(fetcher.mock.calls[3][1].body)).toEqual({
            token: 'pwd-tok-9',
            currentPassword: 'SenhaAtual@2026',
            newPassword: 'NovaSenha@2026',
            confirmNewPassword: 'NovaSenha@2026'
        });
        app.destroy();
    });
});
