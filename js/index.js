document.addEventListener('DOMContentLoaded', () => {
    // Tratamento de falha no carregamento do logotipo do Sonarfy
    const logoImg = document.getElementById('main-logo');
    const fallbackIcon = document.getElementById('fallback-icon');

    // Se a imagem não for encontrada, exibe o ícone FontAwesome
    logoImg.addEventListener('error', function() {
        logoImg.style.display = 'none';
        fallbackIcon.style.display = 'block';
    });

    // Se a imagem for carregada com sucesso, exibe a imagem e oculta o ícone
    logoImg.addEventListener('load', function() {
        logoImg.style.display = 'block';
        fallbackIcon.style.display = 'none';
    });
});