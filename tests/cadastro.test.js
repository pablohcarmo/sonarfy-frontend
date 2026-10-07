import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Fluxo Completo de Cadastro e Retificação de E-mail (cadastro.js)', () => {
    let htmlContent;
    let jsContent;
    let mockBackendResponse = null;

    beforeEach(() => {
        vi.useFakeTimers();

        // Carrega o HTML da página de cadastro
        const htmlPath = path.resolve(__dirname, '../pages/cadastro.html');
        htmlContent = fs.readFileSync(htmlPath, 'utf-8');

        // Extrai o conteúdo do body e remove scripts para evitar erros do HappyDOM
        const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*)<\/body>/i);
        const cleanBody = (bodyMatch ? bodyMatch[1] : htmlContent).replace(/<script[\s\S]*?<\/script>/gi, '');
        document.body.innerHTML = cleanBody;

        // Mock inteligente do fetch por URL
        mockBackendResponse = {
            register: (options) => {
                let submittedEmail = 'pablo@sonarfy.com';
                try {
                    submittedEmail = JSON.parse(options?.body || '{}').email || submittedEmail;
                } catch {}
                return {
                    ok: true,
                    status: 201,
                    json: async () => ({
                        message: 'User registered successfully',
                        registrationToken: 'mocked-jwt-registration-token',
                        email: submittedEmail,
                        expiresInSeconds: 1800
                    })
                };
            },
            updatePending: {
                ok: true,
                status: 200,
                text: async () => 'Pending email updated successfully!'
            },
            resend: {
                ok: true,
                status: 200,
                text: async () => 'Confirmation email resent successfully!'
            }
        };

        globalThis.API_BASE_URL = 'http://localhost:8081/api';
        globalThis.GEONAMES_USERNAME = 'testuser';

        globalThis.fetch = vi.fn(async (url, options) => {
            if (url.includes('geonames.org')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({ geonames: [{ countryName: 'Brazil' }] })
                };
            }
            if (url.includes('/auth/register')) {
                return typeof mockBackendResponse.register === 'function'
                    ? mockBackendResponse.register(options)
                    : mockBackendResponse.register;
            }
            if (url.includes('/auth/update-pending-email')) {
                return typeof mockBackendResponse.updatePending === 'function'
                    ? mockBackendResponse.updatePending(options)
                    : mockBackendResponse.updatePending;
            }
            if (url.includes('/auth/resend-activation-email')) {
                return typeof mockBackendResponse.resend === 'function'
                    ? mockBackendResponse.resend(options)
                    : mockBackendResponse.resend;
            }
            return { ok: true, status: 200, text: async () => 'OK' };
        });

        // Carrega e executa o script cadastro.js
        const jsPath = path.resolve(__dirname, '../js/cadastro.js');
        jsContent = fs.readFileSync(jsPath, 'utf-8');

        eval(jsContent);
        document.dispatchEvent(new Event('DOMContentLoaded'));
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    function fillValidForm(email = 'pablo@sonarfy.com') {
        document.getElementById('nameField').value = 'Pablo';
        document.getElementById('surnameField').value = 'Carmo';
        document.getElementById('handleField').value = 'pablo';
        document.getElementById('emailField').value = email;
        
        const passwordField = document.getElementById('passwordField');
        passwordField.value = 'Senha@123';
        passwordField.dispatchEvent(new Event('input'));
        
        document.getElementById('confirmPasswordField').value = 'Senha@123';
        document.getElementById('birthDateField').value = '2000-01-01';
        document.getElementById('cityField').value = 'São Paulo';
    }

    it('deve inicializar com o checklist de senha em estado inválido', () => {
        const reqLength = document.getElementById('req-length');
        const reqUppercase = document.getElementById('req-uppercase');
        const reqNumber = document.getElementById('req-number');
        const reqSpecial = document.getElementById('req-special');

        expect(reqLength.classList.contains('invalid')).toBe(true);
        expect(reqUppercase.classList.contains('invalid')).toBe(true);
        expect(reqNumber.classList.contains('invalid')).toBe(true);
        expect(reqSpecial.classList.contains('invalid')).toBe(true);
    });

    it('deve atualizar dinamicamente o checklist conforme a senha é digitada', () => {
        const passwordField = document.getElementById('passwordField');
        const reqLength = document.getElementById('req-length');
        const reqUppercase = document.getElementById('req-uppercase');
        const reqNumber = document.getElementById('req-number');
        const reqSpecial = document.getElementById('req-special');

        passwordField.value = 'senhafraca';
        passwordField.dispatchEvent(new Event('input'));

        expect(reqLength.classList.contains('valid')).toBe(true);
        expect(reqUppercase.classList.contains('invalid')).toBe(true);

        passwordField.value = 'SenhaForte@123';
        passwordField.dispatchEvent(new Event('input'));

        expect(reqLength.classList.contains('valid')).toBe(true);
        expect(reqUppercase.classList.contains('valid')).toBe(true);
        expect(reqNumber.classList.contains('valid')).toBe(true);
        expect(reqSpecial.classList.contains('valid')).toBe(true);
    });

    it('deve sanitizar o handle bloqueando arroba e espaços', () => {
        const handleField = document.getElementById('handleField');
        handleField.value = '@User_Name 123!';
        handleField.dispatchEvent(new Event('input'));

        expect(handleField.value).toBe('user_name123');
    });

    it('deve rejeitar submissão se as senhas não coincidirem', async () => {
        const registerForm = document.getElementById('registerForm');
        const errorMessage = document.getElementById('errorMessage');

        fillValidForm();
        document.getElementById('confirmPasswordField').value = 'OutraSenha@123';

        registerForm.dispatchEvent(new Event('submit', { cancelable: true }));

        expect(errorMessage.style.display).toBe('block');
        expect(errorMessage.innerText).toContain('senhas não coincidem');
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('deve processar cadastro com sucesso, exibir pendingSection e iniciar cooldown de 30s', async () => {
        fillValidForm('pablo@sonarfy.com');

        const registerForm = document.getElementById('registerForm');
        registerForm.dispatchEvent(new Event('submit', { cancelable: true }));

        await vi.waitFor(() => {
            expect(document.getElementById('pendingSection').style.display).toBe('block');
        });

        const registerSection = document.getElementById('registerSection');
        const pendingSection = document.getElementById('pendingSection');
        const pendingEmailDisplay = document.getElementById('pendingEmailDisplay');
        const pendingEmailBadge = document.getElementById('pendingEmailBadge');
        const btnResendPendingEmail = document.getElementById('btnResendPendingEmail');
        const btnEditEmailIcon = document.getElementById('btnEditEmailIcon');

        expect(registerSection.style.display).toBe('none');
        expect(pendingSection.style.display).toBe('block');
        expect(pendingEmailDisplay.innerText).toBe('pablo@sonarfy.com');

        // Estado do Cooldown de 30s
        expect(btnResendPendingEmail.disabled).toBe(true);
        expect(btnResendPendingEmail.innerHTML).toContain('30s');

        // Bloqueio do Badge e Ícone de edição
        expect(pendingEmailBadge.classList.contains('is-disabled')).toBe(true);
        expect(pendingEmailBadge.getAttribute('aria-disabled')).toBe('true');
        expect(pendingEmailBadge.title).toContain('30s');
        expect(btnEditEmailIcon.disabled).toBe(true);
    });

    it('não deve abrir o modal de edição de e-mail enquanto o cooldown de 30s estiver ativo', async () => {
        fillValidForm();
        document.getElementById('registerForm').dispatchEvent(new Event('submit', { cancelable: true }));

        await vi.waitFor(() => {
            expect(document.getElementById('pendingSection').style.display).toBe('block');
        });

        const pendingEmailBadge = document.getElementById('pendingEmailBadge');
        const editEmailModal = document.getElementById('editEmailModal');
        const pendingErrorAlert = document.getElementById('pendingErrorAlert');

        // Tenta clicar no badge durante o cooldown
        pendingEmailBadge.dispatchEvent(new Event('click'));

        // Modal não deve abrir e alerta amigável deve ser exibido
        expect(editEmailModal.style.display).toBe('none');
        expect(pendingErrorAlert.style.display).toBe('block');
        expect(pendingErrorAlert.innerText).toContain('Aguarde');
    });

    it('deve desbloquear o badge e botão após 30 segundos e permitir abrir o modal', async () => {
        fillValidForm('teste@sonarfy.com');
        document.getElementById('registerForm').dispatchEvent(new Event('submit', { cancelable: true }));

        await vi.waitFor(() => {
            expect(document.getElementById('pendingSection').style.display).toBe('block');
        });

        const pendingEmailBadge = document.getElementById('pendingEmailBadge');
        const btnResendPendingEmail = document.getElementById('btnResendPendingEmail');
        const editEmailModal = document.getElementById('editEmailModal');
        const newPendingEmailField = document.getElementById('newPendingEmailField');

        // Avança 30 segundos no tempo simulado
        vi.advanceTimersByTime(30000);

        // Elementos devem estar destravados
        expect(btnResendPendingEmail.disabled).toBe(false);
        expect(btnResendPendingEmail.innerHTML).toContain('Reenviar e-mail');
        expect(pendingEmailBadge.classList.contains('is-disabled')).toBe(false);
        expect(pendingEmailBadge.getAttribute('aria-disabled')).toBeNull();

        // Clica no badge agora liberado
        pendingEmailBadge.dispatchEvent(new Event('click'));

        // Modal deve abrir preenchido com o e-mail atual
        expect(editEmailModal.style.display).toBe('flex');
        expect(newPendingEmailField.value).toBe('teste@sonarfy.com');
    });

    it('deve enviar PATCH com Bearer Token e novo e-mail, e reiniciar cooldown de 30s após sucesso', async () => {
        fillValidForm('errado@sonarfy.com');
        document.getElementById('registerForm').dispatchEvent(new Event('submit', { cancelable: true }));

        await vi.waitFor(() => {
            expect(document.getElementById('pendingSection').style.display).toBe('block');
        });

        // Avança 30 segundos para liberar a edição
        vi.advanceTimersByTime(30000);

        const pendingEmailBadge = document.getElementById('pendingEmailBadge');
        pendingEmailBadge.dispatchEvent(new Event('click'));

        const newPendingEmailField = document.getElementById('newPendingEmailField');
        newPendingEmailField.value = 'correto@sonarfy.com';

        const editEmailForm = document.getElementById('editEmailForm');
        editEmailForm.dispatchEvent(new Event('submit', { cancelable: true }));

        await vi.waitFor(() => {
            expect(globalThis.fetch).toHaveBeenCalledWith(
                'http://localhost:8081/api/auth/update-pending-email',
                expect.objectContaining({
                    method: 'PATCH',
                    headers: expect.objectContaining({
                        'Authorization': 'Bearer mocked-jwt-registration-token',
                        'Content-Type': 'application/json'
                    }),
                    body: JSON.stringify({
                        handle: 'pablo',
                        newEmail: 'correto@sonarfy.com'
                    })
                })
            );
        });

        // Modal fecha e e-mail no badge é atualizado
        await vi.waitFor(() => {
            expect(document.getElementById('editEmailModal').style.display).toBe('none');
        });
        expect(document.getElementById('pendingEmailDisplay').innerText).toBe('correto@sonarfy.com');

        // Cooldown reiniciado para 30 segundos!
        const btnResendPendingEmail = document.getElementById('btnResendPendingEmail');
        expect(btnResendPendingEmail.disabled).toBe(true);
        expect(btnResendPendingEmail.innerHTML).toContain('30s');
        expect(pendingEmailBadge.classList.contains('is-disabled')).toBe(true);
        expect(pendingEmailBadge.title).toContain('30s');
    });

    it('deve exibir mensagem apropriada quando backend responder 429 Too Many Requests', async () => {
        fillValidForm('teste@sonarfy.com');
        document.getElementById('registerForm').dispatchEvent(new Event('submit', { cancelable: true }));

        await vi.waitFor(() => {
            expect(document.getElementById('pendingSection').style.display).toBe('block');
        });

        vi.advanceTimersByTime(30000);
        document.getElementById('pendingEmailBadge').dispatchEvent(new Event('click'));

        // Mock 429
        mockBackendResponse.updatePending = {
            ok: false,
            status: 429,
            text: async () => 'Please wait 25 seconds before requesting another email.'
        };

        document.getElementById('newPendingEmailField').value = 'outro@sonarfy.com';
        document.getElementById('editEmailForm').dispatchEvent(new Event('submit', { cancelable: true }));

        await vi.waitFor(() => {
            const errorAlert = document.getElementById('editEmailModalError');
            expect(errorAlert.style.display).toBe('block');
            expect(errorAlert.innerText).toContain('30 segundos');
        });
    });

    it('deve exibir mensagem apropriada quando backend responder 409 Conflict (e-mail em uso)', async () => {
        fillValidForm('teste@sonarfy.com');
        document.getElementById('registerForm').dispatchEvent(new Event('submit', { cancelable: true }));

        await vi.waitFor(() => {
            expect(document.getElementById('pendingSection').style.display).toBe('block');
        });

        vi.advanceTimersByTime(30000);
        document.getElementById('pendingEmailBadge').dispatchEvent(new Event('click'));

        // Mock 409
        mockBackendResponse.updatePending = {
            ok: false,
            status: 409,
            text: async () => 'E-mail is already in use by another account.'
        };

        document.getElementById('newPendingEmailField').value = 'jaexiste@sonarfy.com';
        document.getElementById('editEmailForm').dispatchEvent(new Event('submit', { cancelable: true }));

        await vi.waitFor(() => {
            const errorAlert = document.getElementById('editEmailModalError');
            expect(errorAlert.style.display).toBe('block');
            expect(errorAlert.innerText).toContain('já está em uso');
        });
    });
});
