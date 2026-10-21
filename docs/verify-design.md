# Verify Account — referência e verificação

Refatoração em `feature/enhance-verify`, baseada na `main` em `8bafaf5`.
Referência: [Verify Account Page no Figma](https://www.figma.com/design/kgOOkp9lzghCJtlBpSQtIj/Sonarfy?node-id=93-25), consultada via MCP em 21/10/2026.

## Frames consultados

Cada frame foi obtido com `get_design_context`, incluindo seu screenshot.

| Estado | Desktop claro | Desktop escuro | Mobile claro | Mobile escuro |
| --- | --- | --- | --- | --- |
| Verificando e-mail | 102:2012 | 102:2034 | 102:2056 | 102:2082 |
| E-mail confirmado | 102:2108 | 102:2132 | 102:2156 | 102:2184 |
| Link ausente | 102:2212 | 102:2245 | 102:2278 | 102:2315 |
| Link expirado/inválido | 102:2352 | 102:2385 | 102:2418 | 102:2455 |

O fluxo usa `verify.html?token=...`, com e-mail opcional para preencher o reenvio.
Esses frames não apresentam campos de código/OTP.

## Tokens e composição

Os tokens coincidem com os já usados em `css/login.css`, reutilizado sem alterações.
`css/verify.css` acrescenta a superfície específica dos indicadores e do formulário.

| Token | Claro | Escuro |
| --- | --- | --- |
| Fundo | #ffffff | #1a1a1a |
| Card | #ffffff | #242424 |
| Indicador/formulário | #f7f8fa | #2a2a2a |
| Texto principal | #1a1a1a | #ffffff |
| Texto secundário | #65676b | #b2b3b5 |
| Borda do card/header/formulário | #ebecef | #65676b |
| Fundo do input | #ffffff | #1a1a1a |
| Borda do input | #8c8d90 | #8c8d90 |
| Acento | #27a9f5 | #27a9f5 |
| Texto do CTA | #1a1a1a | #1a1a1a |
| Borda do CTA | #1a1a1a | #27a9f5 |

Inter: títulos 700, 32px/1.2 no desktop e 28px/1.2 no mobile;
descrições e inputs 400, 15px/24px; labels 600, 14px/20px;
CTA 600, 15px/20px; links de acesso 600, 14px desktop e 13px mobile;
rodapé 400, 12px/20px.

Card com largura máxima de 560px, padding de 32px desktop/16px mobile,
raio de 16px, sem sombra externa. Em 390px, margens de 24px produzem um card de 342px.
Espaços: 16px entre indicador e introdução, 8px entre título e descrição,
24px entre as seções, 16px no formulário, 24px entre seus campos e ações.
Indicadores de 64px; controles com altura mínima de 48px e raio de 8px.
Header de 88px desktop/80px mobile, padding horizontal de 64px/24px.
Rodapé com gap de 12px, padding de 32px 20px 40px e altura mínima de 124px.
Flexbox/Grid permitem crescimento do conteúdo; nenhuma posição absoluta é usada na página.
Bordas internas preservam as medidas de conteúdo do Auto Layout.

Os quatro SVGs de status foram baixados do Figma em `assets/icons/verify`.
Ícones de tema, retorno e setas reutilizam os assets correspondentes de cadastro/confirmação,
com variantes específicas para cada tema. Dimensões intrínsecas dos SVGs preservadas.
O símbolo da marca é texto em um círculo, conforme o componente Header / Global.
As interações hover/active/focus-visible reutilizam os estados existentes de login;
os frames de Verify consultados especificam a aparência de repouso.

## Comportamento e acessibilidade

HTML semântico com regiões de estado identificadas, `hidden`, labels associados,
feedback em PT-BR, `aria-live`, `aria-busy`, `aria-invalid` e foco no e-mail inválido.
Confirmação e reenvio mantêm os endpoints existentes. O token e o e-mail são codificados na URL.
Reenvios simultâneos são bloqueados; o contador de 60 segundos usa um prazo real,
inclusive quando a aba fica em segundo plano. Requisições têm timeout de 15 segundos.
Respostas de conta já ativada, e-mail inválido, conta ausente, limite de tentativas,
falha de rede e indisponibilidade são tratadas. Mensagens da API não são inseridas como HTML.
O tema reutiliza `login-theme.js` e a preferência `sonarfy_theme`, aplicada antes da pintura.

## Verificação

- `npm test -- --reporter=dot`: 8 arquivos, 76 testes aprovados, incluindo 17 de Verify.
- Microsoft Edge 155.0.4283.45 e Firefox 153.0, ambos em execução headless via Playwright.
- 32 combinações aprovadas: quatro estados × dois temas × dois tamanhos × dois navegadores.
- Desktop 1440×900 (1440×918 nos estados de erro) e mobile 390×900.
- Verificação adicional de overflow em 320×640 nos estados de sucesso/erro, nos dois temas e navegadores.
- Screenshots comparados visualmente com o Figma; fonte Inter carregada e assets visíveis carregados localmente.
- Sem overflow horizontal ou erros de JavaScript nas combinações verificadas.
- Validação de e-mail, feedback de reenvio, bloqueio durante espera e alternância de tema também exercitados nos navegadores.
- Cards renderizados em 560px no desktop e 342px no mobile. Alturas diferem menos de 1px das medidas arredondadas do Figma por causa das métricas fracionárias da fonte.
- `git diff --check`: sem erros de whitespace.

Limitações: respostas da API simuladas; nenhuma conta real foi ativada e nenhum e-mail real foi enviado.
Mobile verificado por viewport, sem dispositivo físico. A fonte Inter continua dependendo do Google Fonts,
como nas páginas já refatoradas. Os destinos institucionais existentes foram preservados;
Termos, Privacidade, Diretrizes e Apoie permanecem fora do escopo e não foram alterados.
