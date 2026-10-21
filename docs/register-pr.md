# Refatora cadastro e confirmação conforme Figma e padroniza o endereço register

O cadastro e a confirmação de e-mail apresentavam diferenças em relação ao Figma e dependiam de markup e estilos pouco adequados ao layout responsivo. Esta alteração alinha os dois fluxos ao design e passa a usar `pages/register.html` como endereço principal do cadastro, mantendo a interface em português.

## Alterações

- Refatora o cadastro com HTML semântico, Flexbox e Grid, temas claro/escuro e os tokens e SVGs oficiais do Figma.
- Corrige o header com “Início”, o rótulo “Usuário” e os recortes dos ícones.
- Implementa autocomplete de cidades com navegação por teclado, debounce, cancelamento e descarte de respostas antigas.
- Valida a senha e sua confirmação em tempo real, usando círculos vazados para requisitos pendentes e preenchidos de verde para os atendidos.
- Reorganiza a confirmação “Quase lá!” como estado de página inteira, com e-mail editável, reenvio, cooldown de 30 segundos, feedback acessível e retorno ao formulário.
- Impede envios duplicados e remove o log que expunha o payload de cadastro no console.
- Adiciona `preview/confirmation.html` para conferir a confirmação sem cadastro, com ações simuladas e sem chamadas à API.
- Atualiza Home, login, verificação, prévia e testes para `pages/register.html`. O endereço anterior `pages/cadastro.html` redireciona para o novo, preservando query string e fragmento com JavaScript; inclui fallback sem JavaScript.
- Registra no README a implementação futura de URLs com prefixo de idioma e nomes de rota em inglês: `/pt-br/register`, `/en/register` e `/es/register`.

## Validação

- `npm test`: **63 testes passaram**.
- Firefox 153 e Microsoft Edge 155, em desktop de 1440px e mobile de 390px, nos temas claro e escuro.
- Verificados cadastro, requisitos de senha, autocomplete, confirmação, edição de endereço, cooldown, erros de reenvio, retorno ao formulário e prévia sem API.
- Verificado o endereço legado com redirecionamento e preservação dos parâmetros e fragmento.
- `git diff --check` sem erros.
- Scripts, relatórios e capturas em `tests/browser/`, `docs/register-qa/` e `docs/confirmation-qa/`.

## Limitações e trabalho futuro

- A interface permanece somente em PT-BR. Traduções, seletor de idioma, prefixos de locale e regras de hospedagem para URLs sem `.html` são trabalho futuro.
- Mobile foi verificado por viewport, sem dispositivo físico.
- As chamadas de backend/cidades foram simuladas nos testes de navegador; entrega de e-mails e ativação real não foram verificadas.
- O Figma da confirmação utiliza um link de ativação, sem OTP. O processamento desse token em `verify.html` não foi refatorado; apenas seu link para o cadastro foi atualizado.
