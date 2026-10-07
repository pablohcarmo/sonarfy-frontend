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

        globalThis.API_BASE_URL = 'http://localhost:8081/api';
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

        // Limpa localStorage
        localStorage.clear();

        // Carrega o script
        const jsPath = path.resolve(__dirname, '../js/login.js');
        jsContent = fs.readFileSync(jsPath, 'utf-8');
    });

    afterEach(() => {
        backendHandler = null;
        vi.restoreAllMocks();
    });

    function loadScript() {
        eval(jsContent);
        document.dispatchEvent(new Event('DOMContentLoaded'));
    }

    it('deve alternar a visibilidade da senha ao clicar no botão de olho', () => {
        loadScript();

        const passwordField = document.getElementById('passwordField');
        const btnTogglePassword = document.getElementById('btnTogglePassword');
        const icon = btnTogglePassword.querySelector('i');

        expect(passwordField.type).toBe('password');
        expect(icon.className).toContain('fa-eye');

        // Primeiro clique: revela a senha
        btnTogglePassword.click();
        expect(passwordField.type).toBe('text');
        expect(icon.className).toContain('fa-eye-slash');
        expect(btnTogglePassword.getAttribute('aria-label')).toBe('Ocultar senha');

        // Segundo clique: oculta a senha
        btnTogglePassword.click();
        expect(passwordField.type).toBe('password');
        expect(icon.className).toContain('fa-eye');
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

    it('deve realizar login com sucesso, salvar JWT no localStorage e redirecionar para feed.html', async () => {
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
            text: async () => JSON.stringify({ token: 'mocked-jwt-token-xyz' })
        });

        loginForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

        await vi.waitFor(() => {
            expect(localStorage.getItem('sonarfy_token')).toBe('mocked-jwt-token-xyz');
            expect(localStorage.getItem('sonarfy_remember_login')).toBe('pablo@sonarfy.com');
            expect(window.location.href).toContain('feed.html');
        });

        expect(globalThis.fetch).toHaveBeenCalledWith(
            'http://localhost:8081/api/auth/login',
            expect.objectContaining({
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    login: 'pablo@sonarfy.com',
                    password: 'MinhaSenha@123'
                })
            })
        );
    });

    it('deve redirecionar para URL especificada no parâmetro redirect seguro quando fornecido', async () => {
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
            expect(window.location.href).toContain('account.html');
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
});
