# Referências do Figma — Sonarfy

Este documento reúne os links, frames e especificações visuais do Sonarfy, organizados por página.

Feed: [nós, componentes, adapter e verificação](feed-page.md), referência
[Feed Page](https://www.figma.com/design/kgOOkp9lzghCJtlBpSQtIj/Sonarfy?node-id=406-11862).

Ecos: [nós, componentes, adapter e verificação](ecos-page.md), referência
[Ecos Page](https://www.figma.com/design/kgOOkp9lzghCJtlBpSQtIj/Sonarfy?node-id=543-2).

Página do Álbum: [nós, componentes, adapter e verificação](album-page.md), referência
[Album Page](https://www.figma.com/design/kgOOkp9lzghCJtlBpSQtIj/Sonarfy?node-id=547-2).

Avaliar Álbum: [nós, componentes, adapter e verificação](album-review-page.md), referência
[Avaliar Álbum Page](https://www.figma.com/design/kgOOkp9lzghCJtlBpSQtIj/Sonarfy?node-id=573-150).

Configurações da Conta: [nós, componentes, adapter, modais e verificação](account-page.md), referência
[Settings Page](https://www.figma.com/design/kgOOkp9lzghCJtlBpSQtIj/Sonarfy?node-id=427-31281).

Perfis próprio e visitante: [inspeção, componentes e adaptações](profile-page.md#referência-visual-e-adaptações).
Referências: [Profile Page](https://www.figma.com/design/kgOOkp9lzghCJtlBpSQtIj/Sonarfy?node-id=210-2)
e [Profile Page (Friend)](https://www.figma.com/design/kgOOkp9lzghCJtlBpSQtIj/Sonarfy?node-id=385-6710).

- [Home / Index](#home-index)
- [Login](#login)
- [Cadastro / Register](#cadastro-register)
- [Confirmação de e-mail](#confirmacao-email)
- [Verify Account](#verify-account)
- [Spotify Sync](#spotify-sync)
- [Logout](#logout)

Os valores correspondem aos frames de referência. As instruções de uso e testes estão nos documentos de cada página.

<a id="home-index"></a>
## Home / Index

Referência: https://www.figma.com/design/kgOOkp9lzghCJtlBpSQtIj/Sonarfy?node-id=66-2

### Inspeção pelo Figma MCP

Foram recuperados o contexto de design e as capturas dos quatro frames:

| Frame | Nó | Referência |
| --- | --- | --- |
| Home – Tema Claro / Desktop | 70:559 | 1440 × 1778 |
| Home – Tema Claro / Mobile | 70:602 | 390 × 2414 |
| Home – Tema Escuro / Desktop | 70:645 | 1440 × 1778 |
| Home – Tema Escuro / Mobile | 70:688 | 390 × 2414 |

Os frames atualizados contêm Header / Global (187:548), hero, a seção
“Sobre o Sonarfy / Como Funciona” e Footer / Global (175:216).
O cabeçalho contém marca, controle de tema e “Entrar” nos dois tamanhos,
com destino à página local pages/login.html. Não há menu expansível.

O MCP não retornou variáveis vinculadas para a seção (70:771). Os tokens CSS
foram extraídos dos valores efetivos dos frames: branco/#1a1a1a para fundo;
#1a1a1a/branco para texto; #65676b/#b2b3b5 para texto secundário;
#ebecef/#65676b para a linha do header; #8c8d90 para a borda secundária;
#27a9f5 para destaque. Inter 400/500/600/700 e 600 itálico; título
56px desktop/36px mobile, entrelinha 1.12; descrição 18px/16px,
entrelinha 1.6; botões 14px/600; rodapé 12px/20px.

Espaçamento principal: 8/16/24/32/48px; botões com raio 8px e mínimo
48px de altura. Sem sombras decorativas no design. As bordas internas
preservam as dimensões de conteúdo do Auto Layout. Os mínimos verticais
de hero e footer seguem os frames, mas podem crescer com o conteúdo.


### Seção explicativa

Contextos e screenshots dos quatro frames foram recuperados novamente via
Figma MCP. Nós das seções: 224:253, 224:293, 224:333, 224:373.

- Introdução com chamada “CONHEÇA A PLATAFORMA” em 12px/16px/600,
  H2 em 36px/40px/700 desktop e 28px/32px/700 mobile, descrição em
  16px/24px/400. Largura máxima 800px, gap interno 16px.
- Seção com padding 96px vertical e 64px horizontal no desktop;
  64px vertical e 24px horizontal no mobile. Gap 48px/32px.
- Grid com largura máxima 1200px, três colunas iguais no desktop,
  uma coluna abaixo de 1024px, gap 24px.
- Cards com padding 24px, gap 24px, raio 8px e borda 1px
  #8c8d90 no claro/#65676b no escuro. Mínimo 280px desktop/256px
  mobile, crescimento natural pelo conteúdo. Títulos H3 18px/24px/600,
  descrição 16px/24px/400 e gap de 8px.
- Ícones oficiais em contêineres de 48px com borda e raio 8px.
- Convite final com padding 32px, gap 24px, borda 1px, raio 8px,
  título 24px/32px/700 e CTA de 48px, largura total no mobile.
- Tokens anteriores preservados; adicionados --feature-border,
  --space-8 (64px) e --space-12 (96px).
- Rodapé preservado e último elemento do body, no fluxo normal.



<a id="login"></a>
## Login

Reference: [Figma Login page](https://www.figma.com/design/kgOOkp9lzghCJtlBpSQtIj/Sonarfy?node-id=75-20).

Inspected with Figma MCP: Light Desktop `84:328`, Light Mobile `84:370`, Dark Desktop `84:411`, Dark Mobile `84:453`. The context includes Header / Global `187:548` and Footer / Global `175:216`.

`get_variable_defs` returned no published variables for the Login section. CSS custom properties therefore use the exact resolved frame colors from `get_design_context`:

| Token | Light | Dark |
| --- | --- | --- |
| Page/input | #ffffff | #1a1a1a |
| Card | #ffffff | #242424 |
| Primary text | #1a1a1a | #ffffff |
| Secondary text | #65676b | #b2b3b5 |
| Card/header border | #ebecef | #65676b |
| Input/checkbox border | #8c8d90 | #8c8d90 |
| Accent | #27a9f5 | #27a9f5 |
| CTA text | #1a1a1a | #1a1a1a |
| CTA border | #1a1a1a | #27a9f5 |

Inter: heading 700, 32px/1.2 desktop and 28px/1.2 mobile; description 400, 15px/24px; labels 600, 14px/20px; inputs 400, 15px/24px desktop and 14px/24px mobile; options 13px/24px desktop and 12px/24px mobile; CTA 600, 15px/normal; account link 14px/24px; footer 12px/20px. The header mark is styled text and a circle in Figma; it is now exported as a complete SVG in `assets/logos/`.

Card: maximum 480px, 32px desktop padding; mobile outer margins/padding 24px, producing a 342px card at 390px. Sections and credentials use 24px gaps; labels use 8px gaps. Card radius 16px, controls 8px, checkbox 4px. No card shadow exists in these frames. Inset borders preserve Figma's content dimensions. Header height is 88px desktop / 80px mobile; footer minimum height 168px, top padding 32px, bottom padding 40px, gap 12px.

Contrato de autenticação (`js/login.js`, `js/auth-http.js` e `js/api.js`): envia `POST /api/auth/login` para `API_BASE_URL` (local `http://localhost:8080/api`) com `credentials: 'include'`, cabeçalho obrigatório `X-Sonarfy-CSRF: 1` e payload `{ login, password, rememberMe }`. Em `200`, lê `accessToken` (ou `token`) e o navegador gerencia o cookie `HttpOnly` `sonarfy_refresh`. Respostas `401` representam credenciais inválidas ou conta inativa/não verificada de forma genérica; respostas `403` sem indicação de conta pendente exibem erro de verificação de segurança/origem. Em desenvolvimento HTTP local, a origem do frontend precisa constar em `AUTH_ALLOWED_ORIGINS` (padrão `http://localhost:63342,http://localhost:8080`, sem misturar `localhost` e `127.0.0.1`) e o cookie de refresh exige `AUTH_REFRESH_COOKIE_SECURE=false` no backend.

Reativação explícita de conta (`pages/login.html` e `js/login.js`): não possui frame dedicado no Figma; reutiliza integralmente os tokens, o card `.login-card`, os campos, o alternador de senha e os feedbacks de `css/login.css`. Acionada explicitamente pelo botão `"Reativar conta"` (sem sugerir inatividade a partir de `401` no login), valida campos obrigatórios e o limite BCrypt de 72 bytes UTF-8 (`TextEncoder`), bloqueia envios concorrentes com `aria-busy="true"` e envia `POST ${API_BASE_URL}/auth/reactivation` com `Content-Type: application/json`, `X-Sonarfy-CSRF: 1`, `credentials: 'omit'`, `cache: 'no-store'`, sem `Authorization` e sem acionar `/api/auth/refresh`. Em `204`, limpa `sonarfy_token` via `clearAccessToken()`, limpa os campos de senha, retorna ao formulário de login e exibe confirmação orientando novo login. Respostas `401` recebem mensagem uniforme sem enumeração de conta; `403`, `400`, `429`, `5xx` e falha de rede exibem mensagens seguras sem expor a senha ou erros brutos.



<a id="cadastro-register"></a>
## Cadastro / Register

Implementação baseada na página **Register Page** do arquivo [Sonarfy](https://www.figma.com/design/kgOOkp9lzghCJtlBpSQtIj/Sonarfy?node-id=66-3), inspecionada pelo Figma MCP em 20/10/2026.

| Tema | Desktop 1440px | Mobile 390px | Desktop / Cidade ativa | Mobile / Cidade ativa |
| --- | --- | --- | --- | --- |
| Claro | 73:1200 | 73:1286 | 78:74 | 78:257 |
| Escuro | 73:1342 | 73:1428 | 78:407 | 78:590 |

Os oito frames foram obtidos com `get_design_context`, incluindo seus screenshots. Header / Global e Footer / Global foram inspecionados nas instâncias desses frames. Os SVGs utilizados estão em `assets/icons/register/`, sem dependência dos URLs temporários do Figma. A marca e a onda sonora são texto e retângulos no próprio design, reproduzidos com HTML/CSS.

Tokens: Inter 400/500/600/700; títulos 32px desktop e 28px mobile, entrelinha 1.2; labels 14px/20px; campos 48px; gaps 8/16/24/32px; card 16px e controles 8px de raio. Claro: fundo/card/campos `#ffffff`, texto `#1a1a1a`, secundário `#65676b`, borda estrutural `#ebecef`, borda dos campos `#8c8d90`, superfície auxiliar `#f7f8fa`. Escuro: fundo/campos `#1a1a1a`, card/showcase `#242424`, superfície auxiliar `#2a2a2a`, texto `#ffffff`, secundário `#b2b3b5`, borda estrutural `#65676b`. Azul `#27a9f5`. Dropdown: sombra `0 4px 8px rgba(0,0,0,.08)` / `.4`; foco escuro: `0 0 12px 3px rgba(39,169,245,.2)`.

Os frames mostram requisitos neutros; a consulta de variáveis retornou `{}` e não forneceu cores de validação. Foram reutilizados os tokens acessíveis do login: erro `#b42318` / `#fda29b` e sucesso `#216e39` / `#86efac`. O label de usuário segue o Figma atualizado, “Usuário”. A senha recebe o destaque de foco quando o usuário entra no campo; não é forçado foco no carregamento. O checkbox de termos presente no Figma foi mantido.


Testes e configuração: [Cadastro / Register](../tests/README.md#cadastro).

<a id="confirmacao-email"></a>
## Confirmação de e-mail

A seção **Email Confirmation**, dentro da Register Page do [Sonarfy no Figma](https://www.figma.com/design/kgOOkp9lzghCJtlBpSQtIj/Sonarfy?node-id=96-463), foi inspecionada pelo Figma MCP com `get_metadata` e quatro chamadas de `get_design_context`, incluindo seus screenshots.

| Tema | Desktop 1440px | Mobile 390px |
| --- | --- | --- |
| Claro | 96:316 | 96:348 |
| Escuro | 96:384 | 96:416 |

Tokens globais são reutilizados de `css/login.css`, e os específicos estão em `css/confirmation.css`:

| Propriedade | Claro | Escuro |
| --- | --- | --- |
| Fundo | #ffffff | #1a1a1a |
| Card | #ffffff | #242424 |
| Badge/endereço | #f7f8fa | #2a2a2a |
| Texto principal | #1a1a1a | #ffffff |
| Texto secundário | #65676b | #b2b3b5 |
| Borda do card | #ebecef | #65676b |
| Links de ação | #1a1a1a | #27a9f5 |
| CTA | #27a9f5, texto/borda #1a1a1a | #27a9f5, texto/borda #1a1a1a |

Inter 400/500/600/700. Título: 32px desktop, 28px mobile, entrelinha 1.2. Subtítulo/instruções: 15px/24px. Endereço: 15px/24px desktop, 14px/24px mobile, peso 600. Ações: 14px, peso 600; Editar: 13px. Gaps 8/16/24px. Card com raio 16px, padding 32px desktop e 16px mobile; superfícies/CTA com raio 8px. Badge 64px. CTA e ações com altura mínima 48px. Sem sombra externa no card. O limite desktop de 560px e os paddings de página preservam o Auto Layout sem fixar a altura do conteúdo.

Os estados de hover/active/focus-visible do CTA reutilizam os controles globais. A altura mínima da área principal é 744px no desktop e 752px no mobile, conforme Figma, podendo crescer com feedback e endereços longos.


Testes: [Confirmação de e-mail](../tests/README.md#confirmação-de-e-mail).

<a id="verify-account"></a>
## Verify Account

Referência: [Verify Account Page no Figma](https://www.figma.com/design/kgOOkp9lzghCJtlBpSQtIj/Sonarfy?node-id=93-25), consultada via MCP em 21/10/2026.

### Frames consultados

Cada frame foi obtido com `get_design_context`, incluindo seu screenshot.

| Estado | Desktop claro | Desktop escuro | Mobile claro | Mobile escuro |
| --- | --- | --- | --- | --- |
| Verificando e-mail | 102:2012 | 102:2034 | 102:2056 | 102:2082 |
| E-mail confirmado | 102:2108 | 102:2132 | 102:2156 | 102:2184 |
| Link ausente | 102:2212 | 102:2245 | 102:2278 | 102:2315 |
| Link expirado/inválido | 102:2352 | 102:2385 | 102:2418 | 102:2455 |

O fluxo usa `verify.html?token=...`, com e-mail opcional para preencher o reenvio.
Esses frames não apresentam campos de código/OTP.

### Tokens e composição

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

<a id="spotify-sync"></a>
## Spotify Sync

Referência: [Spotify Sync no Figma](https://www.figma.com/design/kgOOkp9lzghCJtlBpSQtIj/Sonarfy?node-id=168-14).
Página local: `pages/spotify-sync.html`, em HTML5, CSS3 e módulos JavaScript nativos.

| Tema | Desktop 1440 × 900 | Mobile 390 × 900 |
| --- | --- | --- |
| Claro (`initial`) | `166:2410` | `166:2456` |
| Escuro (`initial`) | `166:2502` | `166:2548` |
| Claro (`success`) | `618:82` | `618:132` (`390 × 844`) |
| Escuro (`success`) | `618:184` | `618:234` (`390 × 844`) |
| Claro (`failure`) | `620:82` | `620:126` (`390 × 844`) |
| Escuro (`failure`) | `620:172` | `620:216` (`390 × 844`) |

Os doze frames têm contexto de design e screenshot obtidos pelo Figma MCP.
A composição contém Header / Global e o cartão central `#spotify-card` com três
estados declarativos (`initial`, `success` e `failure`), sem rodapé global.

### Tokens e layout

Os tokens compartilhados estão em `css/login.css`; os específicos, em
`css/spotify-sync.css`. `:root` define o tema claro e `[data-theme="dark"]`,
o escuro. A consulta de variáveis do Figma retorna `{}`; os valores abaixo
correspondem às propriedades resolvidas dos frames.

| Propriedade | Claro | Escuro |
| --- | --- | --- |
| Fundo | #ffffff | #1a1a1a |
| Card | #ffffff | #242424 |
| Texto principal | #1a1a1a | #ffffff |
| Texto secundário | #65676b | #b2b3b5 |
| Borda | #ebecef | #65676b |
| Sombra | 0 8px 24px rgba(26,26,26,.03) | 0 8px 24px rgba(0,0,0,.09) |
| Superfície de destaques (`success`) | #f8f9fa | #1e1e1e |
| Borda de erro (`failure`) | #fecdca | #b42318 |

Azul Sonarfy `#27a9f5`; verde Spotify `#1ed760`; texto do CTA `#1a1a1a`.
Inter: título 700, 32px/1.2 desktop e 28px/1.2 mobile; descrição 400,
15px/24px; benefícios 400, 15px/24px desktop e 14px/24px mobile;
destaques (`success`) 500, 14px/20px com badges 600, 11px/16px; banner de dica
(`failure`) 400, 13px/20px com `--error-bg` e `--error-color`;
CTA 700, 15px/20px; ação secundária 600, 14px/20px;
privacidade/notas 400, 12px/18–20px.

Card com largura máxima de 560px, padding 32px desktop/24px mobile e raio
16px. Margens mobile de 20px resultam em 350px de largura a 390px.
As bordas internas preservam as medidas do Auto Layout. Gaps de 24px entre
seções, 8px na introdução e nas ações (`12px` no estado `failure`) e 16px entre benefícios.
Controles com altura mínima de 48px e raio 8px. Cabeçalho de 88px desktop/
80px mobile; área principal mínima de 812px/820px, com crescimento natural.

### Assets e conteúdo

Os SVGs locais estão em `assets/icons/spotify-sync/`, sem URLs temporários:

- `sonarfy.svg`: círculo e monograma vetoriais de 64 × 64px, sem fundos dos frames ancestrais.
- `spotify.svg`: símbolo oficial do Spotify na área de 64 × 64px.
- `spotify-button.svg`: ícone oficial preto de 24 × 22,9019px, centralizado no botão.
- `connection-light.svg` / `connection-dark.svg`: conexão de 24 × 24px por tema (`initial`).
- `check.svg`: confirmação de 16 × 16px em contêiner de 24 × 24px (`initial`).
- `success-check.svg`: confirmação de 12 × 9px dentro do badge verde `#1ed760` de 24 × 24px (`success`).
- `highlight-check.svg`: confirmação de 10 × 8px nos itens de destaque (`success`).
- `arrow-right.svg`: seta de 16 × 16px no botão `Continuar no Sonarfy` (`success`).
- `alert-circle-light.svg` / `alert-circle-dark.svg`: alerta de 14 × 14px no badge de 28 × 28px (`failure`).
- `info-light.svg` / `info-dark.svg`: ícone informativo de 16 × 16px no banner de dica (`failure`).

O gráfico de integração tem altura de 72px e gaps de 24px (`initial`) ou 16px (`success`/`failure`) entre símbolos.
As dimensões intrínsecas dos SVGs são preservadas. Marca do cabeçalho,
ícones de tema e retorno reutilizam os assets compartilhados do projeto.

A implementação acompanha a cópia dos doze frames:
- `initial`: título “Conecte sua conta do Spotify”, descrição, três benefícios e ações “Conectar ao Spotify” / “Pular por enquanto”.
- `success`: título “Conta conectada com sucesso!”, descrição de sincronização com Ecos e perfil, destaques (“Artistas sincronizados” e “Histórico recente pronto para avaliação”), CTA “Continuar no Sonarfy” (`#27a9f5`) e nota informativa.
- `failure`: título “Não foi possível conectar ao Spotify”, descrição de falha/cancelamento, banner de dica, botão “Tentar novamente” (`#1ed760`) e ação secundária “Pular por enquanto”.

### Comportamento e verificação

`js/spotify-sync-state.js` centraliza o estado local: contas sincronizadas
seguem para `profile.html`; contas não sincronizadas veem o onboarding no
primeiro login ou após 7 dias do último skip. O acesso manual nas
configurações ou em Ecos usa `spotify-sync.html?source=account` ou `spotify-sync.html?source=echoes`.
Em `js/spotify-sync.js`, o fluxo transiciona `#spotify-card` entre `initial`, `success` e `failure`,
anuncia mudanças em `role="status"` / `aria-live="polite"` e move o foco programático para o botão
primário do estado ativo (`#spotify-continue` ou `#spotify-retry`).
O retorno `?spotify=connected` confirmado por `GET /api/spotify/connection` (ou handler customizado
`window.sonarfySpotifyOAuth` com `{ synced: true }`) ativa `success`, onde “Continuar no Sonarfy”
direciona para `echoes.html` quando `source=echoes` ou `profile.html` nos demais casos. Retornos
`?spotify=denied` / `error` / `invalid_state` ou falhas de autorização ativam `failure`.
O destino `pages/profile.html` usa um adapter HTTP para identidade e relacionamentos; a demonstração é explícita em ?demo=true; consulte [Perfis Sonarfy](profile-page.md).

Verificação: `npm test -- tests/spotify-sync.test.js` e
`node tests/browser/spotify-sync.cjs`. O script de navegador usa Playwright
(`PLAYWRIGHT_MODULE`, quando necessário), inicia seu próprio servidor e
grava capturas/relatório em `test-results/spotify-sync/`, ignorado pelo Git.
Edge e Firefox verificados em `1440px`/`390px`, nos temas claro/escuro,
cobrindo os estados `initial`, `failure` e `success` com SVGs carregados e sem overflow na tela Spotify Sync. Mobile é verificado
por viewport emulado; login, confirmação OAuth e destino de perfil são
simulados nos testes.

<a id="logout"></a>
## Logout

Referência: [Logout Page](https://www.figma.com/design/kgOOkp9lzghCJtlBpSQtIj/Sonarfy?node-id=432-10484).

### Inspeção pelo Figma MCP

A página `Logout Page` (`432:10484`) foi inspecionada via `get_metadata` e `get_design_context` (com screenshots) em 19/11/2026 nos quatro frames oficiais:

| Tema | Desktop `1440px` (`1440 × 874`) | Mobile `390px` (`390 × 860`) |
| --- | --- | --- |
| Claro | `499:8385` | `499:8430` |
| Escuro | `499:8478` | `499:8523` |

Estrutura, tokens e assets verificados nos frames:

- `Header / Global` (`187:548`): `88px` desktop (`187:509` / `187:519`) e `80px` mobile (`187:533` / `187:547`), contendo apenas o logo Sonarfy (link direto para `feed.html`, substituindo o antigo link `← Início`) e o alternador de tema.
- `Footer / Global` (`175:216` — `175:214` / `175:215`): último elemento no fluxo normal (`padding: 32px 20px 40px`, `gap: 12px`, `12px/20px`).
- Card centralizado (`499:8398` / `499:8446` / `499:8491` / `499:8539`): `480px` desktop (`padding: 32px`) / `342px` mobile (`padding: 24px`), `gap: 24px`, raio `16px`, borda `1px` `#ebecef` (claro) / `#65676b` (escuro), superfície `#ffffff` / `#242424`.
- Badge superior (`64 × 64px`, raio `16px`, `#f7f8fa` / `#2a2a2a`, sem borda) com ícone de sair `16 × 18px` (`assets/icons/profile/logout-light.svg` e `logout-dark.svg`, correspondentes aos SVGs `a77f5.svg` e `80a72.svg` do MCP).
- Cópia oficial: título `Sair da sua conta?` (`32px/38px` desktop, `28px/34px` mobile, Bold), descrição `Você será desconectado do Sonarfy neste navegador. Você poderá entrar novamente a qualquer momento para acessar seu perfil e suas avaliações.` (`15px/24px`), resumo de conta conectada (`padding: 12px 16px`, `gap: 12px`, raio `8px`, avatar `44 × 44px` via `assets/icons/profile/avatar.svg`) e botões `Confirmar e sair` (`#27a9f5`, `15px/20px`, altura `48px`) e `Cancelar e voltar` (borda `1px #8c8d90`, `14px/20px`, altura `48px`).

### Integração HTTP, adapter (`window.sonarfyLogoutAdapter`) e modo demonstração

Em operação padrão, `js/logout.js` integra diretamente com o backend:

- Quando há `sonarfy_token` armazenado (e `?demo=true` não está ativo), `resolveLogoutUser` consulta `GET /api/profile/me` via `createAuthClient().authorizedFetch` (sem redirecionar em falha, para nunca bloquear o encerramento de sessão) e exibe `identity.displayName`, `@${identity.handle}` e `identity.avatarUrl` (com fallback para `assets/icons/profile/avatar.svg`).
- Ao confirmar `"Confirmar e sair"`, `js/logout.js` bloqueia cliques concorrentes e chama `logoutSession()` (`js/auth-http.js`), que envia `POST /api/auth/logout` com `credentials: 'include'`, `cache: 'no-store'` e `X-Sonarfy-CSRF: 1` (serializado por `navigator.locks` quando disponível), notifica outras abas via `BroadcastChannel('sonarfy_auth')` e sempre remove `sonarfy_token` (preservando `sonarfy_theme`) no `finally` antes de redirecionar para `pages/login.html`, mesmo em caso de falha remota.
- Em `?demo=true` ou quando um host injeta `window.sonarfyLogoutAdapter`, `js/logout.js` aceita:
  - `user` ou `getUser()`: objeto ou função assíncrona retornando `{ displayName, handle, avatar }` (ou usa `js/profile-fixtures.js` em modo demonstração).
  - `logout()` ou `actions.logout()`: função assíncrona opcional para revogação remota de sessão.
  - `routes.login` e `routes.fallback`: rotas relativas opcionais (padrão `login.html` e `feed.html`). O parâmetro de query `from` é validado para aceitar apenas rotas internas relativas sob `/pages/` (bloqueando URLs externas, `//`, `javascript:` e loop para `logout.html`).
- A sidebar compartilhada (`js/profile-shell.js`) direciona o item `"Sair"` para `logout.html?from=<página atual>`.

### Verificação

- Suíte unitária (`npm test`, incluindo `tests/logout.test.js` e `tests/auth-http.test.js`): 24 arquivos, 229 testes aprovados em Vitest + Happy DOM.
- Verificação de navegador (`node tests/browser/logout.cjs`): 8 combinações aprovadas no Microsoft Edge e Firefox, em `1440px` e `390px`, nos temas claro e escuro, validando dimensões do card (`480px`/`342px`), badge `64 × 64px`, header `88px`/`80px`, zero overflow horizontal, foco por teclado, carregamento de SVGs, preenchimento via `GET /api/profile/me` e confirmação via `POST /api/auth/logout`.
- Limitações: mobile verificado por viewport emulado em navegador headless; respostas de `GET /api/profile/me` e `POST /api/auth/logout` nos testes automatizados são simuladas por mocks/rotas interceptadas.

<a id="profile-http"></a>
## Perfil — integração HTTP de relacionamentos (20/11/2026)

O cabeçalho de Profile Page usa identidade, mídia e contagens do backend; o botão
Seguir/Seguindo usa o estado do visitante. Preservados o layout, tokens, sidebar
Desktop e drawer Mobile existentes; nenhum nó ou componente Figma foi alterado.
Seções sem API exibem indisponibilidade; o contador de álbuns não é inventado.
Fixtures e interações visuais antigas permanecem em `?demo=true`, sem fallback de rede.
Verificação de relacionamentos em Edge/Firefox, 1440/390, claro/escuro, com HTTP
simulado e mobile emulado: detalhes em [profile-page.md](profile-page.md). A caixa
expandida de avaliação na Coleção (`Collection / Expanded Review Box` `362:4160`:
`362:4044`, `362:4073`, `362:4102`, `362:4131`) usa botões somente-ícone `40 × 40px`
(`border-radius: 8px`) para Editar (`656:8316`/`656:8324`) e Excluir (`656:8318`/`656:8326`,
`assets/icons/profile/trash-light.svg` e `trash-dark.svg`), sem contadores sociais no modal,
e o modo de edição (`Collection / Expanded Review Box (Editando)` `663:8412`: `663:8316`,
`663:8340`, `663:8364`, `663:8388`) exibe a caixa de texto editável (`#ffffff`/`#1a1a1a`,
borda `#8c8d90`/`#65676b`, `border-radius: 8px`, `padding: 12px 14px`, `15px/24px`) e o botão
`Salvar` (`height: 40px`, `padding: 8px 18px`, `border-radius: 8px`, `#27a9f5`, `13px/20px` SemiBold).
O estado de confirmação de exclusão (`Collection / Expanded Review Box (Confirmar Exclusão)` `667:8980`:
`667:8884`, `667:8908`, `667:8932`, `667:8956`) substitui os dois ícones pelos botões `Confirmar exclusão`
(`height: 40px`, `padding: 8px 14px`, `border-radius: 8px`, `#b42318` com texto `#ffffff` no claro e `#fda29b`
com texto `#1a1a1a` no escuro, `13px/20px` SemiBold) e `Cancelar` (`height: 40px`, `padding: 8px 14px`,
`border-radius: 8px`, borda `1px solid #8c8d90` no claro e `#65676b` no escuro).
