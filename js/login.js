document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const loginField = document.getElementById('loginField');
    const passwordField = document.getElementById('passwordField');
    const btnTogglePassword = document.getElementById('btnTogglePassword');
    const rememberMeCheckbox = document.getElementById('rememberMeCheckbox');
    const btnSubmitLogin = document.getElementById('btnSubmitLogin') || loginForm?.querySelector('button[type="submit"]');
    const errorMessage = document.getElementById('errorMessage');
    const successMessage = document.getElementById('successMessage');

    const REMEMBER_KEY = 'sonarfy_remember_login';

    // 1. Mensagens visuais com acessibilidade
    const showError = (htmlOrText) => {
        if (!errorMessage) return;
        errorMessage.innerHTML = htmlOrText;
        errorMessage.style.display = 'block';
        if (successMessage) successMessage.style.display = 'none';
    };

    const showSuccess = (htmlOrText) => {
        if (!successMessage) return;
        successMessage.innerHTML = htmlOrText;
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
            successMessage.innerHTML = '';
        }
    };

    // 2. Leitura de parâmetros de URL para feedback contextual (ativação, cadastro ou reset)
    try {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('verified') === 'true') {
            showSuccess('<i class="fa-solid fa-circle-check"></i> E-mail confirmado com sucesso! Faça login para acessar o Sonarfy.');
        } else if (urlParams.get('registered') === 'true') {
            showSuccess('<i class="fa-solid fa-envelope-circle-check"></i> Cadastro realizado com sucesso! Enviamos um link de confirmação para seu e-mail.');
        } else if (urlParams.get('reset') === 'true') {
            showSuccess('<i class="fa-solid fa-circle-check"></i> Senha redefinida com sucesso! Faça login com a sua nova senha.');
        }
    } catch {}

    // 3. Restaurar preferência de "Lembrar meu usuário"
    try {
        const savedLogin = localStorage.getItem(REMEMBER_KEY);
        if (savedLogin && loginField) {
            loginField.value = savedLogin;
            if (rememberMeCheckbox) rememberMeCheckbox.checked = true;
            if (passwordField) passwordField.focus();
        } else if (loginField) {
            loginField.focus();
        }
    } catch {}

    // 4. Alternar visibilidade da senha (Show/Hide Password)
    if (btnTogglePassword && passwordField) {
        btnTogglePassword.addEventListener('click', () => {
            const isPassword = passwordField.type === 'password';
            passwordField.type = isPassword ? 'text' : 'password';

            const icon = btnTogglePassword.querySelector('i');
            if (icon) {
                icon.className = isPassword ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
            }

            const label = isPassword ? 'Ocultar senha' : 'Mostrar senha';
            btnTogglePassword.setAttribute('aria-label', label);
            btnTogglePassword.setAttribute('title', label);
        });
    }

    // 5. Limpar mensagem de erro enquanto o usuário digita
    [loginField, passwordField].forEach(field => {
        if (field) {
            field.addEventListener('input', () => {
                if (errorMessage && errorMessage.style.display !== 'none') {
                    errorMessage.style.display = 'none';
                }
            });
        }
    });

    // 6. Submissão do formulário de Login
    if (loginForm) {
        loginForm.addEventListener('submit', async function(event) {
            event.preventDefault();

            const login = (loginField?.value || '').trim();
            const password = passwordField?.value || '';

            if (!login || !password) {
                showError('Por favor, informe seu e-mail/usuário e senha.');
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
            const originalBtnHtml = btnSubmitLogin ? btnSubmitLogin.innerHTML : 'Entrar no Sonarfy';
            if (btnSubmitLogin) {
                btnSubmitLogin.disabled = true;
                btnSubmitLogin.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Entrando...';
            }
            clearMessages();

            try {
                const baseUrl = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : 'http://localhost:8081/api';
                const response = await fetch(`${baseUrl}/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ login, password })
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

                    // Redirecionamento seguro caso haja query param 'redirect'
                    let targetUrl = 'feed.html';
                    try {
                        const urlParams = new URLSearchParams(window.location.search);
                        const redirectParam = urlParams.get('redirect');
                        if (redirectParam && !redirectParam.startsWith('http://') && !redirectParam.startsWith('https://') && !redirectParam.startsWith('//')) {
                            targetUrl = redirectParam;
                        }
                    } catch {}

                    window.location.href = targetUrl;
                } else {
                    if (btnSubmitLogin) {
                        btnSubmitLogin.disabled = false;
                        btnSubmitLogin.innerHTML = originalBtnHtml;
                    }

                    const rawLower = ((responseData?.message || responseData?.error || rawText) + '').toLowerCase();

                    // Caso 1: Conta pendente de ativação
                    if (
                        response.status === 403 ||
                        rawLower.includes('not verified') ||
                        rawLower.includes('unverified') ||
                        rawLower.includes('não ativada') ||
                        rawLower.includes('inativa') ||
                        rawLower.includes('ativação pendente')
                    ) {
                        showError('Sua conta ainda não foi ativada. <a href="verify.html" style="font-weight:600; text-decoration:underline;">Clique aqui para reenviar o link de confirmação</a>.');
                    }
                    // Caso 2: Excesso de requisições / Rate Limit
                    else if (response.status === 429) {
                        showError('Muitas tentativas de login. Por favor, aguarde alguns instantes antes de tentar novamente.');
                    }
                    // Caso 3: Credenciais inválidas (401 / 400)
                    else if (response.status === 401 || response.status === 400) {
                        showError('E-mail, usuário ou senha inválidos.');
                    }
                    // Caso 4: Erro interno ou genérico do servidor
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
            }
        });
    }
});