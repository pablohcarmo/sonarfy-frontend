# Documentação — Sonarfy Frontend

Este diretório concentra as especificações visuais, contratos de adapter, regras de estado e registros de verificação do frontend do Sonarfy (HTML5, CSS3 e JavaScript Vanilla).

---

## Índice de Documentação

- **[Referências do Figma](figma-references.md)** — Links, nós inspecionados, tokens de tema e especificações das telas Home, Login, Cadastro, Confirmação de e-mail, Verify Account e Spotify Sync.
- **[Perfis Sonarfy](profile-page.md)** — Perfil e relacionamentos via HTTP, contrato de `window.sonarfyProfileAdapter`, demonstração explícita, referências do Figma (`Profile Page` e `Profile Page (Friend)`), verificação e limitações.
- **[Feed Sonarfy](feed-page.md)** — Contrato de `window.sonarfyFeedAdapter`, cache/reconciliação por aba, reutilização do shell compartilhado, referências do Figma (`Feed Page`) e verificação.
- **[Configurações da Conta](account-page.md)** — Contrato de `window.sonarfyAccountAdapter`, edição de `@handle` com disponibilidade, autocomplete de cidade/país, Spotify, cooldowns, popups de desativação/exclusão e verificação.
- **[Guia de Testes](../tests/README.md)** — Execução da suíte Vitest/Happy DOM (`npm test`) e dos scripts de verificação em navegador (`tests/browser/*.cjs`).

---

## Mapa de Páginas

| Página | Arquivo | Documentação de referência | Testes automatizados |
| --- | --- | --- | --- |
| Home / Landing | `index.html` | [figma-references.md](figma-references.md#home-index) | `tests/browser/login-home-assets.cjs`, `tests/browser/shared-brand.cjs` |
| Login | `pages/login.html` | [figma-references.md](figma-references.md#login) | `tests/login.test.js`, `tests/login-theme.test.js`, `tests/browser/login-home-assets.cjs` |
| Cadastro e Confirmação | `pages/register.html` | [figma-references.md](figma-references.md#cadastro-register), [Confirmação](figma-references.md#confirmacao-email) | `tests/register*.test.js`, `tests/validations.test.js`, `tests/browser/register.cjs`, `tests/browser/confirmation.cjs` |
| Verificação de Conta | `pages/verify.html` | [figma-references.md](figma-references.md#verify-account) | `tests/verify.test.js`, `tests/browser/shared-brand.cjs` |
| Conexão Spotify | `pages/spotify-sync.html` | [figma-references.md](figma-references.md#spotify-sync) | `tests/spotify-sync.test.js`, `tests/browser/spotify-sync.cjs` |
| Configurações da Conta | `pages/account.html` | [account-page.md](account-page.md) | `tests/account.test.js`, `tests/browser/account.cjs` |
| Perfil (próprio e visitante) | `pages/profile.html` | [profile-page.md](profile-page.md) | `tests/profile.test.js`, `tests/profile-http.test.js`, `tests/browser/profile.cjs`, `tests/browser/profile-states.cjs`, `tests/browser/profile-following.cjs` |
| Feed da Comunidade | `pages/feed.html` | [feed-page.md](feed-page.md) | `tests/feed.test.js`, `tests/browser/feed.cjs` |

---

## Pontos de Integração com o Backend

Os contratos HTTP autoritativos residem no repositório do backend (`sonarfy`, em `docs/api/` e `docs/integrations/`). Neste repositório, as telas que ainda não possuem integração direta com a API expõem pontos de injeção substituíveis pelo host:

| Tela / Fluxo | Ponto de integração no frontend | Estado atual | Referência esperada no backend |
| --- | --- | --- | --- |
| Cadastro / Cidades | `window.sonarfyCitySearch` / `GEONAMES_USERNAME` | Integrável; fallback local limitado | `docs/api/locations.md` e `docs/integrations/locations.md` |
| Login / Cadastro / Verify | Chamadas HTTP diretas via `js/env.js` | Integrado ao contrato base (refresh/logout HttpOnly pendentes) | `docs/api/authentication.md`, `docs/api/registration.md`, `docs/integrations/authentication.md` |
| Conexão Spotify | `window.sonarfySpotifyOAuth` | Fluxo UI e cooldown de 7 dias prontos; OAuth real pendente | `docs/integrations/spotify.md` |
| Perfil | `js/profile-http.js` / `window.sonarfyProfileAdapter` | Integrado via HTTP para identidade e relacionamentos (seguir/deixar de seguir); publicações e edição pendentes; demonstração explícita em `?demo=true` | `docs/api/profiles.md`, `docs/api/following.md`, `docs/integrations/profile-page.md` e `docs/integrations/following.md` |
| Feed | `window.sonarfyFeedAdapter` | Modo demonstração local (`js/feed-fixtures.js`) | Contrato de backend ainda não definido |
| Configurações da Conta | `window.sonarfyAccountAdapter` | Modo demonstração local (`js/account-fixtures.js`) | `docs/api/users-and-profile.md`, `docs/integrations/user-settings.md`, `email-change.md`, `password-change.md` |

---

## Convenções de Documentação

- Toda entrega de página, componente compartilhado ou alteração de contrato/adapter deve atualizar a documentação correspondente neste diretório e em [tests/README.md](../tests/README.md).
- Cada documento de página deve registrar: referências do Figma, tokens/adaptações, contrato de dados ou adapter, limitações conhecidas e resultados de verificação (suíte unitária + Firefox e Microsoft Edge em desktop/mobile e temas claro/escuro).
- Capturas de tela em `docs/screenshots/` são versionadas apenas para documentação pública (ex.: [README.md](../README.md)); relatórios e capturas descartáveis de execução ficam em `test-results/`, ignorado pelo Git.
