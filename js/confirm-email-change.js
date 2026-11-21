import { createEmailChangeClient } from './email-change-http.js';
import { extractUrlToken } from './password-http.js';

// Initialize the explicit email change confirmation page (pages/confirm-email-change.html).
export function initConfirmEmailChange({
    doc = typeof document !== 'undefined' ? document : null,
    locationObj = typeof window !== 'undefined' ? window.location : { pathname: '', search: '', hash: '' },
    historyObj = typeof window !== 'undefined' ? window.history : null,
    emailChangeClient = createEmailChangeClient()
} = {}) {
    if (!doc) return null;

    const confirmSection = doc.getElementById('confirm-state');
    const loadingSection = doc.getElementById('loading-state');
    const successSection = doc.getElementById('success-state');
    const errorSection = doc.getElementById('error-state');
    const errorText = doc.getElementById('error-message-text');
    const confirmBtn = doc.getElementById('btnConfirmEmailChange');
    const main = doc.getElementById('main-content');
    if (!confirmSection || !loadingSection || !successSection || !errorSection) return null;

    const showState = state => {
        doc.body.dataset.state = state;
        confirmSection.hidden = state !== 'confirm';
        loadingSection.hidden = state !== 'loading';
        successSection.hidden = state !== 'success';
        errorSection.hidden = state !== 'error';
        if (main) main.setAttribute('aria-busy', String(state === 'loading'));
    };

    const showError = message => {
        if (errorText) errorText.textContent = message;
        showState('error');
    };

    let token = extractUrlToken('token', locationObj, historyObj);
    if (!token) {
        showError('O link de confirmação está incompleto ou inválido. Solicite uma nova alteração de e-mail nas configurações.');
        return { hasToken: false };
    }

    showState('confirm');
    let submitting = false;

    const handleConfirm = async () => {
        if (submitting || !token) return;
        submitting = true;
        if (confirmBtn) confirmBtn.disabled = true;
        showState('loading');
        try {
            await emailChangeClient.confirmEmailChange(token);
            token = null;
            showState('success');
        } catch (error) {
            showError(error.message || 'Não foi possível confirmar a troca de e-mail.');
        } finally {
            submitting = false;
            if (confirmBtn) confirmBtn.disabled = false;
        }
    };

    if (confirmBtn) {
        confirmBtn.addEventListener('click', handleConfirm);
    }

    return { hasToken: true, handleConfirm };
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { initConfirmEmailChange(); });
    } else {
        initConfirmEmailChange();
    }
}
