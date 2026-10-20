// Apply the saved theme before paint, using the existing site-wide preference.
(() => {
    const root = document.documentElement;
    try {
        root.dataset.theme = localStorage.getItem('sonarfy_theme') === 'dark' ? 'dark' : 'light';
    } catch {
        root.dataset.theme = 'light';
    }
    document.addEventListener('DOMContentLoaded', () => {
        const toggle = document.getElementById('theme-toggle');
        if (!toggle) return;
        const updateButton = () => {
            const dark = root.dataset.theme === 'dark';
            toggle.setAttribute('aria-pressed', String(dark));
            toggle.setAttribute('aria-label', dark ? 'Ativar tema claro' : 'Ativar tema escuro');
        };
        updateButton();
        toggle.addEventListener('click', () => {
            root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
            try { localStorage.setItem('sonarfy_theme', root.dataset.theme); } catch {}
            updateButton();
        });
    });
})();
