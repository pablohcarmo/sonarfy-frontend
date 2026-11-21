# Configurações da Conta — Sonarfy

Sirva a raiz do repositório e abra `pages/account.html`. Implementação em HTML5 semântico, CSS3 e módulos ES nativos (`Inter`, `css/login.css`, `css/profile.css`, `css/profile-dialogs.css`, `css/account.css`, `js/login-theme.js`, `js/profile-shell.js`), sem dependências novas de produção.

## Figma e componentes

Arquivo `kgOOkp9lzghCJtlBpSQtIj`, página [Settings Page](https://www.figma.com/design/kgOOkp9lzghCJtlBpSQtIj/Sonarfy?node-id=427-31281), inspecionada via Figma MCP somente para leitura em 19/11/2026 (`get_metadata` e `get_design_context`).

| Estado / Frame | Desktop Claro (`1440px`) | Desktop Escuro (`1440px`) | Mobile Claro (`390px`) | Mobile Escuro (`390px`) |
| --- | --- | --- | --- | --- |
| Visualização padrão | `432:20646` | `432:21061` | `432:21478` | `432:21725` |
| Edição ativa + Cooldown + Sucesso | `432:20841` | `432:21257` | `432:21589` | `432:21827` |
| Menu aberto (Drawer Mobile) | — | — | `432:21954` | `432:22157` |
| Modal / Desativar Conta | `492:590` | `492:701` | `492:812` | `492:919` |
| Modal / Deletar Conta | `492:1026` | `492:1137` | `492:1248` | `492:1355` |

Masters reutilizados:
- **Header / Global** (`187:548`): `88px` desktop / `80px` mobile via `globalHeader()` em `js/profile-shell.js`.
- **Sidebar / Global** (`368:6383`): `248px` desktop e drawer modal `296px` no mobile com **Configurações** ativo (`aria-current="page"`) e ícone ativo `assets/icons/profile/active-settings.svg`.
- **Footer / Global** (`175:216`): último elemento do `body` em fluxo normal via `globalFooter()`.

Assets SVGs salvos localmente em `assets/icons/account/` (sem URLs temporárias do Figma):
- `edit-light.svg`, `edit-dark.svg`
- `calendar-light.svg`, `calendar-dark.svg`
- `lock-light.svg`, `lock-dark.svg`
- `map-pin-light.svg`, `map-pin-dark.svg`
- `spotify.svg`, `clock.svg`, `circle-check.svg`
- `eye-off-light.svg`, `eye-off-dark.svg`
- `trash-light.svg`, `trash-dark.svg`
- `close-light.svg`, `close-dark.svg`

Tokens de alerta destrutivo: `#b42318` (fundo badge `#fef3f2`, texto botão `#ffffff`) no tema claro e `#fda29b` (fundo badge `#3b1816`, texto botão `#1a1a1a`) no tema escuro.

## Regras de negócio e interface

- **Informações Pessoais:** botão de lápis (`#edit-account-btn`) alterna entre leitura e edição. O campo **Usuário (`@handle`)** permanece **sem cadeado e livremente editável** no modo de edição (prefixo `@` fixo), validando formato e disponibilidade via adapter/fixtures com feedback inline. `Cidade` oferece sugestões e atualiza `País` automaticamente (`País` permanece somente leitura com cadeado). **Salvar Alterações** bloqueia envios concorrentes, exibe banner de cooldown e modal de sucesso; **Cancelar** restaura o snapshot anterior.
- **Segurança e Credenciais:** card do **Spotify** lê `sonarfy_spotify_synced` (`js/spotify-sync-state.js`), exibindo link `spotify-sync.html?source=account` quando desconectado ou botão `Conectado · Desconectar` quando conectado. **Alterar E-mail** e **Redefinir Senha** acionam timers de cooldown desabilitando os controles durante a contagem.
- **Gerenciamento da Conta:** **Desativar Conta** abre `<dialog>` informando indisponibilidade temporária e reativação automática no próximo login; **Deletar Conta** abre `<dialog>` destrutivo avisando sobre exclusão irreversível. Ambos aplicam contenção de foco (`containFocus`), fechamento por `Escape`, bloqueio contra cliques duplicados, limpeza de `sonarfy_token` (preservando `sonarfy_theme`) e redirecionamento para `login.html`.

## Adapter HTTP e modo demonstração

Por padrão, `pages/account.html` utiliza o adapter HTTP real (`js/account-http.js` com `js/auth-http.js`):
- **Integrado ao backend:**
  - `GET /api/users/me` (`UserDto`): carrega nome, sobrenome, `@handle`, data de nascimento, cidade, país e e-mail, com renovação single-flight via `POST /api/auth/refresh` em `401`.
  - `PUT /api/users/me` (`UpdateUserDto` → `UserDto`): envia `name`, `surname`, `handle`, `birthDate` e `cityId` apenas quando uma nova cidade é selecionada; trata `400`, `409` (handle ocupado), `401` e `503`.
  - `GET /api/locations/cities?q=...` (`CityDto`): busca pública de cidades (sem cabeçalho `Authorization`) com cancelamento via `AbortController` e exibição de região/país.
  - `GET /api/spotify/connection` e `DELETE /api/spotify/connection`: exibe `CONNECTED`, `DISCONNECTED` e `REAUTHORIZATION_REQUIRED`, trata retorno `?spotify=connected|denied|invalid_state|error` limpando o query param da URL e exibe aviso de revogação no painel do Spotify ao desconectar.
  - `POST /api/users/me/password-change-request` e `PUT /api/users/me/password`: o botão **Redefinir Senha** solicita o link autenticado (respeitando cooldown/429); abrir `pages/account.html#password-change-token=...` extrai o token em memória, limpa o fragmento da URL, exibe o modal de confirmação de nova senha e, em `200`, limpa `sonarfy_token` e redireciona para `login.html?reset=true`.
  - `POST /api/users/me/email-change-request` e `POST /api/auth/email-change-confirmation`: o botão **Alterar E-mail** abre modal coletando novo e-mail e senha atual (tratando `202`, `400`, `401` senha incorreta sem expirar sessão, `404` quando `app.email-change.enabled=false`, `409` e `429`); a página `pages/confirm-email-change.html#token=...` extrai o token em memória, limpa a URL com `replaceState`, exige confirmação explícita e limpa `sonarfy_token` em `200`.
- **Ainda indisponível no modo HTTP real (sem simular sucesso):**
  - Verificação remota dedicada de disponibilidade do `@handle` (a unicidade é validada pelo backend no `PUT /api/users/me` com `409`).
  - Desativar conta e deletar conta (os modais informam indisponibilidade ao confirmar sem remover `sonarfy_token`).

O modo demonstração em memória (`js/account-fixtures.js`, `demo: true`) permanece disponível apenas via `?demo=true` ou injeção explícita de `window.sonarfyAccountAdapter`:

| Método / Propriedade | Contrato proposto de frontend |
| --- | --- |
| `load()` | Promise de `{ account: { id, firstName, lastName, handle, birthDate, city, country, cityId?, email, spotifyConnected } }` |
| `checkHandle(handle)` | Promise de `{ available: boolean }` |
| `searchCities(query)` | Promise de `Array<{ id?, name, adminName1?, countryName }>` (delegando a `window.sonarfyCitySearch` quando disponível) |
| `updateAccount(payload)` | Promise de `{ account, cooldownSeconds? }` |
| `requestEmailChange()` | Promise de `{ message?, cooldownSeconds? }` |
| `requestPasswordReset()` | Promise de `{ message?, cooldownSeconds? }` |
| `disconnectSpotify()` | Promise de `{ spotifyConnected: false }` |
| `deactivateAccount()` | Promise de `{ deactivated: true }` |
| `deleteAccount()` | Promise de `{ deleted: true }` |
| `routes` / `actions` | Rotas opcionais (`home`, `profile`, `settings`, `login`, `spotifySync`) e handlers (`logout`, `search`, `echoes`, `review`) |

## Verificação

Executado em 19/11/2026:
- `npm test`: **12 arquivos / 136 testes aprovados**, incluindo 9 testes em `tests/account.test.js` (validação de handle, disponibilidade, cidade/país, salvar/cancelar, Spotify sync, cooldowns e popups de desativação/exclusão).
- `node tests/browser/account.cjs`: **8/8 combinações aprovadas** (zero erros JS, zero overflow horizontal, SVGs e sprites carregados, drawer `296px`, edição de handle, autocomplete de cidade/país, modais de sucesso/desativação/exclusão e limpeza de `sonarfy_token`):

| Navegador | Desktop `1440px` claro/escuro | Mobile `390px` claro/escuro |
| --- | --- | --- |
| Microsoft Edge `157.0.4341.60` | Aprovados | Aprovados |
| Firefox `153.0` | Aprovados | Aprovados |

- **Limitações de verificação:** testes executados em navegadores headless com viewport mobile emulado (não em dispositivos físicos); dados, disponibilidade de `@handle`, busca de cidades, e-mail/senha e ações de conta usam fixtures locais simuladas neste repositório. Relatórios e capturas ficam em `test-results/account/` (ignorado pelo Git).
