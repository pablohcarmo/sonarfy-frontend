import { getPostLoginDestination } from '../js/spotify-sync-state.js';
import { clearAccessToken, resolveApiBaseUrl } from '../js/auth-http.js';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Fluxo Completo da Tela de Login (login.js)', () => {
    let htmlContent;
    let jsContent;
    let backendHandler = null;

    beforeEach(() => {
        // Define URL padrão antes de carregar o DOM
        if (window.happyDOM) {
            window.happyDOM.setURL('http://localhost:3000/pages/login.html');
        }

        // Carrega o HTML da página de login
        const htmlPath = path.resolve(__dirname, '../pages/login.html');
        htmlContent = fs.readFileSync(htmlPath, 'utf-8');

        // Extrai o conteúdo do body sem os scripts
        const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*)<\/body>/i);
        const cleanBody = (bodyMatch ? bodyMatch[1] : htmlContent).replace(/<script[\s\S]*?<\/script>/gi, '');
        document.body.innerHTML = cleanBody;

        globalThis.API_BASE_URL = 'http://localhost:8080/api';
        globalThis.fetch = vi.fn(async (url, options) => {
            if (typeof backendHandler === 'function') {
                return backendHandler(url, options);
            }
            return {
                ok: true,
                status: 200,
                text: async () => JSON.stringify({ token: 'mocked-jwt-token' })
            };
        });

        // Limpa armazenamentos locais
        localStorage.clear();
        sessionStorage.clear();

        // Carrega o script
        const jsPath = path.resolve(__dirname, '../js/login.js');
        jsContent = fs.readFileSync(jsPath, 'utf-8');
    });

    afterEach(() => {
        backendHandler = null;
        vi.restoreAllMocks();
    });

    function loadScript() {
        const runnable = jsContent.replace(/^import .*;\r?\n/gm, '');
        new Function('getPostLoginDestination', 'clearAccessToken', 'resolveApiBaseUrl', runnable)(
            getPostLoginDestination,
            clearAccessToken,
            resolveApiBaseUrl
        );
        document.dispatchEvent(new Event('DOMContentLoaded'));
    }

    it('deve alternar a visibilidade da senha ao clicar no botão de olho', () => {
        loadScript();

        const passwordField = document.getElementById('passwordField');
        const btnTogglePassword = document.getElementById('btnTogglePassword');

        expect(passwordField.type).toBe('password');
        expect(btnTogglePassword.getAttribute('aria-pressed')).toBe('false');

        // Primeiro clique: revela a senha
        btnTogglePassword.click();
        expect(passwordField.type).toBe('text');
        expect(btnTogglePassword.getAttribute('aria-pressed')).toBe('true');
        expect(btnTogglePassword.getAttribute('aria-label')).toBe('Ocultar senha');

        // Segundo clique: oculta a senha
        btnTogglePassword.click();
        expect(passwordField.type).toBe('password');
        expect(btnTogglePassword.getAttribute('aria-pressed')).toBe('false');
        expect(btnTogglePassword.getAttribute('aria-label')).toBe('Mostrar senha');
    });

    it('deve exibir mensagem de sucesso quando a URL contiver ?verified=true', () => {
        if (window.happyDOM) {
            window.happyDOM.setURL('http://localhost:3000/pages/login.html?verified=true');
        }
        loadScript();

        const successMessage = document.getElementById('successMessage');
        expect(successMessage.style.display).toBe('block');
        expect(successMessage.innerHTML).toContain('E-mail confirmado com sucesso');
    });

    it('deve exibir mensagem de sucesso quando a URL contiver ?registered=true', () => {
        if (window.happyDOM) {
            window.happyDOM.setURL('http://localhost:3000/pages/login.html?registered=true');
        }
        loadScript();

        const successMessage = document.getElementById('successMessage');
        expect(successMessage.style.display).toBe('block');
        expect(successMessage.innerHTML).toContain('Cadastro realizado com sucesso');
    });

    it('deve restaurar o login salvo quando a opção "Lembrar meu usuário" tiver sido utilizada', () => {
        localStorage.setItem('sonarfy_remember_login', 'usuario_salvo');
        loadScript();

        const loginField = document.getElementById('loginField');
        const rememberMeCheckbox = document.getElementById('rememberMeCheckbox');

        expect(loginField.value).toBe('usuario_salvo');
        expect(rememberMeCheckbox.checked).toBe(true);
    });

    it('deve realizar login com sucesso, salvar JWT no localStorage e redirecionar para spotify-sync.html', async () => {
        loadScript();

        const loginField = document.getElementById('loginField');
        const passwordField = document.getElementById('passwordField');
        const loginForm = document.getElementById('loginForm');
        const rememberMeCheckbox = document.getElementById('rememberMeCheckbox');

        loginField.value = '  pablo@sonarfy.com  '; // com espaços para validar trim
        passwordField.value = 'MinhaSenha@123';
        rememberMeCheckbox.checked = true;

        backendHandler = () => ({
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ accessToken: 'mocked-jwt-token-xyz', tokenType: 'Bearer', expiresInSeconds: 900 })
        });

        loginForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

        await vi.waitFor(() => {
            expect(localStorage.getItem('sonarfy_token')).toBe('mocked-jwt-token-xyz');
            expect(localStorage.getItem('sonarfy_remember_login')).toBe('pablo@sonarfy.com');
            expect(window.location.href).toContain('spotify-sync.html');
        });

        expect(globalThis.fetch).toHaveBeenCalledWith(
            'http://localhost:8080/api/auth/login',
            expect.objectContaining({
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Sonarfy-CSRF': '1'
                },
                body: JSON.stringify({
                    login: 'pablo@sonarfy.com',
                    password: 'MinhaSenha@123',
                    rememberMe: true
                })
            })
        );
    });

    // Valida o fallback de porta 8080 e rememberMe=false quando API_BASE_URL não está definido.
    it('deve usar fallback http://localhost:8080/api e enviar rememberMe false quando desmarcado', async () => {
        delete globalThis.API_BASE_URL;
        loadScript();

        document.getElementById('loginField').value = 'pablo';
        document.getElementById('passwordField').value = 'MinhaSenha@123';
        document.getElementById('rememberMeCheckbox').checked = false;

        document.getElementById('loginForm').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

        await vi.waitFor(() => {
            expect(globalThis.fetch).toHaveBeenCalledWith(
                'http://localhost:8080/api/auth/login',
                expect.objectContaining({
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Sonarfy-CSRF': '1'
                    },
                    body: JSON.stringify({
                        login: 'pablo',
                        password: 'MinhaSenha@123',
                        rememberMe: false
                    })
                })
            );
        });
    });

    it('deve priorizar o onboarding mesmo com parâmetro redirect local', async () => {
        if (window.happyDOM) {
            window.happyDOM.setURL('http://localhost:3000/pages/login.html?redirect=account.html');
        }
        loadScript();

        document.getElementById('loginField').value = 'pablo';
        document.getElementById('passwordField').value = '12345678';

        backendHandler = () => ({
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ token: 'mocked-token' })
        });

        document.getElementById('loginForm').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

        await vi.waitFor(() => {
            expect(window.location.href).toContain('spotify-sync.html');
        });
    });

    it('deve exibir mensagem de erro de credenciais inválidas para status 401', async () => {
        loadScript();

        document.getElementById('loginField').value = 'usuario_invalido';
        document.getElementById('passwordField').value = 'senhaerrada';

        backendHandler = () => ({
            ok: false,
            status: 401,
            text: async () => JSON.stringify({ message: 'Bad credentials' })
        });

        const btnSubmitLogin = document.getElementById('btnSubmitLogin');
        document.getElementById('loginForm').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

        await vi.waitFor(() => {
            const errorMessage = document.getElementById('errorMessage');
            expect(errorMessage.style.display).toBe('block');
            expect(errorMessage.innerHTML).toContain('E-mail, usuário ou senha inválidos.');
            expect(btnSubmitLogin.disabled).toBe(false);
        });
    });

    // Diferencia bloqueio CSRF/origem (403 sem indicação de conta inativa) do aviso de ativação.
    it('deve exibir erro de verificação de segurança para status 403 sem indicação de conta não ativada', async () => {
        loadScript();

        document.getElementById('loginField').value = 'pablo@sonarfy.com';
        document.getElementById('passwordField').value = 'Senha@123';

        backendHandler = () => ({
            ok: false,
            status: 403,
            text: async () => ''
        });

        document.getElementById('loginForm').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

        await vi.waitFor(() => {
            const errorMessage = document.getElementById('errorMessage');
            expect(errorMessage.style.display).toBe('block');
            expect(errorMessage.textContent).toContain('bloqueada pela verificação de segurança');
            expect(errorMessage.innerHTML).not.toContain('verify.html');
        });
    });

    it('deve exibir link de reenvio de confirmação para conta não ativada (status 403)', async () => {
        loadScript();

        document.getElementById('loginField').value = 'usuario@pendente.com';
        document.getElementById('passwordField').value = 'Senha@123';

        backendHandler = () => ({
            ok: false,
            status: 403,
            text: async () => JSON.stringify({ message: 'User account is not verified' })
        });

        document.getElementById('loginForm').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

        await vi.waitFor(() => {
            const errorMessage = document.getElementById('errorMessage');
            expect(errorMessage.style.display).toBe('block');
            expect(errorMessage.innerHTML).toContain('Sua conta ainda não foi ativada');
            expect(errorMessage.innerHTML).toContain('verify.html');
        });
    });

    it('deve exibir mensagem de limite de tentativas para status 429 Too Many Requests', async () => {
        loadScript();

        document.getElementById('loginField').value = 'usuario@sonarfy.com';
        document.getElementById('passwordField').value = 'Senha@123';

        backendHandler = () => ({
            ok: false,
            status: 429,
            text: async () => JSON.stringify({ message: 'Too many requests' })
        });

        document.getElementById('loginForm').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

        await vi.waitFor(() => {
            const errorMessage = document.getElementById('errorMessage');
            expect(errorMessage.style.display).toBe('block');
            expect(errorMessage.innerHTML).toContain('Muitas tentativas de login');
        });
    });

    it('deve exibir mensagem de falha de conexão caso ocorra exceção de rede', async () => {
        loadScript();

        document.getElementById('loginField').value = 'usuario@sonarfy.com';
        document.getElementById('passwordField').value = 'Senha@123';

        backendHandler = () => {
            throw new Error('Network error');
        };

        const btnSubmitLogin = document.getElementById('btnSubmitLogin');
        document.getElementById('loginForm').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

        await vi.waitFor(() => {
            const errorMessage = document.getElementById('errorMessage');
            expect(errorMessage.style.display).toBe('block');
            expect(errorMessage.innerHTML).toContain('Erro ao conectar com o servidor');
            expect(btnSubmitLogin.disabled).toBe(false);
        });
    });

    it('deve ocultar a mensagem de erro quando o usuário começar a digitar novamente', () => {
        loadScript();

        const errorMessage = document.getElementById('errorMessage');
        const loginField = document.getElementById('loginField');

        errorMessage.style.display = 'block';
        errorMessage.innerText = 'Algum erro anterior';

        loginField.dispatchEvent(new Event('input'));
        expect(errorMessage.style.display).toBe('none');
    });

    it('deve bloquear campos vazios, indicar o erro e focar o primeiro campo inválido', () => {
        loadScript();
        document.getElementById('loginForm').dispatchEvent(new Event('submit', { cancelable: true }));
        const login = document.getElementById('loginField');
        expect(fetch).not.toHaveBeenCalled();
        expect(document.activeElement).toBe(login);
        expect(login.getAttribute('aria-invalid')).toBe('true');
        expect(document.getElementById('passwordField').getAttribute('aria-invalid')).toBe('true');
        expect(document.getElementById('loginField-error').hidden).toBe(false);
        login.value = '@usuario';
        login.dispatchEvent(new Event('input'));
        expect(login.hasAttribute('aria-invalid')).toBe(false);
        expect(document.getElementById('loginField-error').hidden).toBe(true);
    });

    it('deve exibir mensagens do servidor como texto, sem interpretar HTML', async () => {
        loadScript();
        document.getElementById('loginField').value = '@usuario';
        document.getElementById('passwordField').value = 'senha';
        backendHandler = () => ({ ok: false, status: 500, text: async () => JSON.stringify({ message: '<img src=x onerror=alert(1)>' }) });
        document.getElementById('loginForm').dispatchEvent(new Event('submit', { cancelable: true }));
        await vi.waitFor(() => {
            expect(document.getElementById('errorMessage').textContent).toBe('<img src=x onerror=alert(1)>');
            expect(document.getElementById('errorMessage').querySelector('img')).toBeNull();
        });
    });

    it.each(['javascript:alert(1)', '//example.com', 'https://example.com'])('deve rejeitar redirecionamento externo ou executável: %s', async (redirect) => {
        window.happyDOM.setURL(`http://localhost:3000/pages/login.html?redirect=${encodeURIComponent(redirect)}`);
        loadScript();
        document.getElementById('loginField').value = 'usuario';
        document.getElementById('passwordField').value = 'senha';
        document.getElementById('loginForm').dispatchEvent(new Event('submit', { cancelable: true }));
        await vi.waitFor(() => expect(window.location.pathname).toBe('/pages/spotify-sync.html'));
    });

    // Verifica envio seguro de POST /api/auth/reactivation, limpeza de token em 204 e segurança da senha.
    it('deve reativar conta com 204 usando credentials omit, sem Authorization/refresh e limpando sonarfy_token e senha', async () => {
        localStorage.setItem('sonarfy_token', 'old-access-token');
        sessionStorage.setItem('sonarfy_token', 'old-session-token');
        localStorage.setItem('sonarfy_theme', 'dark');
        loadScript();

        document.getElementById('loginField').value = '  @Pablo  ';
        document.getElementById('passwordField').value = 'SenhaLoginAntiga123!';
        document.getElementById('btnOpenReactivation').click();

        const loginForm = document.getElementById('loginForm');
        const reactivationForm = document.getElementById('reactivationForm');
        const reactivationLogin = document.getElementById('reactivationLogin');
        const reactivationPassword = document.getElementById('reactivationPassword');

        expect(loginForm.hidden).toBe(true);
        expect(reactivationForm.hidden).toBe(false);
        expect(reactivationLogin.value).toBe('@Pablo');
        expect(reactivationPassword.value).toBe('');

        reactivationPassword.value = 'SenhaAtualSecreta@72';
        backendHandler = () => ({ ok: true, status: 204, text: async () => '' });

        reactivationForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

        await vi.waitFor(() => {
            expect(reactivationForm.hidden).toBe(true);
            expect(loginForm.hidden).toBe(false);
            expect(document.getElementById('successMessage').style.display).toBe('block');
        });

        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
        const [url, options] = globalThis.fetch.mock.calls[0];
        expect(url).toBe('http://localhost:8080/api/auth/reactivation');
        expect(url).not.toContain('SenhaAtualSecreta@72');
        expect(options.method).toBe('POST');
        expect(options.credentials).toBe('omit');
        expect(options.cache).toBe('no-store');
        expect(options.headers).toEqual({
            'Content-Type': 'application/json',
            'X-Sonarfy-CSRF': '1'
        });
        expect(options.headers.Authorization).toBeUndefined();
        expect(JSON.parse(options.body)).toEqual({
            login: '@Pablo',
            password: 'SenhaAtualSecreta@72'
        });

        expect(localStorage.getItem('sonarfy_token')).toBeNull();
        expect(sessionStorage.getItem('sonarfy_token')).toBeNull();
        expect(localStorage.getItem('sonarfy_theme')).toBe('dark');
        expect(reactivationPassword.value).toBe('');
        expect(document.getElementById('passwordField').value).toBe('');
        expect(document.getElementById('successMessage').textContent).toContain('Conta reativada com sucesso');
        expect(document.getElementById('successMessage').textContent).not.toContain('SenhaAtualSecreta@72');
        expect(document.getElementById('successMessage').textContent.toLowerCase()).not.toContain('e-mail enviado');
        expect(globalThis.fetch.mock.calls.some(([calledUrl]) => String(calledUrl).includes('/auth/refresh'))).toBe(false);
    });

    // Valida bloqueio local de campos obrigatórios e limite BCrypt de 72 bytes UTF-8 na reativação.
    it('deve validar campos vazios e limite de 72 bytes UTF-8 antes de enviar reativação', async () => {
        loadScript();
        document.getElementById('btnOpenReactivation').click();

        const form = document.getElementById('reactivationForm');
        const loginInput = document.getElementById('reactivationLogin');
        const passwordInput = document.getElementById('reactivationPassword');

        form.dispatchEvent(new Event('submit', { cancelable: true }));
        expect(globalThis.fetch).not.toHaveBeenCalled();
        expect(loginInput.getAttribute('aria-invalid')).toBe('true');
        expect(passwordInput.getAttribute('aria-invalid')).toBe('true');
        expect(document.activeElement).toBe(loginInput);

        // 37 caracteres 'é' = 74 bytes UTF-8 (> 72 bytes)
        loginInput.value = 'conta@sonarfy.com';
        passwordInput.value = 'é'.repeat(37);
        form.dispatchEvent(new Event('submit', { cancelable: true }));
        expect(globalThis.fetch).not.toHaveBeenCalled();
        expect(passwordInput.getAttribute('aria-invalid')).toBe('true');
        expect(document.getElementById('reactivationPassword-error').textContent).toContain('72 bytes');
        expect(document.getElementById('reactivationError').textContent).toContain('72 bytes');
        expect(document.activeElement).toBe(passwordInput);

        // 36 caracteres 'é' = 72 bytes UTF-8 exatos (aceito)
        passwordInput.value = 'é'.repeat(36);
        backendHandler = () => ({ ok: true, status: 204, text: async () => '' });
        form.dispatchEvent(new Event('submit', { cancelable: true }));
        await vi.waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
    });

    // Valida respostas de erro 401 (uniforme), 400, 403, 429, 500 e falha de rede na reativação.
    it.each([
        [401, 'Credenciais inválidas ou não foi possível reativar a conta'],
        [400, 'Dados inválidos'],
        [403, 'bloqueada pela verificação de segurança'],
        [429, 'Muitas tentativas de reativação'],
        [500, 'Não foi possível reativar a conta no momento']
    ])('deve tratar status HTTP %s com mensagem segura na reativação', async (status, expectedSnippet) => {
        loadScript();
        document.getElementById('btnOpenReactivation').click();
        document.getElementById('reactivationLogin').value = 'conta@sonarfy.com';
        document.getElementById('reactivationPassword').value = 'SenhaSecreta@123';

        backendHandler = () => ({ ok: false, status, text: async () => JSON.stringify({ message: 'Raw backend detail' }) });
        document.getElementById('reactivationForm').dispatchEvent(new Event('submit', { cancelable: true }));

        await vi.waitFor(() => {
            const errorEl = document.getElementById('reactivationError');
            expect(errorEl.style.display).toBe('block');
            expect(errorEl.textContent).toContain(expectedSnippet);
            expect(errorEl.textContent).not.toContain('Raw backend detail');
            expect(errorEl.textContent).not.toContain('SenhaSecreta@123');
            expect(errorEl.textContent.toLowerCase()).not.toContain('não verificada');
            expect(errorEl.textContent.toLowerCase()).not.toContain('inexistente');
        });
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    // Garante tratamento amigável em falha de rede sem expor exceção técnica nem a senha.
    it('deve exibir mensagem amigável em falha de rede na reativação', async () => {
        loadScript();
        document.getElementById('btnOpenReactivation').click();
        document.getElementById('reactivationLogin').value = 'conta@sonarfy.com';
        document.getElementById('reactivationPassword').value = 'SenhaSecreta@123';

        backendHandler = () => {
            throw new TypeError('Failed to fetch internal stack');
        };
        document.getElementById('reactivationForm').dispatchEvent(new Event('submit', { cancelable: true }));

        await vi.waitFor(() => {
            const errorEl = document.getElementById('reactivationError');
            expect(errorEl.style.display).toBe('block');
            expect(errorEl.textContent).toContain('Não foi possível conectar ao servidor');
            expect(errorEl.textContent).not.toContain('Failed to fetch');
            expect(errorEl.textContent).not.toContain('SenhaSecreta@123');
        });
    });

    // Impede envios concorrentes enquanto uma reativação estiver em andamento.
    it('deve bloquear envios duplicados e indicar aria-busy durante reativação pendente', async () => {
        loadScript();
        document.getElementById('btnOpenReactivation').click();
        document.getElementById('reactivationLogin').value = 'conta@sonarfy.com';
        document.getElementById('reactivationPassword').value = 'SenhaAtual@123';

        let resolveFetch;
        backendHandler = () => new Promise(resolve => { resolveFetch = resolve; });

        const form = document.getElementById('reactivationForm');
        const submitBtn = document.getElementById('btnSubmitReactivation');
        const cancelBtn = document.getElementById('btnCancelReactivation');

        form.dispatchEvent(new Event('submit', { cancelable: true }));
        form.dispatchEvent(new Event('submit', { cancelable: true }));

        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
        expect(form.getAttribute('aria-busy')).toBe('true');
        expect(submitBtn.disabled).toBe(true);
        expect(cancelBtn.disabled).toBe(true);

        resolveFetch({ ok: true, status: 204, text: async () => '' });

        await vi.waitFor(() => {
            expect(form.hasAttribute('aria-busy')).toBe(false);
            expect(submitBtn.disabled).toBe(false);
            expect(cancelBtn.disabled).toBe(false);
            expect(form.hidden).toBe(true);
        });
    });
});
