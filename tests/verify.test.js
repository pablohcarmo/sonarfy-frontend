import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Verify: confirmação e reenvio', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../pages/verify.html'), 'utf8');
    const script = fs.readFileSync(path.resolve(__dirname, '../js/verify.js'), 'utf8');
    const element = id => document.getElementById(id);
    const response = (status = 200, text = '') => ({
        ok: status >= 200 && status < 300, status, text: async () => text
    });
    const start = (query = '') => {
        delete window.location;
        window.location = new URL('http://localhost/pages/verify.html' + query);
        eval(script);
        document.dispatchEvent(new Event('DOMContentLoaded'));
    };
    const submit = (email = 'pessoa@example.com') => {
        element('verifyEmailInput').value = email;
        element('verifyResendForm').dispatchEvent(new Event('submit', { cancelable: true }));
    };
    const settled = async () => {
        await vi.waitFor(() => expect(element('verifyResendForm').getAttribute('aria-busy')).toBe('false'));
    };

    beforeEach(() => {
        vi.useFakeTimers();
        document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)[1]
            .replace(/<script[\s\S]*?<\/script>/gi, '');
        globalThis.API_BASE_URL = 'http://localhost:8081/api';
        globalThis.fetch = vi.fn();
    });
    afterEach(() => {
        vi.clearAllTimers();
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('confirma a conta e codifica tokens sem permitir parâmetros extras', async () => {
        fetch.mockResolvedValue(response());
        start('?token=a%26email%3Db%2B%23');
        await vi.waitFor(() => expect(element('success-state').hidden).toBe(false));
        expect(element('loading-state').hidden).toBe(true);
        expect(element('error-state').hidden).toBe(true);
        expect(element('main-content').getAttribute('aria-busy')).toBe('false');
        expect(fetch).toHaveBeenCalledWith(
            API_BASE_URL + '/auth/verify?token=a%26email%3Db%2B%23',
            expect.objectContaining({ method: 'GET' })
        );
    });

    it('mostra link ausente sem chamar a API e preenche o e-mail', () => {
        start('?email=pessoa%40example.com&token=%20');
        expect(fetch).not.toHaveBeenCalled();
        expect(element('error-state').hidden).toBe(false);
        expect(element('error-title').textContent).toBe('Link de Confirmação Ausente');
        expect(element('verifyEmailInput').value).toBe('pessoa@example.com');
    });

    it('mostra link expirado em PT-BR sem inserir texto/HTML recebido da API', async () => {
        fetch.mockResolvedValue(response(400, '{"message":"<img src=x onerror=alert(1)> Expired"}'));
        start('?token=expirado');
        await vi.waitFor(() => expect(element('error-state').hidden).toBe(false));
        expect(element('error-title').textContent).toBe('Link Expirado ou Inválido');
        expect(element('error-message-text').textContent).toContain('já expirou');
        expect(element('error-message-text').querySelector('img')).toBeNull();
    });

    it('distingue indisponibilidade do servidor de token inválido', async () => {
        fetch.mockResolvedValue(response(503));
        start('?token=valido');
        await vi.waitFor(() => expect(element('error-title').textContent).toBe('Verificação indisponível'));
    });

    it('permite solicitar outro link após falha de conexão', async () => {
        fetch.mockRejectedValueOnce(new Error('offline'));
        start('?token=valido');
        await vi.waitFor(() => expect(element('error-title').textContent).toBe('Erro na Verificação'));
        expect(element('btnVerifyResend').disabled).toBe(false);
    });

    it.each(['', 'invalido', 'a@b', 'a'.repeat(145) + '@example.com'])('rejeita e-mail inválido: %s', email => {
        start();
        submit(email);
        expect(fetch).not.toHaveBeenCalled();
        expect(element('verifyResendError').hidden).toBe(false);
        expect(element('verifyEmailInput').getAttribute('aria-invalid')).toBe('true');
        expect(document.activeElement).toBe(element('verifyEmailInput'));
    });

    it('normaliza e-mail, impede envios concorrentes e libera após 60 segundos', async () => {
        start();
        let finish;
        fetch.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
        submit('  pessoa+teste@example.com  ');
        submit('pessoa+teste@example.com');
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(fetch.mock.calls[0][0]).toContain('email=pessoa%2Bteste%40example.com');
        finish(response());
        await settled();
        expect(element('verifyResendSuccess').textContent).toContain('reenviado com sucesso');
        expect(element('btnVerifyResend').textContent).toContain('Aguarde (60s)');
        submit();
        expect(fetch).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(60000);
        expect(element('btnVerifyResend').disabled).toBe(false);
        expect(element('btnVerifyResend').textContent).toBe('Reenviar Link de Confirmação');
    });

    it('oferece login para conta já ativada sem iniciar espera', async () => {
        start();
        fetch.mockResolvedValue(response(200, '{"message":"User already verified"}'));
        submit();
        await settled();
        expect(element('verifyResendSuccess').textContent).toContain('já foi ativada');
        expect(element('verifyResendSuccess').querySelector('a').getAttribute('href')).toBe('login.html');
        expect(element('btnVerifyResend').disabled).toBe(false);
    });

    it.each([
        [404, 'not found', 'Não encontramos'],
        [200, 'invalid e-mail', 'E-mail inválido'],
        [500, 'Internal server error', 'Não foi possível']
    ])('trata resposta de reenvio %s e permite tentar novamente', async (status, message, expected) => {
        start();
        fetch.mockResolvedValue(response(status, message));
        submit();
        await settled();
        expect(element('verifyResendError').textContent).toContain(expected);
        expect(element('btnVerifyResend').disabled).toBe(false);
    });

    it('respeita bloqueio por excesso de tentativas', async () => {
        start();
        fetch.mockResolvedValue(response(429));
        submit();
        await settled();
        expect(element('verifyResendError').textContent).toContain('Muitas tentativas');
        expect(element('btnVerifyResend').disabled).toBe(true);
        await vi.advanceTimersByTimeAsync(60000);
        expect(element('btnVerifyResend').disabled).toBe(false);
    });

    it('restaura reenvio após erro de rede', async () => {
        start();
        fetch.mockRejectedValueOnce(new Error('offline'));
        submit();
        await settled();
        expect(element('verifyResendError').textContent).toContain('Erro de conexão');
        expect(element('btnVerifyResend').disabled).toBe(false);
    });

    it('interrompe requisição sem resposta e restaura reenvio', async () => {
        start();
        fetch.mockImplementation((url, { signal }) => new Promise((resolve, reject) => {
            signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true });
        }));
        submit();
        await vi.advanceTimersByTimeAsync(15000);
        await settled();
        expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
        expect(element('btnVerifyResend').disabled).toBe(false);
        expect(element('verifyResendError').hidden).toBe(false);
    });
});
