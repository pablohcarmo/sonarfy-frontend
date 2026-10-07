import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Fluxo de Verificação de E-mail e Reenvio (verify.js)', () => {
    let htmlContent;
    let jsContent;

    beforeEach(() => {
        vi.useFakeTimers();

        const htmlPath = path.resolve(__dirname, '../pages/verify.html');
        htmlContent = fs.readFileSync(htmlPath, 'utf-8');

        const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*)<\/body>/i);
        const cleanBody = (bodyMatch ? bodyMatch[1] : htmlContent).replace(/<script[\s\S]*?<\/script>/gi, '');
        document.body.innerHTML = cleanBody;

        globalThis.API_BASE_URL = 'http://localhost:8081/api';
        globalThis.fetch = vi.fn();

        const jsPath = path.resolve(__dirname, '../js/verify.js');
        jsContent = fs.readFileSync(jsPath, 'utf-8');
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('deve exibir tela de sucesso quando o token de ativação for válido', async () => {
        delete window.location;
        window.location = new URL('http://localhost:3000/pages/verify.html?token=token-valido');

        globalThis.fetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            text: async () => 'E-mail verified successfully! You can now log in.'
        });

        eval(jsContent);
        document.dispatchEvent(new Event('DOMContentLoaded'));

        await vi.waitFor(() => {
            expect(document.getElementById('loading-state').style.display).toBe('none');
            expect(document.getElementById('success-state').style.display).toBe('block');
            expect(document.getElementById('error-state').style.display).toBe('none');
        });

        expect(globalThis.fetch).toHaveBeenCalledWith(
            'http://localhost:8081/api/auth/verify?token=token-valido',
            expect.objectContaining({ method: 'GET' })
        );
    });

    it('deve exibir tela de erro com caixa de reenvio quando token for expirado ou inválido', async () => {
        delete window.location;
        window.location = new URL('http://localhost:3000/pages/verify.html?token=token-expirado&email=pablo@sonarfy.com');

        globalThis.fetch.mockResolvedValueOnce({
            ok: false,
            status: 400,
            text: async () => 'Invalid or expired token. Please, request a new confirmation email.'
        });

        eval(jsContent);
        document.dispatchEvent(new Event('DOMContentLoaded'));

        await vi.waitFor(() => {
            expect(document.getElementById('loading-state').style.display).toBe('none');
            expect(document.getElementById('success-state').style.display).toBe('none');
            expect(document.getElementById('error-state').style.display).toBe('block');
        });

        const verifyEmailInput = document.getElementById('verifyEmailInput');
        expect(verifyEmailInput.value).toBe('pablo@sonarfy.com');
    });

    it('deve reenviar link de ativação com sucesso e iniciar cooldown regressivo', async () => {
        delete window.location;
        window.location = new URL('http://localhost:3000/pages/verify.html');

        eval(jsContent);
        document.dispatchEvent(new Event('DOMContentLoaded'));

        globalThis.fetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            text: async () => 'Confirmation email resent successfully!'
        });

        const verifyEmailInput = document.getElementById('verifyEmailInput');
        verifyEmailInput.value = 'novo@sonarfy.com';

        const btnVerifyResend = document.getElementById('btnVerifyResend');
        const verifyResendForm = document.getElementById('verifyResendForm');

        verifyResendForm.dispatchEvent(new Event('submit', { cancelable: true }));

        await vi.waitFor(() => {
            expect(globalThis.fetch).toHaveBeenCalledWith(
                'http://localhost:8081/api/auth/resend-activation-email?email=novo%40sonarfy.com',
                expect.objectContaining({ method: 'POST' })
            );
        });

        const successAlert = document.getElementById('verifyResendSuccess');
        await vi.waitFor(() => {
            expect(successAlert.style.display).toBe('block');
        });
        expect(successAlert.innerText).toContain('reenviado com sucesso');

        // Botão entra em cooldown de espera
        expect(btnVerifyResend.disabled).toBe(true);
        expect(btnVerifyResend.innerHTML).toContain('Aguarde');
    });

    it('deve informar quando o e-mail solicitado já tiver sido verificado', async () => {
        delete window.location;
        window.location = new URL('http://localhost:3000/pages/verify.html');

        eval(jsContent);
        document.dispatchEvent(new Event('DOMContentLoaded'));

        globalThis.fetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            text: async () => 'User already verified. You can log in.'
        });

        const verifyEmailInput = document.getElementById('verifyEmailInput');
        verifyEmailInput.value = 'ativado@sonarfy.com';

        document.getElementById('verifyResendForm').dispatchEvent(new Event('submit', { cancelable: true }));

        const successAlert = document.getElementById('verifyResendSuccess');
        await vi.waitFor(() => {
            expect(successAlert.style.display).toBe('block');
            expect(successAlert.innerHTML).toContain('já foi ativada');
        });
    });
});
