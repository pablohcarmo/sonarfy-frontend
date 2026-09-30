document.addEventListener('DOMContentLoaded', () => {
    // 1. Injeção do Rodapé Universal
    renderFooter();

    // 2. Lógica de Segurança do Logotipo
    initLogoFallback();

    // 3. Inicialização do Modo Noturno
    initTheme();

    // 4. Travas Globais de Caracteres (Aplicado a todo o sistema)
    initGlobalValidations();
});

function initGlobalValidations() {
    // REGRA 1: Bloqueia Emojis em todos os inputs de texto, email e senha
    const emojiRegex = /[\p{Extended_Pictographic}\p{Emoji_Presentation}]/gu;
    const allInputs = document.querySelectorAll('input[type="text"], input[type="password"], input[type="email"]');

    allInputs.forEach(input => {
        input.addEventListener('input', function() {
            if (emojiRegex.test(this.value)) {
                this.value = this.value.replace(emojiRegex, '');
            }
        });
    });

    // REGRA 2: Bloqueia caracteres inválidos nos campos de Nome e Sobrenome (permite apenas letras, espaços, apóstrofos e hífens)
    const nameAllowedCharRegex = /[^A-Za-zÀ-ÖØ-öø-ÿ'’\-\s]/g;
    const nameFields = document.querySelectorAll('#nameField, #surnameField');

    nameFields.forEach(field => {
        field.addEventListener('input', function() {
            if (nameAllowedCharRegex.test(this.value)) {
                this.value = this.value.replace(nameAllowedCharRegex, '');
            }
        });
    });

    // REGRA 3: Formata o Usuário/Handle (Bloqueia @, espaços, etc., e força minúsculas)
    const handleRegex = /[^a-zA-Z0-9_.\-]/g;
    const handleFields = document.querySelectorAll('#handleField');

    handleFields.forEach(field => {
        field.addEventListener('input', function() {
            if (handleRegex.test(this.value)) {
                this.value = this.value.replace(handleRegex, '');
            }
            this.value = this.value.toLowerCase();
        });
    });
}

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
                &copy; 2026 Sonarfy. Criado por Pablo H. Carmo.
            </div>
        </footer>
    `;
    document.body.insertAdjacentHTML('beforeend', footerHTML);
}

function initLogoFallback() {
    const logoContainers = document.querySelectorAll('.logo-container');
    logoContainers.forEach(container => {
        const logos = container.querySelectorAll('.logo-img');
        const fallbackIcon = container.querySelector('.logo-icon-fallback');
        const fallbackText = container.querySelector('.logo-fallback-text');

        if (!logos.length) return;

        let failedCount = 0;

        logos.forEach(logo => {
            logo.addEventListener('error', function() {
                this.classList.add('logo-error');
                failedCount++;
                if (failedCount >= logos.length) {
                    container.classList.add('is-fallback');
                    if (fallbackIcon) fallbackIcon.style.display = 'inline-block';
                    if (fallbackText) fallbackText.style.display = 'inline';
                }
            });

            logo.addEventListener('load', function() {
                this.classList.remove('logo-error');
                container.classList.remove('is-fallback');
                if (fallbackIcon) fallbackIcon.style.display = 'none';
                if (fallbackText) fallbackText.style.display = 'none';
            });

            // Se a imagem já foi carregada da memória/cache
            if (logo.complete && logo.naturalHeight !== 0) {
                container.classList.remove('is-fallback');
                if (fallbackIcon) fallbackIcon.style.display = 'none';
                if (fallbackText) fallbackText.style.display = 'none';
            }
        });
    });
}

function initTheme() {
    const body = document.body;
    const currentTheme = localStorage.getItem('sonarfy_theme');
    const themeToggleBtn = document.getElementById('theme-toggle');
    const themeIcon = themeToggleBtn ? themeToggleBtn.querySelector('i') : null;

    if (currentTheme === 'dark') {
        body.classList.add('dark-mode');
        if (themeIcon) themeIcon.classList.replace('fa-moon', 'fa-sun');
    }

    if (!themeToggleBtn) return;

    themeToggleBtn.addEventListener('click', () => {
        body.classList.toggle('dark-mode');

        if (body.classList.contains('dark-mode')) {
            localStorage.setItem('sonarfy_theme', 'dark');
            if (themeIcon) themeIcon.classList.replace('fa-moon', 'fa-sun');
        } else {
            localStorage.setItem('sonarfy_theme', 'light');
            if (themeIcon) themeIcon.classList.replace('fa-sun', 'fa-moon');
        }
    });
}