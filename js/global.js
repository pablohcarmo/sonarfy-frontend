document.addEventListener('DOMContentLoaded', () => {

    // 1. Injeção do Rodapé Universal
    renderFooter();

    // 2. Lógica de Segurança do Logotipo
    initLogoFallback();

    // 3. Inicialização do Modo Noturno (Se não estiver importado como script isolado)
    initTheme();
});

function renderFooter() {
    const footerHTML = `
        <footer>
            <div class="footer-links">
                <a href="/pages/termos.html">Termos</a>
                <span class="separator">&middot;</span>
                <a href="/pages/privacidade.html">Privacidade</a>
                <span class="separator">&middot;</span>
                <a href="/pages/regulamentos.html">Regulamentos do programa</a>
                <span class="separator">&middot;</span>
                <a href="/pages/apoio.html">Apoie o Sonarfy</a>
            </div>
            <div class="copyright">
                &copy; 2026 Sonarfy. Criado por Pablo Carmo.
            </div>
        </footer>
    `;

    // Anexa o rodapé no final do body
    document.body.insertAdjacentHTML('beforeend', footerHTML);
}

function initLogoFallback() {
    // Tratamento de falha no carregamento do logotipo do Sonarfy
    const logoImg = document.getElementById('main-logo');
    const fallbackIcon = document.getElementById('fallback-icon');

    // Retorna cedo se a página atual não tiver o logotipo no cabeçalho
    if (!logoImg || !fallbackIcon) return;

    // Se a imagem não for encontrada, exibe o ícone FontAwesome
    logoImg.addEventListener('error', function() {
        logoImg.style.display = 'none';
        fallbackIcon.style.display = 'block';
    });

    // Se a imagem carregar, oculta o ícone
    logoImg.addEventListener('load', function() {
        logoImg.style.display = 'block';
        fallbackIcon.style.display = 'none';
    });
}

function initTheme() {
    const themeToggleBtn = document.getElementById('theme-toggle');
    if (!themeToggleBtn) return;

    const themeIcon = themeToggleBtn.querySelector('i');
    const body = document.body;

    const currentTheme = localStorage.getItem('sonarfy_theme');
    if (currentTheme === 'dark') {
        body.classList.add('dark-mode');
        themeIcon.classList.replace('fa-moon', 'fa-sun');
    }

    themeToggleBtn.addEventListener('click', () => {
        body.classList.toggle('dark-mode');

        if (body.classList.contains('dark-mode')) {
            localStorage.setItem('sonarfy_theme', 'dark');
            themeIcon.classList.replace('fa-moon', 'fa-sun');
        } else {
            localStorage.setItem('sonarfy_theme', 'light');
            themeIcon.classList.replace('fa-sun', 'fa-moon');
        }
    });
}