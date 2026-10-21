import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';

describe('Interações acessíveis do cadastro', () => {
    let readyListeners;
    beforeEach(() => {
        vi.useFakeTimers();
        readyListeners = [];
        const addListener = document.addEventListener.bind(document);
        vi.spyOn(document, 'addEventListener').mockImplementation((type, listener, options) => {
            if (type === 'DOMContentLoaded') readyListeners.push(listener);
            addListener(type, listener, options);
        });
        const html = fs.readFileSync('pages/cadastro.html', 'utf8');
        document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)[1].replace(/<script[\s\S]*?<\/script>/gi, '');
        window.sonarfyCitySearch = vi.fn(async () => [
            { name: 'São Paulo', adminName1: 'São Paulo', countryName: 'Brasil' },
            { name: 'Campinas', adminName1: 'São Paulo', countryName: 'Brasil' },
        ]);
        eval(fs.readFileSync('js/cadastro.js', 'utf8'));
        document.dispatchEvent(new Event('DOMContentLoaded'));
    });
    afterEach(() => {
        readyListeners.forEach(listener => document.removeEventListener('DOMContentLoaded', listener));
        delete window.sonarfyCitySearch;
        vi.useRealTimers();
        vi.restoreAllMocks();
    });
    const type = (id, value) => {
        const field = document.getElementById(id);
        field.value = value;
        field.dispatchEvent(new Event('input'));
        return field;
    };

    it('atualiza os quatro critérios e revalida a confirmação ao alterar a senha original', () => {
        type('passwordField', 'Senha@123');
        expect(document.querySelectorAll('#passwordRequirements .valid')).toHaveLength(4);
        const confirmation = type('confirmPasswordField', 'Senha@123');
        expect(confirmation.validationMessage).toBe('');
        type('passwordField', 'Outra@123');
        expect(confirmation.getAttribute('aria-invalid')).toBe('true');
        expect(document.getElementById('confirmPasswordError').hidden).toBe(false);
        type('confirmPasswordField', 'Outra@123');
        expect(confirmation.validationMessage).toBe('');
        expect(document.getElementById('confirmPasswordError').hidden).toBe(true);
    });

    it('seleciona uma cidade pelas setas e Enter, sem submeter o formulário', async () => {
        document.getElementById('cityField').focus();
        const city = type('cityField', 'São');
        await vi.advanceTimersByTimeAsync(350);
        expect(city.getAttribute('aria-expanded')).toBe('true');
        city.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true }));
        expect(city.getAttribute('aria-activedescendant')).toBe('city-option-0');
        const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
        city.dispatchEvent(enter);
        expect(enter.defaultPrevented).toBe(true);
        expect(city.value).toBe('São Paulo');
        expect(city.getAttribute('aria-expanded')).toBe('false');
    });

    it('descarta respostas antigas mesmo se o provedor não respeitar AbortSignal', async () => {
        let resolveOld;
        window.sonarfyCitySearch.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
        document.getElementById('cityField').focus();
        type('cityField', 'São');
        await vi.advanceTimersByTimeAsync(350);
        type('cityField', 'Camp');
        await vi.advanceTimersByTimeAsync(350);
        resolveOld([{ name: 'Resultado antigo', countryName: 'Brasil' }]);
        await Promise.resolve();
        expect(document.getElementById('citySuggestions').textContent).not.toContain('Resultado antigo');
    });

    it('fecha o dropdown com Escape e mantém o campo editável após erro de rede', async () => {
        document.getElementById('cityField').focus();
        const city = type('cityField', 'São');
        await vi.advanceTimersByTimeAsync(350);
        city.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(city.getAttribute('aria-expanded')).toBe('false');
        window.sonarfyCitySearch.mockRejectedValueOnce(new Error('offline'));
        type('cityField', 'Lisboa');
        await vi.advanceTimersByTimeAsync(350);
        expect(city.value).toBe('Lisboa');
        expect(document.getElementById('cityStatus').textContent).toContain('Não foi possível');
    });
});
