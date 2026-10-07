document.addEventListener('DOMContentLoaded', async () => {
    // Referências aos blocos visuais da tela
    const loadingState = document.getElementById('loading-state');
    const successState = document.getElementById('success-state');
    const errorState = document.getElementById('error-state');
    const errorTitle = document.getElementById('error-title');
    const errorMessageText = document.getElementById('error-message-text');

    // Referências da seção de reenvio
    const verifyResendForm = document.getElementById('verifyResendForm');
    const verifyEmailInput = document.getElementById('verifyEmailInput');
    const btnVerifyResend = document.getElementById('btnVerifyResend');
    const verifyResendError = document.getElementById('verifyResendError');
    const verifyResendSuccess = document.getElementById('verifyResendSuccess');

    const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    let verifyCooldownInterval = null;

    // Extrai parâmetros da URL atual (ex: verify.html?token=123e4567...&email=...)
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const emailParam = urlParams.get('email');

    if (emailParam && verifyEmailInput) {
        verifyEmailInput.value = emailParam.trim();
    }

    function showResendError(msg) {
        if (verifyResendError) {
            verifyResendError.innerText = msg;
            verifyResendError.style.display = 'block';
        }
        if (verifyResendSuccess) {
            verifyResendSuccess.style.display = 'none';
        }
    }

    function showResendSuccess(htmlOrText) {
        if (verifyResendSuccess) {
            verifyResendSuccess.innerHTML = htmlOrText;
            verifyResendSuccess.style.display = 'block';
        }
        if (verifyResendError) {
            verifyResendError.style.display = 'none';
        }
    }

    function clearResendMessages() {
        if (verifyResendError) {
            verifyResendError.style.display = 'none';
            verifyResendError.innerText = '';
        }
        if (verifyResendSuccess) {
            verifyResendSuccess.style.display = 'none';
            verifyResendSuccess.innerHTML = '';
        }
    }

    function startCooldown(button) {
        if (!button) return;
        let seconds = 60;
        button.disabled = true;
        const originalText = 'Reenviar Link de Confirmação';
        button.innerHTML = `<i class="fa-solid fa-clock"></i> Aguarde (${seconds}s)`;

        clearInterval(verifyCooldownInterval);
        verifyCooldownInterval = setInterval(() => {
            seconds--;
            if (seconds > 0) {
                button.innerHTML = `<i class="fa-solid fa-clock"></i> Aguarde (${seconds}s)`;
            } else {
                clearInterval(verifyCooldownInterval);
                button.disabled = false;
                button.innerHTML = originalText;
            }
        }, 1000);
    }

    // Formulário de Reenvio dentro da página de link expirado/erro
    if (verifyResendForm) {
        verifyResendForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            clearResendMessages();

            const email = verifyEmailInput ? verifyEmailInput.value.trim() : '';
            if (!email) {
                showResendError("O e-mail é obrigatório.");
                return;
            }
            if (!EMAIL_REGEX.test(email)) {
                showResendError("Por favor, insira um e-mail válido.");
                return;
            }

            const originalBtnHtml = btnVerifyResend.innerHTML;
            btnVerifyResend.disabled = true;
            btnVerifyResend.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Reenviando...';

            try {
                const response = await fetch(`${API_BASE_URL}/auth/resend-activation-email?email=${encodeURIComponent(email)}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });

                let responseText = '';
                try {
                    const text = await response.text();
                    try {
                        const json = JSON.parse(text);
                        responseText = json.message || json.error || text;
                    } catch {
                        responseText = text;
                    }
                } catch {
                    responseText = '';
                }

                if (response.ok) {
                    if (responseText.toLowerCase().includes('already verified')) {
                        showResendSuccess('Esta conta já foi ativada! <a href="login.html" style="font-weight:600; text-decoration:underline; color:#2e7d32;">Clique aqui para fazer login</a>.');
                        btnVerifyResend.disabled = false;
                        btnVerifyResend.innerHTML = originalBtnHtml;
                    } else if (responseText.toLowerCase().includes('invalid e-mail')) {
                        showResendError("E-mail inválido informado para reenvio.");
                        btnVerifyResend.disabled = false;
                        btnVerifyResend.innerHTML = originalBtnHtml;
                    } else {
                        showResendSuccess('Novo link de confirmação reenviado com sucesso! Verifique sua caixa de entrada e a pasta de spam.');
                        startCooldown(btnVerifyResend);
                    }
                } else {
                    btnVerifyResend.disabled = false;
                    btnVerifyResend.innerHTML = originalBtnHtml;

                    if (response.status === 404 || responseText.toLowerCase().includes('not found')) {
                        showResendError("Não encontramos nenhuma conta cadastrada com esse e-mail.");
                    } else {
                        showResendError("Não foi possível reenviar a confirmação no momento. Tente novamente mais tarde.");
                    }
                }
            } catch (err) {
                console.error("Erro ao reenviar e-mail:", err);
                btnVerifyResend.disabled = false;
                btnVerifyResend.innerHTML = originalBtnHtml;
                showResendError("Erro de conexão com o servidor. Tente novamente mais tarde.");
            }
        });
    }

    // Se o usuário acessar a página direto sem um token na URL
    if (!token) {
        loadingState.style.display = 'none';
        errorState.style.display = 'block';
        if (errorTitle) errorTitle.innerText = "Link de Confirmação Ausente";
        errorMessageText.innerText = "Nenhum token de verificação foi encontrado na URL. Caso precise, solicite um novo link abaixo.";
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/auth/verify?token=${token}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        loadingState.style.display = 'none';

        if (response.ok) {
            // HTTP 200: Token válido e usuário ativado com sucesso!
            successState.style.display = 'block';
        } else {
            // HTTP 400 ou 404: Token expirado ou inválido
            const data = await response.json().catch(() => ({}));
            errorState.style.display = 'block';
            if (errorTitle) errorTitle.innerText = "Link Expirado ou Inválido";
            errorMessageText.innerText = data.message || "O link de confirmação é inválido ou já expirou. Você pode solicitar um novo envio abaixo:";
        }
    } catch (error) {
        console.error("Erro de conexão com a API:", error);
        loadingState.style.display = 'none';
        errorState.style.display = 'block';
        if (errorTitle) errorTitle.innerText = "Erro na Verificação";
        errorMessageText.innerText = "Erro ao conectar com o servidor. Tente novamente mais tarde ou solicite um novo link abaixo:";
    }
});