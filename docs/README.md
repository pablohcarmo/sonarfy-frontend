# Documentação — Sonarfy Frontend

Este diretório concentra as especificações visuais, contratos de adapter, regras de estado e registros de verificação do frontend do Sonarfy (HTML5, CSS3 e JavaScript Vanilla).

## Base HTTP

`js/api.js` e o fallback de `resolveApiBaseUrl` em `js/auth-http.js` usam a origem da página seguida de `/api` fora de `localhost`/`127.0.0.1`. O ambiente publicado precisa de proxy reverso para o backend nesse caminho. Localmente, permanece `http://localhost:8080/api`. Bases explicitamente fornecidas ao cliente de autenticação mantêm precedência. Esta configuração usa integração HTTP; não ativa fixtures ou modo demonstração.

---

## Índice de Documentação

**Limitação conhecida (24/11/2026):** avaliações podem aparecer sempre como `0h` no ambiente validado pelo usuário, que identificou o problema no backend. Correção e nova validação com dados reais pendentes; o frontend mantém o cálculo baseado em `createdAt`, sem compensação local. Consulte [o registro no Feed](feed-page.md#tempo-das-avaliações-exibido-como-0h--24112026).

A navegação global usa **Avaliar Álbum** como link para a busca, tanto na sidebar quanto no menu hambúrguer de Feed, Perfil, Configurações, Ecos e Álbum. Contrato e destinos em [Avaliar Álbum](album-review-page.md).

A página [Avaliar Álbum](album-review-page.md) inclui busca automática por álbum/artista durante a digitação via `/api/albums/search`, seleção com detalhes oficiais e publicação sem sincronização Spotify pessoal, acessível pelo Feed.

- **[Referências do Figma](figma-references.md)** — Links, nós inspecionados, tokens de tema e especificações das telas Home, Login, Cadastro, Confirmação de e-mail, Verify Account e Spotify Sync.
- **[Perfis Sonarfy](profile-page.md)** — Perfil e relacionamentos via HTTP, contrato de `window.sonarfyProfileAdapter`, demonstração explícita, referências do Figma (`Profile Page` e `Profile Page (Friend)`), verificação e limitações.
- **[Feed Sonarfy](feed-page.md)** — Feed único paginado via `GET /api/feed` (`js/feed-http.js`), controle de cursor/concorrência, invalidação, reutilização do shell compartilhado, modo demonstração explícito (`?demo=true`) e verificação.
- **[Ecos Sonarfy](ecos-page.md)** — Contrato de `window.sonarfyEcosAdapter`, limite de 50 reproduções, estados (Populated, Empty/Spotify desconectado, Skeleton Loading, Error), referências do Figma (`Ecos Page`) e verificação.
- **[Página do Álbum](album-page.md)** — Integração HTTP via `js/album-http.js` (`GET /api/albums/{spotifyId}`, avaliação própria em `/reviews/me` e `DELETE /api/reviews/{reviewId}`), modal de capa expandida, compartilhamento, modo demonstração explícito (`?demo=true`), referências do Figma (`Album Page`) e verificação.
- **[Avaliar Álbum](album-review-page.md)** — Contrato de `window.sonarfyAlbumReviewAdapter`, escala de meia estrela (`0,5`–`5,0` ↔ `0`–`10`), resenha de 255 caracteres, modal de publicação, botão Favoritar álbum, referências do Figma (`Avaliar Álbum Page`) e verificação.
- **[Configurações da Conta](account-page.md)** — Contrato de `window.sonarfyAccountAdapter`, edição de `@handle` com disponibilidade, autocomplete de cidade/país, Spotify, cooldowns, popups de desativação/exclusão e verificação.
- **[Guia de Testes](../tests/README.md)** — Execução da suíte Vitest/Happy DOM (`npm test`) e dos scripts de verificação em navegador (`tests/browser/*.cjs`).

---

## Mapa de Páginas

| Página | Arquivo | Documentação de referência | Testes automatizados |
| --- | --- | --- | --- |
| Home / Landing | `index.html` | [figma-references.md](figma-references.md#home-index) | `tests/browser/login-home-assets.cjs`, `tests/browser/shared-brand.cjs` |
| Página não encontrada (404) | `404.html` | [figma-references.md](figma-references.md#not-found) | `tests/not-found.test.js`, `tests/browser/not-found.cjs` |
| Login | `pages/login.html` | [figma-references.md](figma-references.md#login) | `tests/login.test.js`, `tests/login-theme.test.js`, `tests/browser/login-home-assets.cjs` |
| Logout | `pages/logout.html` | [figma-references.md](figma-references.md#logout) | `tests/logout.test.js`, `tests/auth-http.test.js`, `tests/browser/logout.cjs` |
| Recuperação de Senha | `pages/reset-password.html` | [account-page.md](account-page.md) | `tests/password-flows.test.js`, `tests/browser/password-flows.cjs` |
| Confirmação de Troca de E-mail | `pages/confirm-email-change.html` | [account-page.md](account-page.md) | `tests/email-change.test.js`, `tests/browser/email-change.cjs` |
| Confirmação de Desativação de Conta | `pages/confirm-account-deactivation.html` | [account-page.md](account-page.md) | `tests/account-deactivation.test.js`, `tests/browser/account-deactivation.cjs` |
| Cadastro e Confirmação | `pages/register.html` | [figma-references.md](figma-references.md#cadastro-register), [Confirmação](figma-references.md#confirmacao-email) | `tests/register*.test.js`, `tests/validations.test.js`, `tests/browser/register.cjs`, `tests/browser/confirmation.cjs` |
| Verificação de Conta | `pages/verify.html` | [figma-references.md](figma-references.md#verify-account) | `tests/verify.test.js`, `tests/browser/shared-brand.cjs` |
| Conexão Spotify | `pages/spotify-sync.html` | [figma-references.md](figma-references.md#spotify-sync) | `tests/spotify-sync.test.js`, `tests/browser/spotify-sync.cjs` |
| Configurações da Conta | `pages/account.html` | [account-page.md](account-page.md) | `tests/account.test.js`, `tests/browser/account.cjs` |
| Perfil (próprio e visitante) | `pages/profile.html` | [profile-page.md](profile-page.md) | `tests/profile.test.js`, `tests/profile-http.test.js`, `tests/profile-reviews.test.js`, `tests/profile-collection.test.js`, `tests/browser/profile.cjs`, `tests/browser/profile-states.cjs`, `tests/browser/profile-following.cjs`, `tests/browser/profile-reviews.cjs`, `tests/browser/profile-collection.cjs` |
| Feed da Comunidade | `pages/feed.html` | [feed-page.md](feed-page.md) | `tests/feed.test.js`, `tests/feed-http.test.js`, `tests/browser/feed.cjs` |
| Ecos (Reproduções Spotify) | `pages/echoes.html` | [ecos-page.md](ecos-page.md) | `tests/ecos.test.js`, `tests/echoes-http.test.js`, `tests/browser/ecos.cjs` |
| Página do Álbum | `pages/album.html` | [album-page.md](album-page.md) | `tests/album.test.js`, `tests/album-http.test.js`, `tests/browser/album.cjs` |
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
| Feed | `js/feed-http.js` / `window.sonarfyFeedAdapter` | Integrado ao contrato HTTP (`GET /api/feed` com paginação por cursor opaco e `GET /api/profile/me` para avatar do visitante); feed único sem abas, atualizado ao carregar a página ou clicar no logo do Sonarfy, com ações sociais de curtir/comentar indisponíveis conforme o Figma; modo demonstração explícito em `?demo=true` | `docs/api/feed.md`, `docs/integrations/feed.md` |
| Ecos | `js/echoes-http.js` / `window.sonarfyEcosAdapter` | Integrado ao contrato HTTP (`GET /api/echoes/albums` com `rated`/`reviewId`, `GET /api/echoes/albums/{spotifyId}/listens`, `POST /api/echoes/sync`, `GET /api/spotify/connection`); modo demonstração explícito em `?demo=true`; endpoints validados localmente com mocks | `docs/api/echoes.md`, `docs/integrations/echoes.md` |
| Página do Álbum | `js/album-http.js` / `window.sonarfyAlbumAdapter` | Integrado ao contrato HTTP (`GET /api/albums/{spotifyId}`, `GET /api/albums/{spotifyId}/reviews/me`, `POST /api/albums/{spotifyId}/reviews`, `PUT/DELETE /api/reviews/{reviewId}`); lista de avaliações da comunidade marcada como indisponível até entrega no backend; modo demonstração explícito em `?demo=true` | `docs/api/albums.md`, `docs/integrations/album-page.md`, `docs/api/reviews.md`, `docs/integrations/reviews.md` |
| Avaliar Álbum | `js/album-review-http.js` / `window.sonarfyAlbumReviewAdapter` | Integrado ao contrato HTTP (`GET /api/albums/{spotifyId}/reviews/me`, `POST /api/albums/{spotifyId}/reviews`, `PUT /api/reviews/{reviewId}`, `DELETE /api/reviews/{reviewId}`); botão `Favoritar álbum` alterna estado local/opcional sem endpoint dedicado; modo demonstração explícito em `?demo=true` | `docs/api/reviews.md`, `docs/integrations/reviews.md` |
| Configurações da Conta | `js/account-http.js` / `window.sonarfyAccountAdapter` | Integrado via HTTP para `GET/PUT /api/users/me`, `GET /api/locations/cities`, `GET/DELETE /api/spotify/connection`, recuperação/troca de senha, troca de e-mail (`POST /api/users/me/email-change-request`, `POST /api/auth/email-change-confirmation`) e desativação de conta (`POST /api/users/me/account-deactivation-request`, `POST /api/auth/account-deactivation-confirmation`); exclusão permanente de conta ainda indisponível em HTTP; modo demonstração explícito em `?demo=true` | `docs/api/users-and-profile.md`, `docs/integrations/user-settings.md`, `docs/api/locations.md`, `docs/integrations/spotify.md`, `docs/api/passwords.md`, `docs/integrations/password-change.md`, `docs/api/email-changes.md`, `docs/integrations/email-change.md`, `docs/api/account-deactivation-http.md`, `docs/integrations/account-deactivation.md` |

## Fora do Escopo desta Versão (Implementações Futuras)

As funcionalidades abaixo não serão entregues nesta versão do Sonarfy e ficam planejadas para implementações futuras:

- **Pesquisas** e **Notificações**: mantidas em estado desabilitado na navegação global (`js/profile-shell.js`).
- **Curtidas, comentários e respostas em avaliações**: exibidos em estado indisponível/não interativo nos cards (`socialActions` / `.activity-social.is-unavailable`, sem contadores fictícios) e aba de respostas sem endpoint.
- **Páginas institucionais do rodapé** (`Termos de Uso`, `Privacidade`, `Diretrizes`, `Apoie o Sonarfy`): controles mantidos no rodapé global (`Footer / Global`) informando indisponibilidade, sem arquivos HTML dedicados nesta versão.

---

## Convenções de Documentação

- Todas as páginas em `pages/` seguem obrigatoriamente nomes em **inglês, minúsculo e `kebab-case`** (ex.: `reset-password.html`, `confirm-email-change.html`, `confirm-account-deactivation.html`, `spotify-sync.html`, `terms.html`, `privacy.html`, `guidelines.html`, `support.html`), alinhados às rotas referenciadas pelo backend (`AuthEmailService`, `EmailChangeDispatcher`, `AccountDeactivationDispatcher`).
- Toda entrega de página, componente compartilhado ou alteração de contrato/adapter deve atualizar a documentação correspondente neste diretório e em [tests/README.md](../tests/README.md).
- Cada documento de página deve registrar: referências do Figma, tokens/adaptações, contrato de dados ou adapter, limitações conhecidas e resultados de verificação (suíte unitária + Firefox e Microsoft Edge em desktop/mobile e temas claro/escuro).
- Capturas de tela em `docs/screenshots/` são versionadas apenas para documentação pública (ex.: [README.md](../README.md)); relatórios e capturas descartáveis de execução ficam em `test-results/`, ignorado pelo Git.
