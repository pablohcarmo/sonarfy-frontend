# Sonarfy — Frontend

Frontend em HTML5, CSS3 e JavaScript, com interface atual em português brasileiro e suporte a temas claro e escuro.

## Desenvolvimento local

```sh
npm ci
npm test
python -m http.server 4173 --bind 127.0.0.1
```

- Home: `http://127.0.0.1:4173/`
- Login: `http://127.0.0.1:4173/pages/login.html`
- Cadastro: `http://127.0.0.1:4173/pages/register.html`
- Prévia da confirmação, sem cadastro: `http://127.0.0.1:4173/preview/confirmation.html`

A prévia utiliza ações simuladas e não envia e-mails. O cadastro real depende da API configurada em `js/api.js` e da configuração local de cidades em `js/env.js`.

## Cadastro e confirmação

A página de cadastro usa `pages/register.html`. Os links da Home, login, verificação e prévia apontam para esse endereço. O endereço antigo `pages/cadastro.html` redireciona para a nova página, preservando query string e fragmento quando JavaScript está disponível. Sem JavaScript, há um redirecionamento simples e um link de fallback.

Os nomes internos `css/cadastro.css`, `js/cadastro.js` e dos testes existentes foram mantidos: eles não determinam a URL pública nem o idioma apresentado.

As verificações de interface e suas limitações estão em [Cadastro](docs/register-qa/README.md) e [Confirmação de e-mail](docs/confirmation-qa/README.md). Os scripts em `tests/browser/` verificam Firefox e Microsoft Edge, desktop/mobile e claro/escuro, usando uma instalação de Playwright fornecida pelo ambiente de desenvolvimento.

## Implementação futura: idiomas e URLs

**Decisão:** usar um prefixo de idioma e manter os nomes das rotas em inglês. O idioma do conteúdo será definido pelo prefixo, sem duplicar o layout e a lógica de cada página.

| Página | Português brasileiro | Inglês | Espanhol |
| --- | --- | --- | --- |
| Início | `/pt-br/` | `/en/` | `/es/` |
| Cadastro | `/pt-br/register` | `/en/register` | `/es/register` |
| Login | `/pt-br/login` | `/en/login` | `/es/login` |

Essa estrutura é um plano; as traduções, o seletor de idiomas e as rotas públicas acima ainda não estão implementados. Hoje o acesso estático continua usando `/pages/register.html`, com conteúdo em PT-BR. O domínio `sonarfy.com/register` dependerá das regras da hospedagem, que não estão configuradas neste repositório.

Trabalho futuro:

- Configurar as rotas sem `.html` e os prefixos de idioma na hospedagem/roteamento, com acesso direto e recarregamento funcionando.
- Extrair textos para arquivos de tradução compartilhando o mesmo HTML, CSS e JavaScript; contemplar mensagens de validação, feedback, títulos e rótulos acessíveis.
- Atualizar o atributo `lang` do HTML conforme o idioma, usando `pt-BR`, `en` e `es`.
- Adicionar um seletor que preserve a página equivalente ao trocar de idioma, com preferência do usuário salva e respeito à escolha explícita na URL.
- Relacionar versões públicas indexáveis com `hreflang` e definir URLs canônicas por idioma.
- Configurar redirecionamentos permanentes dos endereços antigos quando as rotas públicas estiverem disponíveis.
- Validar cada idioma em Firefox e Edge, desktop/mobile e claro/escuro, incluindo textos maiores e ausência de overflow.
