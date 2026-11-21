import { createPasswordClient, extractUrlToken } from './password-http.js';

// Initialize the public password recovery and reset page (pages/recuperar-senha.html).
export function initPasswordRecovery({
    doc = typeof document !== 'undefined' ? document : null,
    locationObj = typeof window !== 'undefined' ? window.location : { pathname: '', search: '', hash: '' },
    historyObj = typeof window !== 'undefined' ? window.history : null,
    navigate = url => { window.location.assign(url); },
    passwordClient = createPasswordClient()
} = {}) {
    if (!doc) return null;

    const forgotForm = doc.getElementById('forgotPasswordForm');
    const resetForm = doc.getElementById('resetPasswordForm');
    const titleEl = doc.getElementById('recovery-title');
    const descEl = doc.getElementById('recovery-description');
    const errorEl = doc.getElementById('recoveryError');
    const successEl = doc.getElementById('recoverySuccess');
    if (!forgotForm || !resetForm) return null;

    const showError = msg => {
        if (!errorEl) return;
        errorEl.textContent = msg;
        errorEl.style.display = 'block';
        if (successEl) successEl.style.display = 'none';
    };

    const showSuccess = msg => {
        if (!successEl) return;
        successEl.textContent = msg;
        successEl.style.display = 'block';
        if (errorEl) errorEl.style.display = 'none';
    };

    const clearFeedback = () => {
        if (errorEl) { errorEl.style.display = 'none'; errorEl.textContent = ''; }
        if (successEl) { successEl.style.display = 'none'; successEl.textContent = ''; }
    };

    const resetToken = extractUrlToken('token', locationObj, historyObj);
    const isResetMode = Boolean(resetToken);

    forgotForm.hidden = isResetMode;
    resetForm.hidden = !isResetMode;
    if (isResetMode) {
        if (titleEl) titleEl.textContent = 'Definir nova senha';
        if (descEl) descEl.textContent = 'Escolha uma nova senha com pelo menos 8 caracteres para acessar sua conta.';
    }

    // Wire password visibility toggle buttons when present.
    doc.querySelectorAll('[data-toggle-password]').forEach(btn => {
        const target = doc.getElementById(btn.dataset.togglePassword);
        if (!target) return;
        btn.addEventListener('click', () => {
            const show = target.type === 'password';
            target.type = show ? 'text' : 'password';
            btn.setAttribute('aria-pressed', String(show));
            btn.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
        });
    });

    const forgotBtn = doc.getElementById('btnForgotSubmit');
    const emailInput = doc.getElementById('recoveryEmail');
    forgotForm.addEventListener('submit', async event => {
        event.preventDefault();
        if (forgotBtn?.disabled) return;
        clearFeedback();
        if (forgotBtn) {
            forgotBtn.disabled = true;
            forgotBtn.textContent = 'Enviando...';
        }
        try {
            const result = await passwordClient.requestForgotPassword(emailInput?.value || '');
            showSuccess(result.message);
        } catch (error) {
            showError(error.message || 'Não foi possível processar sua solicitação.');
        } finally {
            if (forgotBtn) {
                forgotBtn.disabled = false;
                forgotBtn.textContent = 'Enviar instruções';
            }
        }
    });

    const resetBtn = doc.getElementById('btnResetSubmit');
    const newPwdInput = doc.getElementById('newPassword');
    const confirmPwdInput = doc.getElementById('confirmNewPassword');
    resetForm.addEventListener('submit', async event => {
        event.preventDefault();
        if (resetBtn?.disabled) return;
        clearFeedback();
        if (resetBtn) {
            resetBtn.disabled = true;
            resetBtn.textContent = 'Redefinindo...';
        }
        try {
            await passwordClient.resetPassword({
                token: resetToken,
                newPassword: newPwdInput?.value || '',
                confirmNewPassword: confirmPwdInput?.value || ''
            });
            navigate('login.html?reset=true');
        } catch (error) {
            showError(error.message || 'Não foi possível redefinir a senha.');
        } finally {
            if (resetBtn) {
                resetBtn.disabled = false;
                resetBtn.textContent = 'Redefinir senha';
            }
        }
    });

    return { isResetMode };
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { initPasswordRecovery(); });
    } else {
        initPasswordRecovery();
    }
}
