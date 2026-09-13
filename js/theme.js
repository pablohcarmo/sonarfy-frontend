document.addEventListener('DOMContentLoaded', () => {
    const themeToggleBtn = document.getElementById('theme-toggle');

    if (!themeToggleBtn) return; // Evita erros se o botão não existir na página

    const themeIcon = themeToggleBtn.querySelector('i');
    const body = document.body;

    // 1. Verifica se o usuário já havia escolhido o modo escuro antes
    const currentTheme = localStorage.getItem('sonarfy_theme');
    if (currentTheme === 'dark') {
        body.classList.add('dark-mode');
        themeIcon.classList.replace('fa-moon', 'fa-sun');
    }

    // 2. Alterna o tema ao clicar no botão
    themeToggleBtn.addEventListener('click', () => {
        body.classList.toggle('dark-mode');

        // Se a classe dark-mode foi adicionada, salva a preferência e troca o ícone
        if (body.classList.contains('dark-mode')) {
            localStorage.setItem('sonarfy_theme', 'dark');
            themeIcon.classList.replace('fa-moon', 'fa-sun');
        } else {
            // Caso contrário, volta para o modo claro
            localStorage.setItem('sonarfy_theme', 'light');
            themeIcon.classList.replace('fa-sun', 'fa-moon');
        }
    });
});