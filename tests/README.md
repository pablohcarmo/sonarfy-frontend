# Testes

Execute os comandos a partir da raiz do projeto.

## Suíte automatizada

```sh
npm test
```

Para acompanhar alterações, use `npm run test:watch`.

## Perfis

`npm test -- tests/profile.test.js` verifica limites, datas, ordenação,
permissões e reconciliação de mutações. Execute também:

```sh
node tests/browser/profile.cjs
node tests/browser/profile-states.cjs
```

Os scripts iniciam seus servidores e testam Firefox/Edge, 1440/390px,
claro/escuro. Usam `PLAYWRIGHT_MODULE` quando a instalação é externa.
Relatórios e capturas ficam em `test-results/profile*`, ignorados pelo Git.
Integrações simuladas, estados cobertos e limitações estão em
[Perfis Sonarfy](../docs/profile-page.md).

## Testes de navegador

### Configurações da Conta

`npm test` inclui `tests/account.test.js` em Vitest + Happy DOM.
`node tests/browser/account.cjs` inicia seu próprio servidor e verifica `pages/account.html` no Edge e Firefox, em `1440px`/`390px` e claro/escuro, cobrindo sidebar/drawer com **Configurações** ativo, modo de edição, validação de disponibilidade do `@handle`, atualização automática de país via cidade, modais `<dialog>` de sucesso, desativar conta e deletar conta, limpeza de `sonarfy_token`, carregamento de SVGs e ausência de overflow horizontal. Relatórios/capturas: `test-results/account/`. Contrato e resultados: [Configurações da Conta](../docs/account-page.md).

### Feed

`npm test` inclui `tests/feed.test.js` em Vitest + Happy DOM.
`node tests/browser/feed.cjs` inicia seu próprio servidor e verifica Feed no Edge
e Firefox, em 1440/390px e claro/escuro, incluindo drawer, foco visível, teclado,
assets SVG, overflow, tabs/histórico, curtidas, vazio, loading/reduced-motion,
resenha de 255 pontos de código, retry e logout. Relatórios/capturas:
`test-results/feed/`. Contrato e resultados: [Feed](../docs/feed-page.md).

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

As cidades são simuladas; o teste não depende da disponibilidade real da GeoNames.

#### Configuração de cidades

O cadastro usa GeoNames quando `GEONAMES_USERNAME` está configurado em `js/env.js`. Um provedor pode ser injetado como `window.sonarfyCitySearch = async (query, { signal }) => [...]`, retornando objetos `{ name, adminName1, countryName }`. O componente aplica debounce de 350ms, cancelamento e descarte de respostas antigas.

Sem provedor/configuração, há uma lista local limitada de exemplos, que não representa uma base mundial.

### Confirmação de e-mail

Referência visual: [Figma — Confirmação de e-mail](../docs/figma-references.md#confirmacao-email).

```sh
node tests/browser/confirmation.cjs
```

Verifica o fluxo até o estado “Quase lá!” de `pages/register.html`, edição do endereço, espera de 30 segundos, reenvio, feedback, foco, retorno ao formulário e temas, no Firefox e Edge, desktop/mobile. A ativação pelo token ocorre separadamente em `pages/verify.html`.

Os endpoints são simulados, sem envio de e-mails reais. Para conferir manualmente, conclua um cadastro no ambiente de desenvolvimento.

### Login e Home

```sh
node tests/browser/login-home-assets.cjs
node tests/browser/shared-brand.cjs
```

O primeiro script verifica assets, navegação, temas e controles de login/index. O segundo verifica as marcas compartilhadas de Home, login, cadastro e Verify. Ambos exercitam Firefox e Edge, desktop/mobile e claro/escuro.

### Logout

Referência: [Figma — Logout](../docs/figma-references.md#logout).

```sh
npm test -- tests/logout.test.js
node tests/browser/logout.cjs
```

Verifica renderização da conta conectada (adapter e fallback local), bloqueio de cliques concorrentes, remoção de `sonarfy_token` com preservação de `sonarfy_theme`, resiliência a falha remota, proteção contra open redirect no parâmetro `from`, além de dimensões, foco, SVGs e ausência de overflow no Edge e Firefox (`1440px`/`390px`, claro/escuro).

## Limitações

Os testes de navegador executam em modo headless; viewports mobile não substituem dispositivos físicos. Respostas simuladas não verificam entrega de e-mails, ativação real de contas ou disponibilidade de serviços externos.
