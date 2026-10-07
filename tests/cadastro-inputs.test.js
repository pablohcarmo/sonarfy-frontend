import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Sanitização em Tempo Real e Entradas (cadastro.js)', () => {
    let htmlContent;
    let jsContent;

    let mockRegisterResponse = null;

    beforeEach(() => {
        vi.useFakeTimers();

        const htmlPath = path.resolve(__dirname, '../pages/cadastro.html');
        htmlContent = fs.readFileSync(htmlPath, 'utf-8');

        const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*)<\/body>/i);
        const cleanBody = (bodyMatch ? bodyMatch[1] : htmlContent).replace(/<script[\s\S]*?<\/script>/gi, '');
        document.body.innerHTML = cleanBody;

        globalThis.API_BASE_URL = 'http://localhost:8081/api';
        globalThis.GEONAMES_USERNAME = 'testuser';

        mockRegisterResponse = null;

        globalThis.fetch = vi.fn(async (url, options) => {
            if (url.includes('geonames.org')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({ geonames: [{ countryName: 'Brazil' }] })
                };
            }
            if (url.includes('/auth/register')) {
                if (typeof mockRegisterResponse === 'function') {
                    return mockRegisterResponse(options);
                }
                return mockRegisterResponse;
            }
            return {
                ok: true,
                status: 200,
                json: async () => ({})
            };
        });

        const jsPath = path.resolve(__dirname, '../js/cadastro.js');
        jsContent = fs.readFileSync(jsPath, 'utf-8');

        eval(jsContent);
        document.dispatchEvent(new Event('DOMContentLoaded'));
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('deve remover emojis em tempo real de qualquer campo de texto', () => {
        const nameField = document.getElementById('nameField');
        nameField.value = 'Pablo 😄 Teste 🚀';
        nameField.dispatchEvent(new Event('input'));

        expect(nameField.value).toBe('Pablo  Teste ');
    });

    it('deve bloquear números e símbolos proibidos no Nome e Sobrenome', () => {
        const nameField = document.getElementById('nameField');
        const surnameField = document.getElementById('surnameField');

        nameField.value = 'João123 #Silva';
        nameField.dispatchEvent(new Event('input'));
        expect(nameField.value).toBe('João Silva');

        surnameField.value = "D'Ávila-Costa 456!";
        surnameField.dispatchEvent(new Event('input'));
        expect(surnameField.value).toBe("D'Ávila-Costa ");
    });

    it('deve validar data de nascimento no evento change do input', () => {
        const birthDateField = document.getElementById('birthDateField');
        const errorMessage = document.getElementById('errorMessage');

        // Data futura
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        birthDateField.value = tomorrow.toISOString().split('T')[0];
        birthDateField.dispatchEvent(new Event('change'));

        expect(errorMessage.style.display).toBe('block');
        expect(errorMessage.innerText).toContain('data no passado');

        // Idade menor que 13 anos
        const fiveYearsAgo = new Date();
        fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
        birthDateField.value = fiveYearsAgo.toISOString().split('T')[0];
        birthDateField.dispatchEvent(new Event('change'));

        expect(errorMessage.style.display).toBe('block');
        expect(errorMessage.innerText).toContain('13 anos');

        // Data válida
        birthDateField.value = '2000-01-01';
        birthDateField.dispatchEvent(new Event('change'));
        expect(errorMessage.style.display).toBe('none');
    });

    it('deve alternar entre pendingSection e registerSection com o botão Voltar ao Formulário', () => {
        const registerSection = document.getElementById('registerSection');
        const pendingSection = document.getElementById('pendingSection');
        const btnBackToForm = document.getElementById('btnBackToForm');

        // Simula estar na tela pendente
        registerSection.style.display = 'none';
        pendingSection.style.display = 'block';

        btnBackToForm.dispatchEvent(new Event('click'));

        expect(pendingSection.style.display).toBe('none');
        expect(registerSection.style.display).toBe('block');
    });

    it('deve exibir mensagem de erro quando o backend rejeitar o cadastro com array de errors', async () => {
        mockRegisterResponse = {
            ok: false,
            status: 400,
            json: async () => ({
                errors: [
                    { defaultMessage: 'O e-mail já existe' },
                    { defaultMessage: 'Handle já em uso' }
                ]
            })
        };

        // Preenche campos obrigatórios
        document.getElementById('nameField').value = 'Pablo';
        document.getElementById('surnameField').value = 'Carmo';
        document.getElementById('handleField').value = 'pablo';
        document.getElementById('emailField').value = 'pablo@sonarfy.com';
        const passwordField = document.getElementById('passwordField');
        passwordField.value = 'Senha@123';
        passwordField.dispatchEvent(new Event('input'));
        document.getElementById('confirmPasswordField').value = 'Senha@123';
        document.getElementById('birthDateField').value = '2000-01-01';
        document.getElementById('cityField').value = 'São Paulo';

        document.getElementById('registerForm').dispatchEvent(new Event('submit', { cancelable: true }));

        await vi.waitFor(() => {
            const errorMessage = document.getElementById('errorMessage');
            expect(errorMessage.style.display).toBe('block');
            expect(errorMessage.innerText).toContain('O e-mail já existe; Handle já em uso');
        });
    });

    it('deve tratar erro de conexão de rede durante o cadastro', async () => {
        mockRegisterResponse = () => Promise.reject(new Error('Network error'));

        document.getElementById('nameField').value = 'Pablo';
        document.getElementById('surnameField').value = 'Carmo';
        document.getElementById('handleField').value = 'pablo';
        document.getElementById('emailField').value = 'pablo@sonarfy.com';
        const passwordField = document.getElementById('passwordField');
        passwordField.value = 'Senha@123';
        passwordField.dispatchEvent(new Event('input'));
        document.getElementById('confirmPasswordField').value = 'Senha@123';
        document.getElementById('birthDateField').value = '2000-01-01';
        document.getElementById('cityField').value = 'São Paulo';

        document.getElementById('registerForm').dispatchEvent(new Event('submit', { cancelable: true }));

        await vi.waitFor(() => {
            const errorMessage = document.getElementById('errorMessage');
            expect(errorMessage.style.display).toBe('block');
            expect(errorMessage.innerText).toContain('Erro de conexão com o servidor');
        });
    });
});
