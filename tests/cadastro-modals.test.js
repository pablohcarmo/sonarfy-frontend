import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Modais de Reenvio e Retificação de E-mail (cadastro.js)', () => {
    let htmlContent;
    let jsContent;
    let mockBackendResponse = null;

    beforeEach(() => {
        vi.useFakeTimers();

        const htmlPath = path.resolve(__dirname, '../pages/register.html');
        htmlContent = fs.readFileSync(htmlPath, 'utf-8');

        const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*)<\/body>/i);
        const cleanBody = (bodyMatch ? bodyMatch[1] : htmlContent).replace(/<script[\s\S]*?<\/script>/gi, '');
        document.body.innerHTML = cleanBody;

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
                if (typeof mockBackendResponse.register === 'function') {
                    return mockBackendResponse.register(options);
                }
                return mockBackendResponse.register;
            }
            if (url.includes('/auth/update-pending-email')) {
                if (typeof mockBackendResponse.updatePending === 'function') {
                    return mockBackendResponse.updatePending(options);
                }
                return mockBackendResponse.updatePending;
            }
            if (url.includes('/auth/resend-activation-email')) {
                if (typeof mockBackendResponse.resend === 'function') {
                    return mockBackendResponse.resend(options);
                }
                return mockBackendResponse.resend;
            }
            return {
                ok: true,
                status: 200,
                json: async () => ({})
            };
        });

        const jsPath = path.resolve(__dirname, '../js/cadastro.js');
        jsContent = fs.readFileSync(jsPath, 'utf-8');

        // Initialize this script once per fixture; do not retain ready listeners across tests.
        document.body.removeAttribute('data-registration-step');
        const addListener = document.addEventListener.bind(document);
        let ready;
        vi.spyOn(document, 'addEventListener').mockImplementation((type, listener, options) => {
            if (type === 'DOMContentLoaded') ready = listener;
            else addListener(type, listener, options);
        });
        eval(jsContent);
        ready();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    describe('Reenvio na confirmação de cadastro', () => {
        async function openConfirmation() {
            const values = { nameField: 'Pablo', surnameField: 'Carmo', handleField: 'pablo', emailField: 'teste@sonarfy.com', passwordField: 'Senha@123', confirmPasswordField: 'Senha@123', birthDateField: '2000-01-01', cityField: 'São Paulo' };
            for (const [id, value] of Object.entries(values)) {
                const input = document.getElementById(id);
                input.value = value;
                input.dispatchEvent(new Event('input'));
            }
            document.getElementById('registerForm').dispatchEvent(new Event('submit', { cancelable: true }));
            await vi.waitFor(() => expect(document.getElementById('pendingSection').style.display).toBe('block'));
            vi.advanceTimersByTime(30000);
        }

        it('exibe a confirmação como página e retorna ao formulário com foco', async () => {
            await openConfirmation();
            expect(document.body.dataset.registrationStep).toBe('confirmation');
            document.getElementById('btnBackToForm').click();
            expect(document.body.dataset.registrationStep).toBeUndefined();
            expect(document.activeElement.id).toBe('nameField');
        });

        it('reenvia o e-mail e inicia o cooldown de 30 segundos', async () => {
            await openConfirmation();
            document.getElementById('btnResendPendingEmail').click();
            await vi.waitFor(() => expect(document.getElementById('pendingSuccessAlert').style.display).toBe('block'));
            expect(document.getElementById('btnResendPendingEmail').textContent).toContain('30s');
        });

        it('trata conta não encontrada e permite tentar novamente', async () => {
            await openConfirmation();
            mockBackendResponse.resend = { ok: false, status: 404, text: async () => 'User not found' };
            document.getElementById('btnResendPendingEmail').click();
            await vi.waitFor(() => expect(document.getElementById('pendingErrorAlert').innerText).toContain('Não encontramos'));
            expect(document.getElementById('btnResendPendingEmail').disabled).toBe(false);
        });

        it('trata falha de rede sem deixar o botão bloqueado', async () => {
            await openConfirmation();
            mockBackendResponse.resend = () => Promise.reject(new Error('offline'));
            document.getElementById('btnResendPendingEmail').click();
            await vi.waitFor(() => expect(document.getElementById('pendingErrorAlert').innerText).toContain('Erro de conexão'));
            expect(document.getElementById('btnResendPendingEmail').hasAttribute('aria-busy')).toBe(false);
            expect(document.getElementById('btnResendPendingEmail').disabled).toBe(false);
        });

        it('impede reenvios duplicados enquanto a requisição está em andamento', async () => {
            await openConfirmation();
            let resolve;
            mockBackendResponse.resend = () => new Promise(done => { resolve = done; });
            const button = document.getElementById('btnResendPendingEmail');
            button.click();
            button.dispatchEvent(new Event('click'));
            const requests = fetch.mock.calls.filter(([url]) => url.includes('resend-activation-email'));
            expect(requests).toHaveLength(1);
            resolve({ ok: true, text: async () => 'sent' });
            await vi.waitFor(() => expect(button.textContent).toContain('30s'));
        });
    });

    describe('Modal de Retificação de E-mail (#editEmailModal) e Seção Pendente', () => {
        it('deve fechar o editEmailModal ao clicar no botão fechar ou pressionar Escape', () => {
            const editEmailModal = document.getElementById('editEmailModal');
            // Simula modal aberto
            editEmailModal.style.display = 'flex';

            document.getElementById('closeEditEmailModalBtn').dispatchEvent(new Event('click'));
            expect(editEmailModal.style.display).toBe('none');

            // Abre e fecha com Escape
            editEmailModal.style.display = 'flex';
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
            expect(editEmailModal.style.display).toBe('none');
        });

        it('deve validar novo e-mail obrigatório e formato no editEmailForm', () => {
            const editEmailForm = document.getElementById('editEmailForm');
            const newPendingEmailField = document.getElementById('newPendingEmailField');
            const editEmailModalError = document.getElementById('editEmailModalError');

            newPendingEmailField.value = '';
            editEmailForm.dispatchEvent(new Event('submit', { cancelable: true }));

            expect(editEmailModalError.style.display).toBe('block');
            expect(editEmailModalError.innerText).toContain('novo e-mail é obrigatório');

            newPendingEmailField.value = 'formato_errado@';
            editEmailForm.dispatchEvent(new Event('submit', { cancelable: true }));

            expect(editEmailModalError.style.display).toBe('block');
            expect(editEmailModalError.innerText).toContain('e-mail válido');
        });

        it('deve rejeitar alteração se novo e-mail for idêntico ao atual', async () => {
            document.getElementById('nameField').value = 'Pablo';
            document.getElementById('surnameField').value = 'Carmo';
            document.getElementById('handleField').value = 'pablo';
            document.getElementById('emailField').value = 'mesmo@sonarfy.com';
            const passwordField = document.getElementById('passwordField');
            passwordField.value = 'Senha@123';
            passwordField.dispatchEvent(new Event('input'));
            document.getElementById('confirmPasswordField').value = 'Senha@123';
            document.getElementById('birthDateField').value = '2000-01-01';
            document.getElementById('cityField').value = 'São Paulo';

            document.getElementById('registerForm').dispatchEvent(new Event('submit', { cancelable: true }));

            await vi.waitFor(() => {
                expect(document.getElementById('pendingSection').style.display).toBe('block');
            });

            vi.advanceTimersByTime(30000);
            document.getElementById('pendingEmailBadge').dispatchEvent(new Event('click'));

            // Tenta submeter o mesmo e-mail
            document.getElementById('newPendingEmailField').value = 'mesmo@sonarfy.com';
            document.getElementById('editEmailForm').dispatchEvent(new Event('submit', { cancelable: true }));

            const editEmailModalError = document.getElementById('editEmailModalError');
            expect(editEmailModalError.style.display).toBe('block');
            expect(editEmailModalError.innerText).toContain('idêntico ao e-mail atual');
        });

        it('deve tratar 401 Unauthorized informando expiração de sessão', async () => {
            document.getElementById('nameField').value = 'Pablo';
            document.getElementById('surnameField').value = 'Carmo';
            document.getElementById('handleField').value = 'pablo';
            document.getElementById('emailField').value = 'teste@sonarfy.com';
            const passwordField = document.getElementById('passwordField');
            passwordField.value = 'Senha@123';
            passwordField.dispatchEvent(new Event('input'));
            document.getElementById('confirmPasswordField').value = 'Senha@123';
            document.getElementById('birthDateField').value = '2000-01-01';
            document.getElementById('cityField').value = 'São Paulo';

            document.getElementById('registerForm').dispatchEvent(new Event('submit', { cancelable: true }));

            await vi.waitFor(() => {
                expect(document.getElementById('pendingSection').style.display).toBe('block');
            });

            vi.advanceTimersByTime(30000);
            document.getElementById('pendingEmailBadge').dispatchEvent(new Event('click'));

            mockBackendResponse.updatePending = {
                ok: false,
                status: 401,
                text: async () => 'Missing or invalid Authorization token.'
            };

            document.getElementById('newPendingEmailField').value = 'novo@sonarfy.com';
            document.getElementById('editEmailForm').dispatchEvent(new Event('submit', { cancelable: true }));

            await vi.waitFor(() => {
                const editEmailModalError = document.getElementById('editEmailModalError');
                expect(editEmailModalError.style.display).toBe('block');
                expect(editEmailModalError.innerText).toContain('sessão temporária de cadastro expirou');
            });
        });

        it('deve tratar caso de conta já ativada ao tentar reenviar pelo pendingSection', async () => {
            document.getElementById('nameField').value = 'Pablo';
            document.getElementById('surnameField').value = 'Carmo';
            document.getElementById('handleField').value = 'pablo';
            document.getElementById('emailField').value = 'ativo@sonarfy.com';
            const passwordField = document.getElementById('passwordField');
            passwordField.value = 'Senha@123';
            passwordField.dispatchEvent(new Event('input'));
            document.getElementById('confirmPasswordField').value = 'Senha@123';
            document.getElementById('birthDateField').value = '2000-01-01';
            document.getElementById('cityField').value = 'São Paulo';

            document.getElementById('registerForm').dispatchEvent(new Event('submit', { cancelable: true }));

            await vi.waitFor(() => {
                expect(document.getElementById('pendingSection').style.display).toBe('block');
            });

            vi.advanceTimersByTime(30000);

            // Mock reenvio retornando que a conta já foi ativada
            mockBackendResponse.resend = {
                ok: true,
                status: 200,
                text: async () => 'User already verified. You can log in.'
            };

            document.getElementById('btnResendPendingEmail').dispatchEvent(new Event('click'));

            await vi.waitFor(() => {
                const successAlert = document.getElementById('pendingSuccessAlert');
                expect(successAlert.style.display).toBe('block');
                expect(successAlert.innerHTML).toContain('Esta conta já foi ativada');
            });
        });
    });
});
