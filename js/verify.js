document.addEventListener('DOMContentLoaded', async () => {
    const states = ['loading', 'success', 'error'];
    const main = document.getElementById('main-content');
    const form = document.getElementById('verifyResendForm');
    const input = document.getElementById('verifyEmailInput');
    const button = document.getElementById('btnVerifyResend');
    const errorFeedback = document.getElementById('verifyResendError');
    const successFeedback = document.getElementById('verifyResendSuccess');
    const errorTitle = document.getElementById('error-title');
    const errorDescription = document.getElementById('error-message-text');
    const resendLabel = 'Reenviar Link de Confirmação';
    const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token')?.trim();
    let sending = false;
    let cooldownUntil = 0;
    let cooldownInterval;

    input.value = (params.get('email') || '').trim().slice(0, input.maxLength);

    function showState(state, title, description) {
        if (title) errorTitle.textContent = title;
        if (description) errorDescription.textContent = description;
        states.forEach(name => {
            document.getElementById(name + '-state').hidden = name !== state;
        });
        document.body.dataset.state = state;
        main.setAttribute('aria-busy', String(state === 'loading'));
    }

    function clearFeedback() {
        [errorFeedback, successFeedback].forEach(element => {
            element.hidden = true;
            element.replaceChildren();
        });
        input.removeAttribute('aria-invalid');
    }

    function showFeedback(element, message) {
        clearFeedback();
        element.textContent = message;
        element.hidden = false;
    }

    function invalidEmail(message) {
        showFeedback(errorFeedback, message);
        input.setAttribute('aria-invalid', 'true');
        input.focus();
    }

    function updateCooldown() {
        const seconds = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
        button.disabled = sending || seconds > 0;
        button.textContent = seconds ? 'Aguarde (' + seconds + 's)' : resendLabel;
        if (!seconds) clearInterval(cooldownInterval);
    }

    // Use an elapsed-time deadline so background-tab throttling does not extend it.
    function startCooldown() {
        cooldownUntil = Date.now() + 60000;
        clearInterval(cooldownInterval);
        updateCooldown();
        cooldownInterval = setInterval(updateCooldown, 1000);
    }

    async function request(url, method) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        try {
            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal
            });
            const text = await response.text();
            let message = text;
            try {
                const data = JSON.parse(text);
                message = typeof data.message === 'string' ? data.message
                    : typeof data.error === 'string' ? data.error : '';
            } catch { /* Some API endpoints return plain text or an empty body. */ }
            return { response, message: message.toLowerCase() };
        } finally {
            clearTimeout(timeout);
        }
    }

    input.addEventListener('input', () => {
        input.removeAttribute('aria-invalid');
        errorFeedback.hidden = true;
    });

    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (sending || Date.now() < cooldownUntil) return;
        clearFeedback();
        const email = input.value.trim();
        input.value = email;
        if (!email) {
            invalidEmail('O e-mail é obrigatório.');
            return;
        }
        if (email.length > 150 || !emailPattern.test(email) || !input.validity.valid) {
            invalidEmail('Por favor, insira um e-mail válido.');
            return;
        }

        sending = true;
        button.disabled = true;
        button.textContent = 'Reenviando...';
        form.setAttribute('aria-busy', 'true');
        try {
            const { response, message } = await request(
                API_BASE_URL + '/auth/resend-activation-email?email=' + encodeURIComponent(email), 'POST'
            );
            if (response.ok && message.includes('already verified')) {
                showFeedback(successFeedback, 'Esta conta já foi ativada! ');
                const login = document.createElement('a');
                login.href = 'login.html';
                login.textContent = 'Clique aqui para fazer login.';
                successFeedback.append(login);
            } else if (message.includes('invalid e-mail') || message.includes('invalid email')) {
                invalidEmail('E-mail inválido informado para reenvio.');
            } else if (response.ok) {
                showFeedback(successFeedback, 'Novo link de confirmação reenviado com sucesso! Verifique sua caixa de entrada e a pasta de spam.');
                startCooldown();
            } else if (response.status === 404 || message.includes('not found')) {
                showFeedback(errorFeedback, 'Não encontramos nenhuma conta cadastrada com esse e-mail.');
            } else if (response.status === 429) {
                showFeedback(errorFeedback, 'Muitas tentativas de reenvio. Aguarde um minuto antes de tentar novamente.');
                startCooldown();
            } else {
                showFeedback(errorFeedback, 'Não foi possível reenviar a confirmação no momento. Tente novamente mais tarde.');
            }
        } catch {
            showFeedback(errorFeedback, 'Erro de conexão com o servidor. Tente novamente mais tarde.');
        } finally {
            sending = false;
            form.setAttribute('aria-busy', 'false');
            updateCooldown();
        }
    });

    if (!token) {
        showState('error', 'Link de Confirmação Ausente',
            'Nenhum token de verificação foi encontrado na URL. Caso precise, solicite um novo link abaixo.');
        return;
    }

    try {
        const { response } = await request(
            API_BASE_URL + '/auth/verify?token=' + encodeURIComponent(token), 'GET'
        );
        if (response.ok) {
            showState('success');
        } else if (response.status >= 500 || response.status === 429) {
            showState('error', 'Verificação indisponível',
                'Não foi possível verificar sua conta no momento. Tente novamente mais tarde ou solicite um novo link abaixo.');
        } else {
            showState('error');
        }
    } catch {
        showState('error', 'Erro na Verificação',
            'Erro ao conectar com o servidor. Tente novamente mais tarde ou solicite um novo link abaixo:');
    }
}, { once: true });
