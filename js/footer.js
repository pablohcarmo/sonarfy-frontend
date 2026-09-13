document.addEventListener('DOMContentLoaded', () => {
    const footerHTML = `
        <footer>
            <div class="footer-links">
                <a href="termos.html">Termos</a>
                <span class="separator">&middot;</span>
                <a href="privacidade.html">Privacidade</a>
                <span class="separator">&middot;</span>
                <a href="regulamentos.html">Regulamentos do programa</a>
                <span class="separator">&middot;</span>
                <a href="apoio.html">Apoie o Sonarfy</a>
            </div>
            <div class="copyright">
                &copy; 2026 Sonarfy. Criado por Pablo H. Carmo.
            </div>
        </footer>
    `;

    document.body.insertAdjacentHTML('beforeend', footerHTML);
});