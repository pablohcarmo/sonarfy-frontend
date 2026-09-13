document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const errorMessage = document.getElementById('errorMessage');

    if (loginForm) {
        loginForm.addEventListener('submit', async function(event) {
            event.preventDefault();

            const payload = {
                login: document.getElementById('loginField').value,
                password: document.getElementById('passwordField').value
            };

            try {
                // As crases (backticks) ativam a leitura da variável API_BASE_URL
                const response = await fetch(`${API_BASE_URL}/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (response.ok) {
                    const data = await response.json();
                    localStorage.setItem('sonarfy_token', data.token); // Guarda o JWT[cite: 1, 4]
                    window.location.href = 'feed.html';
                } else {
                    errorMessage.style.display = 'block';
                    errorMessage.innerText = 'E-mail, usuário ou senha inválidos.';
                }
            } catch (error) {
                console.error("Erro de conexão com a API:", error);
                errorMessage.style.display = 'block';
                errorMessage.innerText = 'Erro ao conectar com o servidor. Tente novamente.';
            }
        });
    }
});