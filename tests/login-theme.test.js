import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const script = fs.readFileSync(path.resolve(__dirname, '../js/login-theme.js'), 'utf8');

describe('Tema do login', () => {
    let initialize;
    beforeEach(() => {
        localStorage.clear();
        document.documentElement.dataset.theme = 'light';
        document.body.innerHTML = '<button id="theme-toggle" type="button"></button>';
        vi.spyOn(document, 'addEventListener').mockImplementation((event, callback) => {
            if (event === 'DOMContentLoaded') initialize = callback;
        });
    });
    afterEach(() => vi.restoreAllMocks());

    it('restaura o tema salvo antes da inicialização dos controles', () => {
        localStorage.setItem('sonarfy_theme', 'dark');
        eval(script);
        expect(document.documentElement.dataset.theme).toBe('dark');
        initialize();
        expect(document.getElementById('theme-toggle').getAttribute('aria-pressed')).toBe('true');
    });

    it('alterna os dois temas e salva a preferência', () => {
        eval(script);
        initialize();
        const button = document.getElementById('theme-toggle');
        button.click();
        expect(document.documentElement.dataset.theme).toBe('dark');
        expect(localStorage.getItem('sonarfy_theme')).toBe('dark');
        expect(button.getAttribute('aria-label')).toBe('Ativar tema claro');
        button.click();
        expect(document.documentElement.dataset.theme).toBe('light');
        expect(localStorage.getItem('sonarfy_theme')).toBe('light');
        expect(button.getAttribute('aria-pressed')).toBe('false');
    });

    it('funciona quando o armazenamento está indisponível', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Blocked'); });
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Blocked'); });
        eval(script);
        initialize();
        expect(() => document.getElementById('theme-toggle').click()).not.toThrow();
        expect(document.documentElement.dataset.theme).toBe('dark');
    });
});
