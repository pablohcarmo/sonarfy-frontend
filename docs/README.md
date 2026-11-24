# Documentação — Sonarfy Frontend

Este diretório concentra as especificações visuais, contratos de adapter, regras de estado e registros de verificação do frontend do Sonarfy (HTML5, CSS3 e JavaScript Vanilla).

---

## Índice de Documentação

- **[Referências do Figma](figma-references.md)** — Links, nós inspecionados, tokens de tema e especificações das telas Home, Login, Cadastro, Confirmação de e-mail, Verify Account e Spotify Sync.
- **[Perfis Sonarfy](profile-page.md)** — Perfil e relacionamentos via HTTP, contrato de `window.sonarfyProfileAdapter`, demonstração explícita, referências do Figma (`Profile Page` e `Profile Page (Friend)`), verificação e limitações.
- **[Feed Sonarfy](feed-page.md)** — Contrato de `window.sonarfyFeedAdapter`, cache/reconciliação por aba, reutilização do shell compartilhado, referências do Figma (`Feed Page`) e verificação.
- **[Ecos Sonarfy](ecos-page.md)** — Contrato de `window.sonarfyEcosAdapter`, limite de 50 reproduções, estados (Populated, Empty/Spotify desconectado, Skeleton Loading, Error), referências do Figma (`Ecos Page`) e verificação.
- **[Avaliar Álbum](album-review-page.md)** — Contrato de `window.sonarfyAlbumReviewAdapter`, escala de meia estrela (`0,5`–`5,0` ↔ `0`–`10`), resenha de 255 caracteres, modal de publicação, botão Favoritar álbum, referências do Figma (`Avaliar Álbum Page`) e verificação.
- **[Configurações da Conta](account-page.md)** — Contrato de `window.sonarfyAccountAdapter`, edição de `@handle` com disponibilidade, autocomplete de cidade/país, Spotify, cooldowns, popups de desativação/exclusão e verificação.
- **[Guia de Testes](../tests/README.md)** — Execução da suíte Vitest/Happy DOM (`npm test`) e dos scripts de verificação em navegador (`tests/browser/*.cjs`).

---

## Mapa de Páginas

| Página | Arquivo | Documentação de referência | Testes automatizados |
| --- | --- | --- | --- |
| Home / Landing | `index.html` | [figma-references.md](figma-references.md#home-index) | `tests/browser/login-home-assets.cjs`, `tests/browser/shared-brand.cjs` |
| Login | `pages/login.html` | [figma-references.md](figma-references.md#login) | `tests/login.test.js`, `tests/login-theme.test.js`, `tests/browser/login-home-assets.cjs` |
| Logout | `pages/logout.html` | [figma-references.md](figma-references.md#logout) | `tests/logout.test.js`, `tests/auth-http.test.js`, `tests/browser/logout.cjs` |
| Recuperação de Senha | `pages/reset-password.html` | [account-page.md](account-page.md) | `tests/password-flows.test.js`, `tests/browser/password-flows.cjs` |
| Confirmação de Troca de E-mail | `pages/confirm-email-change.html` | [account-page.md](account-page.md) | `tests/email-change.test.js`, `tests/browser/email-change.cjs` |
| Cadastro e Confirmação | `pages/register.html` | [figma-references.md](figma-references.md#cadastro-register), [Confirmação](figma-references.md#confirmacao-email) | `tests/register*.test.js`, `tests/validations.test.js`, `tests/browser/register.cjs`, `tests/browser/confirmation.cjs` |
| Verificação de Conta | `pages/verify.html` | [figma-references.md](figma-references.md#verify-account) | `tests/verify.test.js`, `tests/browser/shared-brand.cjs` |
| Conexão Spotify | `pages/spotify-sync.html` | [figma-references.md](figma-references.md#spotify-sync) | `tests/spotify-sync.test.js`, `tests/browser/spotify-sync.cjs` |
| Configurações da Conta | `pages/account.html` | [account-page.md](account-page.md) | `tests/account.test.js`, `tests/browser/account.cjs` |
| Perfil (próprio e visitante) | `pages/profile.html` | [profile-page.md](profile-page.md) | `tests/profile.test.js`, `tests/profile-http.test.js`, `tests/profile-reviews.test.js`, `tests/profile-collection.test.js`, `tests/browser/profile.cjs`, `tests/browser/profile-states.cjs`, `tests/browser/profile-following.cjs`, `tests/browser/profile-reviews.cjs`, `tests/browser/profile-collection.cjs` |
| Feed da Comunidade | `pages/feed.html` | [feed-page.md](feed-page.md) | `tests/feed.test.js`, `tests/browser/feed.cjs` |
| Ecos (Reproduções Spotify) | `pages/echoes.html` | [ecos-page.md](ecos-page.md) | `tests/ecos.test.js`, `tests/echoes-http.test.js`, `tests/browser/ecos.cjs` |
| Avaliar Álbum | `pages/album-review.html` | [album-review-page.md](album-review-page.md) | `tests/album-review.test.js`, `tests/browser/album-review.cjs` |

---

## Pontos de Integração com o Backend

Os contratos HTTP autoritativos residem no repositório do backend (`sonarfy`, em `docs/api/` e `docs/integrations/`). Neste repositório, as telas que ainda não possuem integração direta com a API expõem pontos de injeção substituíveis pelo host:

| Tela / Fluxo | Ponto de integração no frontend | Estado atual | Referência esperada no backend |
| --- | --- | --- | --- |
| Cadastro / Cidades | `GET /api/locations/cities?q=...` (sobrescrevível via `window.sonarfyCitySearch`) | Integrado ao contrato `CityDto` e envio de `cityId` em `POST /api/auth/register` | `docs/api/locations.md` e `docs/integrations/locations.md` |
| Login / Sessão / Reativação / Cadastro / Verify | Chamadas HTTP via `js/api.js`, `js/login.js` e `js/auth-http.js` | Integrado ao contrato base (`cityId`, `PATCH /api/auth/update-pending-email` com `{ newEmail }`, reativação explícita via `POST /api/auth/reactivation` com `credentials: 'omit'`, `cache: 'no-store'` e `X-Sonarfy-CSRF: 1`, renovação single-flight via `POST /api/auth/refresh` e revogação via `POST /api/auth/logout` com cookie `HttpOnly` e `X-Sonarfy-CSRF: 1`) | `docs/api/authentication.md`, `docs/api/account-reactivation.md`, `docs/api/registration.md`, `docs/integrations/authentication.md`, `docs/integrations/account-reactivation.md` |
| Conexão Spotify | `js/spotify-http.js` / `window.sonarfySpotifyOAuth` | Integrado via HTTP (`POST /api/spotify/authorization`, `GET/DELETE /api/spotify/connection` com `recentListensAuthorized` e tratamento de `?spotify=connected\|denied\|invalid_state\|error`) mantendo cooldown de 7 dias ao pular | `docs/integrations/spotify.md` |
| Perfil | `js/profile-http.js` / `window.sonarfyProfileAdapter` | Integrado via HTTP para identidade, edição textual (`PUT /api/profile/me`), upload/recorte de avatar (`POST /api/profile/me/avatar`), upload de capa (`POST /api/profile/me/wallpaper`), relacionamentos (seguir/deixar de seguir), Avaliações (`GET /api/profile/by-handle/{handle}/reviews`) e Coleção (`GET /api/profile/by-handle/{handle}/collection`, com edição `PUT /api/reviews/{reviewId}` e exclusão `DELETE /api/reviews/{reviewId}` no modal próprio); respostas pendentes; demonstração explícita em `?demo=true` | `docs/api/profiles.md`, `docs/api/profile-avatar.md`, `docs/api/profile-wallpaper.md`, `docs/api/following.md`, `docs/api/profile-reviews.md`, `docs/api/profile-collection.md`, `docs/integrations/profile-page.md`, `docs/integrations/profile-media.md`, `docs/integrations/following.md` e `docs/integrations/profile-collection.md` |
| Feed | `window.sonarfyFeedAdapter` | Modo demonstração local (`js/feed-fixtures.js`) | Contrato de backend ainda não definido |
| Ecos | `js/echoes-http.js` / `window.sonarfyEcosAdapter` | Integrado ao contrato HTTP (`GET /api/echoes/albums` com `rated`/`reviewId`, `GET /api/echoes/albums/{spotifyId}/listens`, `POST /api/echoes/sync`, `GET /api/spotify/connection`); modo demonstração explícito em `?demo=true`; endpoints validados localmente com mocks | `docs/api/echoes.md`, `docs/integrations/echoes.md` |
| Avaliar Álbum | `js/album-review-http.js` / `window.sonarfyAlbumReviewAdapter` | Integrado ao contrato HTTP (`GET /api/albums/{spotifyId}/reviews/me`, `POST /api/albums/{spotifyId}/reviews`, `PUT /api/reviews/{reviewId}`, `DELETE /api/reviews/{reviewId}`); botão `Favoritar álbum` alterna estado local/opcional sem endpoint dedicado; modo demonstração explícito em `?demo=true` | `docs/api/reviews.md`, `docs/integrations/reviews.md` |
| Configurações da Conta | `js/account-http.js` / `window.sonarfyAccountAdapter` | Integrado via HTTP para `GET/PUT /api/users/me`, `GET /api/locations/cities`, `GET/DELETE /api/spotify/connection`, recuperação/troca de senha e troca de e-mail (`POST /api/users/me/email-change-request`, `POST /api/auth/email-change-confirmation`); desativar/deletar conta ainda indisponíveis em HTTP; modo demonstração explícito em `?demo=true` | `docs/api/users-and-profile.md`, `docs/integrations/user-settings.md`, `docs/api/locations.md`, `docs/integrations/spotify.md`, `docs/api/passwords.md`, `docs/integrations/password-change.md`, `docs/api/email-changes.md`, `docs/integrations/email-change.md` |

---

## Convenções de Documentação

- Todas as páginas em `pages/` seguem obrigatoriamente nomes em **inglês, minúsculo e `kebab-case`** (ex.: `reset-password.html`, `confirm-email-change.html`, `spotify-sync.html`, `terms.html`, `privacy.html`, `guidelines.html`, `support.html`), alinhados às rotas referenciadas pelo backend (`AuthEmailService`, `EmailChangeDispatcher`).
- Toda entrega de página, componente compartilhado ou alteração de contrato/adapter deve atualizar a documentação correspondente neste diretório e em [tests/README.md](../tests/README.md).
- Cada documento de página deve registrar: referências do Figma, tokens/adaptações, contrato de dados ou adapter, limitações conhecidas e resultados de verificação (suíte unitária + Firefox e Microsoft Edge em desktop/mobile e temas claro/escuro).
- Capturas de tela em `docs/screenshots/` são versionadas apenas para documentação pública (ex.: [README.md](../README.md)); relatórios e capturas descartáveis de execução ficam em `test-results/`, ignorado pelo Git.
