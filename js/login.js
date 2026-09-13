document.getElementById('loginForm').addEventListener('submit', async function(event) {
    event.preventDefault();

    const payload = {
        login: document.getElementById('loginField').value,
        password: document.getElementById('passwordField').value
    };

    try {
        // Rota configurada para o AuthController Stateless[cite: 2, 8]
        const response = await fetch('http://localhost:8080/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            const data = await response.json();
            localStorage.setItem('sonarfy_token', data.token); // Salva o JWT no navegador[cite: 2]
            window.location.href = 'feed.html';
        } else {
            document.getElementById('errorMessage').style.display = 'block';
        }
    } catch (error) {
        console.error("Erro de conexão", error);
        document.getElementById('errorMessage').innerText = "Erro ao conectar com o servidor.";
        document.getElementById('errorMessage').style.display = 'block';
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const errorMessage = document.getElementById('errorMessage');

    if (loginForm) {
        loginForm.addEventListener('submit', async function(event) {
            event.preventDefault(); // Impede o recarregamento clássico da página HTML

            // Monta o JSON alinhado com o seu LoginDto no backend[cite: 5]
            const payload = {
                login: document.getElementById('loginField').value,
                password: document.getElementById('passwordField').value
            };

            try {
                // Dispara a requisição POST para o seu AuthController
                const response = await fetch('http://localhost:8080/api/auth/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });

                if (response.ok) {
                    const data = await response.json();

                    // Como a API é Stateless, salvamos o Token no navegador do usuário[cite: 1, 2]
                    localStorage.setItem('sonarfy_token', data.token);

                    // Redireciona o usuário logado para o feed principal[cite: 1]
                    window.location.href = 'feed.html';
                } else {
                    // Exibe o alerta visual caso as credenciais não batam com o banco
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