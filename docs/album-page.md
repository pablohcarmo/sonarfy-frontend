# Página do Álbum — Sonarfy

Sirva a raiz do repositório e abra `pages/album.html?albumId=<spotifyId>` (ou use o modo demonstração explícito com `?demo=true` e cenários opcionais `?scenario=rated`, `?scenario=already-rated`, `?scenario=empty`, `?scenario=loading` e `?scenario=error`). Implementação em HTML5 semântico, CSS3 e módulos ES nativos, sem frameworks ou dependências de produção novas. O tema reutiliza `sonarfy_theme` e `js/login-theme.js`.

## Figma e componentes

Arquivo `kgOOkp9lzghCJtlBpSQtIj`, página [Album Page](https://www.figma.com/design/kgOOkp9lzghCJtlBpSQtIj/Sonarfy?node-id=547-2), consultada via Figma MCP somente para leitura em 24/11/2026.

| Referência | Claro | Escuro |
| --- | --- | --- |
| Desktop / Rated | `547:3` | `547:592` |
| Desktop / Empty | `547:119` | `547:708` |
| Desktop / Loading | `547:207` | `547:796` |
| Mobile / Rated | `547:295` | `547:884` |
| Mobile / Empty | `547:371` | `547:960` |
| Mobile / Loading | `547:419` | `547:1008` |
| Mobile / Drawer | `547:467` | `547:1056` |
| Desktop / Já Avaliado | `552:624` | `552:836` |
| Mobile / Já Avaliado | `552:750` | `552:962` |
| Desktop / Capa Expandida | `587:897` | `587:1034` |
| Mobile / Capa Expandida | `587:966` | `587:1103` |

Reutilizados: `css/login.css`, `css/profile.css`, `css/profile-activity.css`, `css/profile-dialogs.css`, `js/login-theme.js`, `js/auth-http.js`, `js/album-review-http.js`, `js/echoes-http.js` (`parseRetryAfterSeconds`), `js/profile-shell.js` (`Header / Global`, `Sidebar / Global` com `Active Item=None`, `Footer / Global`), `js/profile-views.js` (`socialActions`), `js/profile-dialogs.js` (contenção de foco do drawer e do modal de capa expandida), `js/profile-icons.js`, `js/profile-utils.js`, `assets/logos/` e `assets/icons/shared/`.

SVGs extraídos localmente em `assets/icons/album/`:
- `spotify-black.svg`
- `share-light.svg` / `share-dark.svg`
- `edit-light.svg` / `edit-dark.svg`
- `delete-light.svg` / `delete-dark.svg`

Não existem URLs temporárias do Figma no runtime.

## Integração HTTP (`js/album-http.js`), adapter e modo demonstração

Por padrão, `pages/album.html` utiliza `createHttpAlbumAdapter()` (`js/album-http.js`), autenticado com Bearer Sonarfy via `js/auth-http.js` (renovação single-flight em `401` e encerramento de sessão quando expirada), sem exigir conexão Spotify pessoal nem disparar sincronização de Ecos:

- `GET /api/albums/{spotifyId}`: carrega `spotifyId`, `name`, `coverUrl`, `artist`, `releaseOn`, `releasePrecision` (`ano`, `mes`, `dia` sem inventar partes ausentes), `totalTracks`, `averageRating` (escala `0–10` convertida para `0–5` dividindo por 2; `null` diferenciado de `0`) e `reviewCount`.
- `GET /api/albums/{spotifyId}/reviews/me`: controla o estado `Avaliar este álbum` / `Editar minha avaliação` e o card `Sua Avaliação`; `404` indica ausência de avaliação própria sem tratar o álbum como inexistente.
- `POST /api/albums/{spotifyId}/reviews`, `PUT /api/reviews/{reviewId}` e `DELETE /api/reviews/{reviewId}`: fluxo de criação/edição via `album-review.html` e exclusão inline com confirmação; após mutações, grava `sonarfy_reviews_dirty` para sincronizar Ecos, Coleção e feed, além de reconsultar `GET /api/albums/{spotifyId}` (e revalidar em `pageshow`/`storage`) para atualizar média e contagem.
- `GET /api/profile/me`: consultado de forma não bloqueante para exibir nome público e `@handle` no card `Sua Avaliação`.
- Tratamento de erros: `400` (identificador inválido), `401` (fluxo de sessão Sonarfy), `404` (álbum não encontrado), `502`/`503`/`504` (falha do catálogo sem solicitar OAuth Spotify pessoal, respeitando `Retry-After` sem loops de retry) e proteção contra respostas atrasadas em troca de álbum ou conta (`AbortController`, `popstate`, `storage`, `BroadcastChannel`).
- Compartilhamento usa a URL real da página Sonarfy (`navigator.share` quando disponível, com fallback para `navigator.clipboard.writeText`).
- Link `Ouça no Spotify` aponta para `https://open.spotify.com/album/{spotifyId}`.
- Pontos de entrada integrados:
  - **Perfil (`pages/profile.html`)**: clicar na capa/título do álbum em **Coleção** ou **Avaliações** navega para `album.html?albumId=<spotifyId>` (mantendo a abertura do modal de avaliação ao clicar na prévia da resenha).
  - **Ecos (`pages/echoes.html`)**: clicar na capa do álbum ou no link `Ver álbum` (ao lado de `Abrir no Spotify`) navega para `album.html?albumId=<spotifyId>`, preservando a expansão de faixas na linha e o atalho `Avaliar`/`Avaliado` para `album-review.html`.
  - **Feed (`pages/feed.html`)**: clicar no bloco do álbum na coluna direita de cada card (`interactiveAlbum: true`) navega para `album.html?albumId=<spotifyId>`.

Um host pode sobrescrever o adapter injetando `window.sonarfyAlbumAdapter` **antes** de `js/album.js`. O modo demonstração local com fixtures (`js/album-fixtures.js`) permanece disponível apenas de forma explícita via `?demo=true` ou `?scenario=...`, exibindo o aviso `#album-demo`.

### Seção de avaliações da comunidade

A listagem e ordenação de avaliações da comunidade ainda não está disponível no backend. Em modo HTTP (`communityReviewsAvailable: false`), a seção exibe um estado explícito de funcionalidade em breve (`data-community-unavailable`), sem dados fictícios, sem seletor de ordenação e sem confundir indisponibilidade com ausência de avaliações.

## Verificação

- **Suíte unitária (`npm test`)**: **280 testes em 31 arquivos** aprovados em Vitest + Happy DOM (incluindo `tests/album-http.test.js`, `tests/album.test.js` e `tests/profile-collection.test.js`).
- **Verificação de navegador (`node tests/browser/album.cjs`)**: 8 combinações aprovadas sem erros de página e sem overflow horizontal, interceptando `GET /api/albums/{spotifyId}`, `GET /api/albums/{spotifyId}/reviews/me`, `DELETE /api/reviews/{reviewId}` e `GET /api/profile/me`:
  - **Microsoft Edge `158.0.4370.33`**: `1440px` e `390px`, temas claro e escuro.
  - **Firefox `159.0`**: `1440px` e `390px`, temas claro e escuro.
- **Limitações**: mobile verificado por viewport emulado em navegador headless; testes automatizados de navegador e unidade interceptam/simulam respostas HTTP e não executam contra o backend real em execução. **Lista de avaliações da comunidade**, **curtidas, comentários, respostas**, **Pesquisas**, **Notificações** e **páginas institucionais do rodapé** ficam fora desta entrega.
