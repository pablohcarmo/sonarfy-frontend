import { getPostLoginDestination } from './spotify-sync-state.js';
import { clearAccessToken, resolveApiBaseUrl } from './auth-http.js';

const MAX_BCRYPT_PASSWORD_BYTES = 72;

// Calcula o tamanho em bytes UTF-8 sem truncar a senha.
function getUtf8ByteLength(value) {
    return new TextEncoder().encode(value).length;
}

// Configura a alternância acessível de visibilidade para um campo de senha.
function bindPasswordToggle(button, field) {
    if (!button || !field) return;
    button.addEventListener('click', () => {
        const isPassword = field.type === 'password';
        field.type = isPassword ? 'text' : 'password';

        const label = isPassword ? 'Ocultar senha' : 'Mostrar senha';
        button.setAttribute('aria-label', label);
        button.setAttribute('title', label);
        button.setAttribute('aria-pressed', String(isPassword));
    });
}

// Restaura o campo de senha para o modo oculto após limpar seu valor.
function resetPasswordVisibility(button, field) {
    if (!field) return;
    field.value = '';
    field.type = 'password';
    if (!button) return;
    button.setAttribute('aria-label', 'Mostrar senha');
    button.setAttribute('title', 'Mostrar senha');
    button.setAttribute('aria-pressed', 'false');
}

// Atualiza o estado visual e acessível de erro de um campo individual.
function setFieldError(field, message) {
    if (!field) return;
    const hasError = Boolean(message);
    if (hasError) field.setAttribute('aria-invalid', 'true');
    else field.removeAttribute('aria-invalid');
    const feedback = document.getElementById(`${field.id}-error`);
    if (feedback) {
        feedback.textContent = message || '';
        feedback.hidden = !hasError;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const loginField = document.getElementById('loginField');
    const passwordField = document.getElementById('passwordField');
    const btnTogglePassword = document.getElementById('btnTogglePassword');
    const rememberMeCheckbox = document.getElementById('rememberMeCheckbox');
    const btnSubmitLogin = document.getElementById('btnSubmitLogin') || loginForm?.querySelector('button[type="submit"]');
    const errorMessage = document.getElementById('errorMessage');
    const successMessage = document.getElementById('successMessage');

    const btnOpenReactivation = document.getElementById('btnOpenReactivation');
    const reactivationForm = document.getElementById('reactivationForm');
    const reactivationLogin = document.getElementById('reactivationLogin');
    const reactivationPassword = document.getElementById('reactivationPassword');
    const btnToggleReactivationPassword = document.getElementById('btnToggleReactivationPassword');
    const btnSubmitReactivation = document.getElementById('btnSubmitReactivation');
    const btnCancelReactivation = document.getElementById('btnCancelReactivation');
    const reactivationError = document.getElementById('reactivationError');

    const REMEMBER_KEY = 'sonarfy_remember_login';
    let reactivationPending = false;

    // Resolve a URL base da API respeitando API_BASE_URL quando presente.
    const getBaseUrl = () => resolveApiBaseUrl(typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : undefined);

    // 1. Mensagens visuais com acessibilidade
    const showError = (htmlOrText, trustedMarkup = false) => {
        if (!errorMessage) return;
        if (trustedMarkup) errorMessage.innerHTML = htmlOrText;
        else errorMessage.textContent = htmlOrText;
        errorMessage.style.display = 'block';
        if (successMessage) successMessage.style.display = 'none';
    };

    const showSuccess = (text) => {
        if (!successMessage) return;
        successMessage.textContent = text;
        successMessage.style.display = 'block';
        if (errorMessage) errorMessage.style.display = 'none';
    };

    const clearMessages = () => {
        if (errorMessage) {
            errorMessage.style.display = 'none';
            errorMessage.innerHTML = '';
        }
        if (successMessage) {
            successMessage.style.display = 'none';
            successMessage.textContent = '';
        }
    };

    // Exibe mensagem de erro segura na área de reativação.
    const showReactivationError = (text) => {
        if (!reactivationError) return;
        reactivationError.textContent = text;
        reactivationError.style.display = 'block';
    };

    // Limpa mensagens e estados de validação do formulário de reativação.
    const clearReactivationFeedback = () => {
        if (reactivationError) {
            reactivationError.style.display = 'none';
            reactivationError.textContent = '';
        }
        setFieldError(reactivationLogin, '');
        setFieldError(reactivationPassword, '');
    };

    // Alterna entre o formulário de login e o formulário explícito de reativação.
    const openReactivationView = () => {
        if (!loginForm || !reactivationForm) return;
        clearMessages();
        clearReactivationFeedback();
        resetPasswordVisibility(btnToggleReactivationPassword, reactivationPassword);
        const currentLogin = (loginField?.value || '').trim();
        if (reactivationLogin && currentLogin && !reactivationLogin.value.trim()) {
            reactivationLogin.value = currentLogin;
        }
        loginForm.hidden = true;
        reactivationForm.hidden = false;
        const focusTarget = reactivationLogin?.value.trim() ? reactivationPassword : reactivationLogin;
        focusTarget?.focus();
    };

    // Retorna para o formulário de login limpando a senha da reativação.
    const closeReactivationView = ({ focusTarget = btnOpenReactivation } = {}) => {
        if (!loginForm || !reactivationForm) return;
        clearReactivationFeedback();
        resetPasswordVisibility(btnToggleReactivationPassword, reactivationPassword);
        reactivationForm.hidden = true;
        loginForm.hidden = false;
        focusTarget?.focus();
    };

    // Bloqueia ou libera os controles durante a requisição de reativação.
    const setReactivationLoading = (loading) => {
        reactivationPending = loading;
        const controls = [
            btnSubmitReactivation,
            reactivationLogin,
            reactivationPassword,
            btnToggleReactivationPassword,
            btnCancelReactivation
        ];
        controls.forEach(control => {
            if (control) control.disabled = loading;
        });
        if (btnSubmitReactivation) {
            btnSubmitReactivation.textContent = loading ? 'Reativando...' : 'Reativar conta';
        }
        if (reactivationForm) {
            if (loading) reactivationForm.setAttribute('aria-busy', 'true');
            else reactivationForm.removeAttribute('aria-busy');
        }
    };

    // 2. Leitura de parâmetros de URL para feedback contextual (ativação, cadastro ou reset)
    try {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('verified') === 'true') {
            showSuccess('E-mail confirmado com sucesso! Faça login para acessar o Sonarfy.');
        } else if (urlParams.get('registered') === 'true') {
            showSuccess('Cadastro realizado com sucesso! Enviamos um link de confirmação para seu e-mail.');
        } else if (urlParams.get('reset') === 'true') {
            showSuccess('Senha redefinida com sucesso! Faça login com a sua nova senha.');
        }
    } catch {}

    // 3. Restaurar preferência de "Lembrar meu usuário"
    try {
        const savedLogin = localStorage.getItem(REMEMBER_KEY);
        if (savedLogin && loginField) {
            loginField.value = savedLogin;
            if (rememberMeCheckbox) rememberMeCheckbox.checked = true;
        }
    } catch {}

    // 4. Alternar visibilidade da senha (Show/Hide Password)
    bindPasswordToggle(btnTogglePassword, passwordField);
    bindPasswordToggle(btnToggleReactivationPassword, reactivationPassword);

    // 5. Limpar mensagem de erro enquanto o usuário digita
    [loginField, passwordField].forEach(field => {
        if (field) {
            field.addEventListener('input', () => {
                setFieldError(field, '');
                if (errorMessage && errorMessage.style.display !== 'none') {
                    errorMessage.style.display = 'none';
                }
            });
        }
    });

    [reactivationLogin, reactivationPassword].forEach(field => {
        if (field) {
            field.addEventListener('input', () => {
                setFieldError(field, '');
                if (reactivationError && reactivationError.style.display !== 'none') {
                    reactivationError.style.display = 'none';
                }
            });
        }
    });

    if (btnOpenReactivation) {
        btnOpenReactivation.addEventListener('click', openReactivationView);
    }

    if (btnCancelReactivation) {
        btnCancelReactivation.addEventListener('click', () => {
            if (reactivationPending) return;
            closeReactivationView();
        });
    }

    // 6. Submissão do formulário de Login
    if (loginForm) {
        loginForm.addEventListener('submit', async function(event) {
            event.preventDefault();
            if (btnSubmitLogin?.disabled) return;

            const login = (loginField?.value || '').trim();
            const password = passwordField?.value || '';

            if (!login || !password) {
                [[loginField, login, 'Informe seu e-mail ou nome de usuário.'],
                    [passwordField, password, 'Informe sua senha.']].forEach(([field, value, message]) => {
                    setFieldError(field, value ? '' : message);
                });
                showError('Por favor, informe seu e-mail/usuário e senha.');
                (!login ? loginField : passwordField).focus();
                return;
            }

            // Salva ou remove do localStorage conforme o checkbox "Lembrar meu usuário"
            try {
                if (rememberMeCheckbox && rememberMeCheckbox.checked) {
                    localStorage.setItem(REMEMBER_KEY, login);
                } else {
                    localStorage.removeItem(REMEMBER_KEY);
                }
            } catch {}

            // Estado de carregamento
            const originalBtnHtml = btnSubmitLogin ? btnSubmitLogin.innerHTML : 'Entrar';
            if (btnSubmitLogin) {
                btnSubmitLogin.disabled = true;
                btnSubmitLogin.textContent = 'Entrando...';
            }
            loginForm.setAttribute('aria-busy', 'true');
            clearMessages();

            try {
                const baseUrl = getBaseUrl();
                const rememberMe = Boolean(rememberMeCheckbox && rememberMeCheckbox.checked);
                const response = await fetch(`${baseUrl}/auth/login`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Sonarfy-CSRF': '1'
                    },
                    body: JSON.stringify({ login, password, rememberMe })
                });

                let responseData = null;
                let rawText = '';
                try {
                    rawText = await response.text();
                    try {
                        responseData = JSON.parse(rawText);
                    } catch {}
                } catch {}

                if (response.ok) {
                    const token = responseData?.token || responseData?.accessToken;
                    if (token) {
                        localStorage.setItem('sonarfy_token', token);
                    }

                    const targetUrl = getPostLoginDestination();

                    window.location.href = targetUrl;
                } else {
                    if (btnSubmitLogin) {
                        btnSubmitLogin.disabled = false;
                        btnSubmitLogin.innerHTML = originalBtnHtml;
                    }

                    const rawLower = ((responseData?.message || responseData?.error || rawText) + '').toLowerCase();
                    const isUnverifiedAccount =
                        rawLower.includes('not verified') ||
                        rawLower.includes('unverified') ||
                        rawLower.includes('não ativada') ||
                        rawLower.includes('inativa') ||
                        rawLower.includes('ativação pendente');

                    // Caso 1: Conta pendente de ativação (somente quando indicado na resposta)
                    if (isUnverifiedAccount) {
                        showError('Sua conta ainda não foi ativada. <a href="verify.html">Clique aqui para reenviar o link de confirmação</a>.', true);
                    }
                    // Caso 2: Bloqueio de segurança (CSRF ou origem não permitida)
                    else if (response.status === 403) {
                        showError('Requisição de login bloqueada pela verificação de segurança. Verifique o endereço de acesso e tente novamente.');
                    }
                    // Caso 3: Excesso de requisições / Rate Limit
                    else if (response.status === 429) {
                        showError('Muitas tentativas de login. Por favor, aguarde alguns instantes antes de tentar novamente.');
                    }
                    // Caso 4: Credenciais inválidas (401 / 400)
                    else if (response.status === 401 || response.status === 400) {
                        showError('E-mail, usuário ou senha inválidos.');
                    }
                    // Caso 5: Erro interno ou genérico do servidor
                    else {
                        const serverMsg = responseData?.message || responseData?.error;
                        showError(serverMsg || 'Não foi possível realizar o login no momento. Tente novamente mais tarde.');
                    }
                }
            } catch (error) {
                console.error("Erro de conexão com a API:", error);
                if (btnSubmitLogin) {
                    btnSubmitLogin.disabled = false;
                    btnSubmitLogin.innerHTML = originalBtnHtml;
                }
                showError('Erro ao conectar com o servidor. Verifique sua conexão e tente novamente.');
            } finally {
                loginForm.removeAttribute('aria-busy');
            }
        });
    }

    // 7. Submissão da reativação explícita de conta (POST /api/auth/reactivation)
    if (reactivationForm) {
        reactivationForm.addEventListener('submit', async function(event) {
            event.preventDefault();
            if (reactivationPending || btnSubmitReactivation?.disabled) return;

            const login = (reactivationLogin?.value || '').trim();
            const password = reactivationPassword?.value || '';

            if (!login || !password.trim()) {
                setFieldError(reactivationLogin, login ? '' : 'Informe seu e-mail ou nome de usuário.');
                setFieldError(reactivationPassword, password.trim() ? '' : 'Informe sua senha atual.');
                showReactivationError('Por favor, informe seu e-mail/usuário e sua senha atual.');
                (!login ? reactivationLogin : reactivationPassword)?.focus();
                return;
            }

            if (getUtf8ByteLength(password) > MAX_BCRYPT_PASSWORD_BYTES) {
                setFieldError(reactivationPassword, 'A senha excede o limite de 72 bytes em UTF-8.');
                showReactivationError('A senha informada excede o limite permitido de 72 bytes em UTF-8.');
                reactivationPassword?.focus();
                return;
            }

            clearReactivationFeedback();
            setReactivationLoading(true);

            try {
                const response = await fetch(`${getBaseUrl()}/auth/reactivation`, {
                    method: 'POST',
                    credentials: 'omit',
                    cache: 'no-store',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Sonarfy-CSRF': '1'
                    },
                    body: JSON.stringify({ login, password })
                });

                if (response.status === 204) {
                    clearAccessToken();
                    resetPasswordVisibility(btnTogglePassword, passwordField);
                    if (loginField) loginField.value = login;
                    closeReactivationView({ focusTarget: passwordField || loginField });
                    showSuccess('Conta reativada com sucesso! A reativação não inicia sessão automaticamente. Entre agora com seu e-mail ou nome de usuário e sua senha.');
                    return;
                }

                if (response.status === 401) {
                    showReactivationError('Credenciais inválidas ou não foi possível reativar a conta. Verifique os dados informados e tente novamente.');
                } else if (response.status === 403) {
                    showReactivationError('Requisição de reativação bloqueada pela verificação de segurança. Verifique o endereço de acesso e tente novamente.');
                } else if (response.status === 400) {
                    showReactivationError('Dados inválidos. Informe seu e-mail ou nome de usuário e sua senha atual.');
                } else if (response.status === 429) {
                    showReactivationError('Muitas tentativas de reativação. Aguarde alguns instantes antes de tentar novamente.');
                } else {
                    showReactivationError('Não foi possível reativar a conta no momento. Tente novamente mais tarde.');
                }
            } catch {
                showReactivationError('Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.');
            } finally {
                setReactivationLoading(false);
            }
        });
    }
});
