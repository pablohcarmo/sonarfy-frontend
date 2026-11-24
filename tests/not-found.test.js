import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { mountNotFoundPage, navigateBackOrHome, resolveHomeRoute } from '../js/not-found.js';
import { globalFooter, sidebar } from '../js/profile-shell.js';

let mounted;
afterEach(() => {
    mounted?.destroy();
    mounted = null;
    document.body.innerHTML = '';
    localStorage.clear();
});

function loadMarkup() {
    const html = readFileSync('404.html', 'utf8');
    document.body.innerHTML = html.split('<body class="not-found-page">')[1].split('</body>')[0];
}

describe('not-found: 404 page routing and actions', () => {
    // Verify home route switches between /index.html and /pages/feed.html based on token presence.
    it('resolves home route according to local session token', () => {
        expect(resolveHomeRoute(localStorage)).toBe('/index.html');
        localStorage.setItem('sonarfy_token', 'jwt-token');
        expect(resolveHomeRoute(localStorage)).toBe('/pages/feed.html');
    });

    // Verify back button uses history.back() when history exists and falls back to home otherwise.
    it('navigates back when history exists or falls back to home route', () => {
        const backSpy = vi.fn();
        const assignSpy = vi.fn();
        expect(navigateBackOrHome({
            historyObj: { length: 2, back: backSpy },
            locationObj: { assign: assignSpy },
            storage: localStorage
        })).toBe('back');
        expect(backSpy).toHaveBeenCalledTimes(1);
        expect(assignSpy).not.toHaveBeenCalled();

        localStorage.setItem('sonarfy_token', 'jwt-token');
        expect(navigateBackOrHome({
            historyObj: { length: 1, back: backSpy },
            locationObj: { assign: assignSpy },
            storage: localStorage
        })).toBe('/pages/feed.html');
        expect(assignSpy).toHaveBeenCalledWith('/pages/feed.html');
    });

    // Verify DOM mounting updates brand/home links and wires the primary back button.
    it('mounts 404 page copy, links, and back button handler', () => {
        loadMarkup();
        localStorage.setItem('sonarfy_token', 'jwt-token');
        const backSpy = vi.fn();
        mounted = mountNotFoundPage({
            historyObj: { length: 3, back: backSpy },
            locationObj: { assign: vi.fn() }
        });

        expect(document.getElementById('not-found-title').textContent).toBe('Página não encontrada ou em construção');
        expect(document.querySelector('.not-found-pill').textContent).toBe('Erro 404');
        expect(document.getElementById('btnGoHome').getAttribute('href')).toBe('/pages/feed.html');
        expect(document.getElementById('notFoundBrand').getAttribute('href')).toBe('/pages/feed.html');

        document.getElementById('btnGoBack').click();
        expect(backSpy).toHaveBeenCalledTimes(1);
    });

    // Verify shared footer routes institutional links to ../404.html while search/notifications stay disabled.
    it('routes institutional footer links to ../404.html and keeps search/notifications disabled', () => {
        document.body.innerHTML = `${sidebar(false, {}, null)}${globalFooter()}`;
        expect(document.querySelector('[data-navigation="search"]')?.disabled).toBe(true);
        expect(document.querySelector('[data-navigation="notifications"]')?.disabled).toBe(true);

        const footerLinks = [...document.querySelectorAll('.footer-links a')];
        expect(footerLinks).toHaveLength(4);
        expect(footerLinks.every(a => a.getAttribute('href') === '../404.html')).toBe(true);
    });
});
