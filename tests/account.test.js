import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createAccountAdapter } from '../js/account-fixtures.js';
import { validateHandle, normalizeHandle } from '../js/account-state.js';
import { mountAccount } from '../js/account.js';
import { SPOTIFY_SYNCED_KEY } from '../js/spotify-sync-state.js';

let mounted;

// Build a deferred promise helper for testing async loading and duplicate-click locks.
const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
};

// Mount pages/account.html body into Happy DOM with a custom adapter and mock navigator.
async function mount(adapter, options = {}) {
    const html = readFileSync('pages/account.html', 'utf8');
    document.body.innerHTML = html.split('<body class="account-page">')[1].split('</body>')[0];
    // Happy DOM does not implement showModal/close natively on dialog elements in all versions.
    for (const dlg of document.querySelectorAll('dialog')) {
        if (!dlg.showModal) {
            dlg.showModal = () => { dlg.setAttribute('open', ''); dlg.open = true; };
        }
        if (!dlg.close) {
            dlg.close = () => { dlg.removeAttribute('open'); dlg.open = false; dlg.dispatchEvent(new Event('close')); };
        }
    }
    mounted = mountAccount(adapter, options);
    await mounted.ready;
    return mounted;
}

afterEach(() => {
    mounted?.destroy();
    mounted = null;
    document.body.innerHTML = '';
    localStorage.clear();
    delete window.sonarfyAccountAdapter;
    vi.useRealTimers();
});

describe('account: handle validation and adapter selection', () => {
    // Verify handle normalization and syntax constraints aligned with backend contract (1..15 ASCII chars).
    it('normalizes and validates handle rules', () => {
        expect(normalizeHandle(' @Ana_Ribeiro ')).toBe('ana_ribeiro');
        expect(validateHandle('ana_ribeiro').valid).toBe(true);
        expect(validateHandle('ana-9.ok').valid).toBe(true);
        expect(validateHandle('').valid).toBe(false);
        expect(validateHandle('handle_com_mais_de_15').valid).toBe(false);
        expect(validateHandle('ana!@#').valid).toBe(false);
        expect(validateHandle('ana ribeiro').valid).toBe(false);
    });

    // Verify host adapter override and default demo adapter fallback.
    it('uses window.sonarfyAccountAdapter when provided or falls back to demo fixtures', () => {
        const host = { load: vi.fn() };
        window.sonarfyAccountAdapter = host;
        expect(createAccountAdapter()).toBe(host);
        delete window.sonarfyAccountAdapter;
        const demo = createAccountAdapter();
        expect(demo.demo).toBe(true);
    });
});

describe('account: personal info editing, handle availability, and city-country sync', () => {
    // Verify read-only default state, active sidebar item, and editable handle without lock.
    it('renders Configurações active in sidebar and unlocks handle without lock icon in edit mode', async () => {
        await mount(createAccountAdapter());
        expect(document.querySelector('.profile-sidebar [aria-current="page"]').textContent).toBe('Configurações');
        expect(document.getElementById('account-demo').hidden).toBe(false);

        const handleInput = document.getElementById('handle-input');
        const countryInput = document.getElementById('country-input');
        expect(handleInput.disabled).toBe(true);
        expect(handleInput.closest('.account-field').querySelector('img[src*="lock"]')).toBeNull();
        expect(document.body.textContent).not.toContain('O usuário não pode ser alterado');

        document.getElementById('edit-account-btn').click();
        expect(handleInput.disabled).toBe(false);
        expect(document.getElementById('first-name').disabled).toBe(false);
        expect(countryInput.disabled).toBe(true);
        expect(document.getElementById('edit-actions').hidden).toBe(false);
    });

    // Verify taken handle blocks save and available handle saves personal info cleanly.
    it('validates handle availability, updates country from city selection, and saves or cancels', async () => {
        await mount(createAccountAdapter());
        document.getElementById('edit-account-btn').click();

        const handleInput = document.getElementById('handle-input');
        const handleFeedback = document.getElementById('handle-feedback');
        const saveBtn = document.getElementById('save-account-btn');

        handleInput.value = 'lucas_vinyl';
        handleInput.dispatchEvent(new Event('blur'));
        await vi.waitFor(() => {
            expect(handleFeedback.textContent).toContain('já está em uso');
            expect(saveBtn.disabled).toBe(true);
        });

        handleInput.value = 'ana_vinil';
        handleInput.dispatchEvent(new Event('blur'));
        await vi.waitFor(() => {
            expect(handleFeedback.textContent).toContain('@ana_vinil está disponível');
            expect(saveBtn.disabled).toBe(false);
        });

        const cityInput = document.getElementById('city-input');
        cityInput.value = 'Lisboa';
        cityInput.dispatchEvent(new Event('input'));
        await vi.waitFor(() => {
            expect(document.getElementById('city-suggestions').hidden).toBe(false);
        });
        document.querySelector('#city-suggestions button').click();
        expect(cityInput.value).toBe('Lisboa');
        expect(document.getElementById('country-input').value).toBe('Portugal');

        document.getElementById('first-name').value = 'Ana Clara';
        document.getElementById('account-form').dispatchEvent(new Event('submit', { cancelable: true }));
        await vi.waitFor(() => {
            expect(document.getElementById('edit-actions').hidden).toBe(true);
            expect(document.getElementById('account-dialog').open).toBe(true);
            expect(document.getElementById('account-dialog').textContent).toContain('atualizadas com sucesso');
            expect(document.getElementById('save-cooldown').hidden).toBe(false);
        });
        expect(document.getElementById('handle-input').value).toBe('ana_vinil');
        expect(document.getElementById('country-input').value).toBe('Portugal');
    });

    // Verify Cancel restores the previous snapshot and exits edit mode.
    it('restores original values when cancelling edit mode', async () => {
        await mount(createAccountAdapter());
        document.getElementById('edit-account-btn').click();
        document.getElementById('first-name').value = 'Alterado';
        document.getElementById('handle-input').value = 'handle_temporario';
        document.getElementById('cancel-edit-btn').click();

        expect(document.getElementById('first-name').value).toBe('Ana');
        expect(document.getElementById('handle-input').value).toBe('ana_ribeiro');
        expect(document.getElementById('edit-actions').hidden).toBe(true);
    });
});

describe('account: security, Spotify sync state, and cooldown timers', () => {
    // Verify Spotify connected state reads sonarfy_spotify_synced and allows disconnecting.
    it('integrates Spotify connection state with sonarfy_spotify_synced', async () => {
        localStorage.setItem(SPOTIFY_SYNCED_KEY, 'true');
        await mount(createAccountAdapter());

        const disconnectBtn = document.getElementById('spotify-disconnect-btn');
        expect(disconnectBtn).not.toBeNull();
        expect(disconnectBtn.textContent).toContain('Conectado');

        disconnectBtn.click();
        await vi.waitFor(() => {
            const syncLink = document.getElementById('spotify-sync-link');
            expect(syncLink).not.toBeNull();
            expect(syncLink.getAttribute('href')).toBe('spotify-sync.html?source=account');
        });
        expect(localStorage.getItem(SPOTIFY_SYNCED_KEY)).toBeNull();
    });

    // Verify email change and password reset trigger cooldown timers and disable buttons.
    it('triggers cooldown timers for email change and password reset', async () => {
        await mount(createAccountAdapter());
        const emailBtn = document.getElementById('change-email-btn');
        const pwdBtn = document.getElementById('reset-password-btn');

        emailBtn.click();
        await vi.waitFor(() => {
            expect(emailBtn.disabled).toBe(true);
            expect(document.getElementById('email-timer').textContent).toContain('Aguarde');
        });
        document.querySelector('#account-dialog [data-close]').click();

        pwdBtn.click();
        await vi.waitFor(() => {
            expect(pwdBtn.disabled).toBe(true);
            expect(document.getElementById('password-timer').textContent).toContain('Aguarde');
        });
    });
});

describe('account: deactivate and delete confirmation modals', () => {
    // Verify Deactivate Account modal copy, duplicate-click lock, token cleanup, and redirect.
    it('handles deactivate account confirmation, blocks duplicate clicks, and redirects to login', async () => {
        localStorage.setItem('sonarfy_token', 'tok-123');
        localStorage.setItem('sonarfy_theme', 'dark');
        const pending = deferred();
        const adapter = createAccountAdapter();
        const deactivateSpy = vi.fn(() => pending.promise);
        adapter.deactivateAccount = deactivateSpy;
        const navigate = vi.fn();

        await mount(adapter, { navigate });
        document.getElementById('deactivate-account-btn').click();

        const dialog = document.getElementById('account-dialog');
        expect(dialog.open).toBe(true);
        expect(dialog.textContent).toContain('Desativar sua conta?');
        expect(dialog.textContent).toContain('reativada automaticamente');

        const confirmBtn = dialog.querySelector('[data-confirm]');
        confirmBtn.click();
        confirmBtn.click();
        expect(deactivateSpy).toHaveBeenCalledTimes(1);
        expect(confirmBtn.disabled).toBe(true);

        pending.resolve({ deactivated: true });
        await vi.waitFor(() => {
            expect(navigate).toHaveBeenCalledWith('login.html');
        });
        expect(localStorage.getItem('sonarfy_token')).toBeNull();
        expect(localStorage.getItem('sonarfy_theme')).toBe('dark');
    });

    // Verify Delete Account modal destructive copy, cancellation, confirmation, and credential removal.
    it('handles delete account cancellation and permanent deletion flow', async () => {
        localStorage.setItem('sonarfy_token', 'tok-456');
        localStorage.setItem(SPOTIFY_SYNCED_KEY, 'true');
        const adapter = createAccountAdapter();
        const deleteSpy = vi.spyOn(adapter, 'deleteAccount');
        const navigate = vi.fn();

        await mount(adapter, { navigate });
        document.getElementById('delete-account-btn').click();

        const dialog = document.getElementById('account-dialog');
        expect(dialog.open).toBe(true);
        expect(dialog.textContent).toContain('Deletar conta permanentemente?');
        expect(dialog.textContent).toContain('definitiva e não pode ser desfeita');

        dialog.querySelector('.account-btn-secondary[data-close]').click();
        expect(dialog.open).toBe(false);
        expect(deleteSpy).not.toHaveBeenCalled();

        document.getElementById('delete-account-btn').click();
        dialog.querySelector('[data-confirm]').click();
        await vi.waitFor(() => {
            expect(deleteSpy).toHaveBeenCalledTimes(1);
            expect(navigate).toHaveBeenCalledWith('login.html');
        });
        expect(localStorage.getItem('sonarfy_token')).toBeNull();
        expect(localStorage.getItem(SPOTIFY_SYNCED_KEY)).toBeNull();
    });
});
