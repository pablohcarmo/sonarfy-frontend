document.addEventListener('DOMContentLoaded', async () => {
    // Referências aos blocos visuais da tela
    const loadingState = document.getElementById('loading-state');
    const successState = document.getElementById('success-state');
    const errorState = document.getElementById('error-state');
    const errorMessageText = document.getElementById('error-message-text');

    // Extrai o parâmetro "token" da URL atual (ex: verify.html?token=123e4567...)
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');

    // Se a pessoa acessar a página direto sem um token na URL
    if (!token) {
        loadingState.style.display = 'none';
        errorState.style.display = 'block';
        errorMessageText.innerText = "Nenhum token de verificação foi encontrado na URL.";
        return;
    }

    try {
        // Dispara a requisição GET para o endpoint de verificação do seu Spring Boot[cite: 1, 3]
        // Substitua '/auth/verify' pela rota exata que você criar no seu AuthController
        const response = await fetch(`${API_BASE_URL}/auth/verify?token=${token}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        // Esconde o spinner de carregamento independentemente do resultado
        loadingState.style.display = 'none';

        if (response.ok) {
            // HTTP 200: Token válido e usuário ativado com sucesso!
            successState.style.display = 'block';
        } else {
            // HTTP 400 ou 404: Token expirado ou inválido
            const data = await response.json().catch(() => ({}));
            errorState.style.display = 'block';
            errorMessageText.innerText = data.message || "O link de confirmação é inválido ou já expirou.";
        }
    } catch (error) {
        console.error("Erro de conexão com a API:", error);
        loadingState.style.display = 'none';
        errorState.style.display = 'block';
        errorMessageText.innerText = "Erro ao conectar com o servidor. Tente novamente mais tarde.";
    }
});