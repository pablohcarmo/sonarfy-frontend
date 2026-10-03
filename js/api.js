  const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    //? 'http://localhost:8080/api'
    ? 'http://localhost:8081/api' // Porta 8080 em uso pelo Adminer do banco de dados
    : 'https://api.sonarfy.com/api'; // Substitua pelo domínio real no futuro