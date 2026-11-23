# Testes

Execute os comandos a partir da raiz do projeto.

## Suíte automatizada

```sh
npm test
```

Para acompanhar alterações, use `npm run test:watch`.

## Perfis

`npm test -- tests/profile.test.js tests/profile-http.test.js tests/avatar-upload.test.js tests/wallpaper-upload.test.js` verifica limites, datas, ordenação,
permissões, recorte circular/EXIF e uploads de avatar e capa/wallpaper, adapter HTTP de perfil/relacionamentos e reconciliação de mutações. Execute também:

```sh
node tests/browser/profile.cjs
node tests/browser/profile-states.cjs
node tests/browser/profile-following.cjs
```

Os scripts iniciam seus servidores e testam Firefox/Edge, 1440/390px,
claro/escuro. Usam `PLAYWRIGHT_MODULE` quando a instalação é externa.
Relatórios e capturas ficam em `test-results/profile*`, ignorados pelo Git.
Integrações simuladas, estados cobertos e limitações estão em
[Perfis Sonarfy](../docs/profile-page.md).

### Perfil e relacionamentos HTTP

`node tests/browser/profile-following.cjs` intercepta o HTTP da API sem alterar
contas ou bancos reais, cobrindo relacionamentos (pendência, clique repetido,
`204` seguido de `GET`, reconciliação incerta sem nova mutação), edição textual
do próprio perfil (`PUT /api/profile/me`, preservação de rascunho em `400`,
ausência de controle de edição em perfil de terceiros), `404`/retry, falha de
rede, renovação em `401`/login, foco e drawer nas oito combinações
`1440px`/`390px` e claro/escuro em Microsoft Edge e Firefox. Capturas e relatório:
`test-results/profile-following`. A regressão visual em `profile.cjs` solicita
`?demo=true` explicitamente. Mobile emulado/headless; execução automatizada
contra backend real e CI remoto não realizadas nesta entrega.

## Testes de navegador

### Configurações da Conta

`npm test` inclui `tests/account.test.js`, `tests/account-http.test.js`, `tests/spotify-sync.test.js` e `tests/spotify-http.test.js` em Vitest + Happy DOM.
`node tests/browser/account.cjs` e `node tests/browser/spotify-sync.cjs` iniciam seus próprios servidores e verificam `pages/account.html` e `pages/spotify-sync.html` em modo HTTP real (interceptando `GET/PUT /api/users/me`, `GET /api/locations/cities`, `POST /api/spotify/authorization` e `GET/DELETE /api/spotify/connection`) no Edge e Firefox, em `1440px`/`390px` e claro/escuro, cobrindo sidebar/drawer com **Configurações** ativo, modo de edição, conflito `409` de `@handle`, autocomplete de cidade/país com `cityId`, fluxo OAuth do Spotify, retorno `?spotify=...`, desconexão com aviso de revogação, modais `<dialog>` de sucesso e indisponibilidade de desativar/deletar sem simular sucesso, carregamento de SVGs e ausência de overflow horizontal. Relatórios/capturas: `test-results/account/` e `test-results/spotify-sync/`. Contrato e resultados: [Configurações da Conta](../docs/account-page.md).

### Feed

`npm test` inclui `tests/feed.test.js` em Vitest + Happy DOM.
`node tests/browser/feed.cjs` inicia seu próprio servidor e verifica Feed no Edge
e Firefox, em 1440/390px e claro/escuro, incluindo drawer, foco visível, teclado,
assets SVG, overflow, tabs/histórico, curtidas, vazio, loading/reduced-motion,
resenha de 255 pontos de código, retry e logout. Relatórios/capturas:
`test-results/feed/`. Contrato e resultados: [Feed](../docs/feed-page.md).

### Ecos

`npm test` inclui `tests/ecos.test.js` em Vitest + Happy DOM.
`node tests/browser/ecos.cjs` inicia seu próprio servidor e verifica Ecos no Edge
e Firefox, em 1440/390px e claro/escuro, incluindo drawer (`296px`, contenção de foco
e `Escape`), foco visível, carregamento de SVGs, ausência de overflow horizontal,
estados Populated (50 itens), Empty (`spotify-sync.html?source=ecos`), Skeleton
Loading (`aria-busy="true"` e `prefers-reduced-motion`), Error + Retry e remoção
de credencial no logout. Relatórios/capturas: `test-results/ecos/`. Contrato e
resultados: [Ecos](../docs/ecos-page.md).

Sirva a raiz do projeto:

```sh
python -m http.server 4173 --bind 127.0.0.1
```

Os scripts usam Playwright disponível no ambiente de desenvolvimento, Microsoft Edge instalado e Firefox de automação. O frontend não depende de Playwright em produção.

- `PLAYWRIGHT_MODULE`: caminho de uma instalação externa do módulo.
- `BASE_URL`: servidor local; padrão `http://127.0.0.1:4173`.
- `OUTPUT_DIR`: diretório de capturas e relatórios. Por padrão, cada script grava em sua própria subpasta de `test-results/`, ignorada pelo Git e criada automaticamente na execução. Essas saídas são descartáveis; os scripts e as instruções permanecem em `tests/`.

### Cadastro

Referência visual: [Figma — Cadastro / Register](../docs/figma-references.md#cadastro-register).

```sh
node tests/browser/register.cjs
```

Verifica `pages/register.html` no Firefox e Edge, 1440px/390px e claro/escuro: requisitos de senha, confirmação, autocomplete por teclado, tema, assets e ausência de overflow. Também verifica resposta 404 para a página antiga de cadastro e a prévia de confirmação.

As cidades são simuladas via interceptação de `GET /api/locations/cities?q=...`; o teste não depende da disponibilidade real do backend ou do provedor externo.

#### Configuração de cidades

O cadastro consulta `GET ${API_BASE_URL}/locations/cities?q=...` e espera objetos no formato `CityDto` (`{ cityId, name, region, country }`). Um provedor alternativo pode ser injetado para testes como `window.sonarfyCitySearch = async (query, { signal }) => [...]`, retornando itens com `cityId` numérico positivo. O componente aplica debounce de 350ms, cancelamento (`AbortController`), descarte de respostas antigas e exige a seleção de uma cidade válida antes de enviar `cityId` em `POST /api/auth/register`.

### Confirmação de e-mail

Referência visual: [Figma — Confirmação de e-mail](../docs/figma-references.md#confirmacao-email).

```sh
node tests/browser/confirmation.cjs
```

Verifica o fluxo até o estado “Quase lá!” de `pages/register.html`, edição do endereço, espera de 30 segundos, reenvio, feedback, foco, retorno ao formulário e temas, no Firefox e Edge, desktop/mobile. A ativação pelo token ocorre separadamente em `pages/verify.html`.

Os endpoints são simulados, sem envio de e-mails reais. Para conferir manualmente, conclua um cadastro no ambiente de desenvolvimento.

### Login e Home

```sh
npm test -- tests/login.test.js
node tests/browser/login-home-assets.cjs
node tests/browser/shared-brand.cjs
```

`tests/login.test.js` valida o contrato de `POST /api/auth/login` (`http://localhost:8080/api`, `credentials: 'include'`, cabeçalho `X-Sonarfy-CSRF: 1`, payload com `rememberMe`, leitura de `accessToken`), fallback da URL local e tratamento de erros (`401`, `403` de CSRF/origem vs conta não ativada, `429` e rede). O script `login-home-assets.cjs` verifica assets, navegação, temas e controles de login/index, e `shared-brand.cjs` verifica as marcas compartilhadas de Home, login, cadastro e Verify; ambos exercitam Firefox e Edge, desktop/mobile e claro/escuro.

### Logout e ciclo de vida de sessão

Referência: [Figma — Logout](../docs/figma-references.md#logout).

```sh
npm test -- tests/auth-http.test.js tests/logout.test.js tests/profile-http.test.js
node tests/browser/logout.cjs
node tests/browser/profile-following.cjs
```

`tests/auth-http.test.js` valida `js/auth-http.js` (`POST /api/auth/refresh` com `credentials: 'include'`, `cache: 'no-store'`, `X-Sonarfy-CSRF: 1`, deduplicação concorrente single-flight em `401`, tratamento de `401`/`403`/`5xx` e `POST /api/auth/logout` com limpeza no `finally` em `logout.js`, `account-state.js` e `feed-state.js`). Os scripts de navegador verificam a revogação remota em `pages/logout.html` e a renovação automática de sessão em `pages/profile.html` no Edge e Firefox (`1440px`/`390px`, claro/escuro).

### Recuperação e troca de senha

```sh
npm test -- tests/password-flows.test.js
node tests/browser/password-flows.cjs
```

Valida `pages/reset-password.html` (`POST /api/auth/forgot-password` com resposta uniforme e `POST /api/auth/reset-password` redirecionando para `login.html?reset=true`) e o fluxo autenticado em `pages/account.html` (`POST /api/users/me/password-change-request` e `PUT /api/users/me/password` via fragmento `#password-change-token=...` limpo com `replaceState` e limpeza de `sonarfy_token`) no Edge e Firefox (`1440px`/`390px`, claro/escuro).

### Troca de e-mail autenticada

```sh
npm test -- tests/email-change.test.js
node tests/browser/email-change.cjs
```

Valida o modal de solicitação em `pages/account.html` (`POST /api/users/me/email-change-request`, `202`/`400`/`401`/`404`/`409`/`429`) e a página de confirmação explícita `pages/confirm-email-change.html#token=...` (`POST /api/auth/email-change-confirmation` com limpeza do fragmento via `replaceState` e limpeza de `sonarfy_token`) no Edge e Firefox (`1440px`/`390px`, claro/escuro).

## Limitações

Os testes de navegador executam em modo headless; viewports mobile não substituem dispositivos físicos. Respostas simuladas não verificam entrega de e-mails, ativação real de contas ou disponibilidade de serviços externos.
