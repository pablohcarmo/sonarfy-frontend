# Avaliar Álbum — Sonarfy

Sirva a raiz do repositório e abra `pages/album-review.html` (ou `pages/album-review.html?demo=true` para modo demonstração local). Implementação em HTML5 semântico, CSS3 e módulos ES nativos, sem frameworks ou dependências de produção novas. O tema reutiliza `sonarfy_theme` e `js/login-theme.js`.

## Figma e componentes

Arquivo `kgOOkp9lzghCJtlBpSQtIj`, página [Avaliar Álbum Page](https://www.figma.com/design/kgOOkp9lzghCJtlBpSQtIj/Sonarfy?node-id=573-150), consultado via Figma MCP somente para leitura em 23/11/2026.

| Referência | Claro | Escuro |
| --- | --- | --- |
| Desktop / Formulário | `573:151` | `573:423` |
| Mobile / Formulário | `573:252` | `573:524` |
| Mobile / Drawer | `573:312` | `573:584` |
| Desktop / Publicada (Modal) | `591:298` | `591:414` |
| Mobile / Publicada (Modal) | `591:357` | `591:473` |
| Estados do Botão Favoritar | `593:456` | `593:464` |

Reutilizados: `css/login.css`, `css/profile.css`, `css/profile-dialogs.css`, `js/login-theme.js`, `js/profile-shell.js` (`Header / Global`, `Sidebar / Global` com `Active Item=None`, `Footer / Global`), `js/profile-dialogs.js` (contenção de foco do drawer e modal), `js/profile-icons.js`, `assets/logos/` e `assets/icons/shared/`.

Novos SVGs extraídos localmente em `assets/icons/album-review/`:
- `star-full.svg` (`32×32`)
- `star-half.svg` (`32×32`)
- `star-empty.svg` (`32×32`, contorno correspondente a `star-half.svg`)
- `success-badge.svg` (`56×56`)

Não existem URLs temporárias do Figma no runtime.

## Adapter, integração HTTP e regras de negócio

Por padrão, `pages/album-review.html` usa `createHttpAlbumReviewAdapter` (`js/album-review-http.js`) integrado ao backend (`GET /api/albums/{spotifyId}/reviews/me`, `POST /api/albums/{spotifyId}/reviews`, `PUT /api/reviews/{reviewId}`, `DELETE /api/reviews/{reviewId}`), autenticado via `createAuthClient` / `authorizedFetch` (`js/auth-http.js`) com renovação single-flight em `401` (`POST /api/auth/refresh`), `credentials: 'omit'`, `cache: 'no-store'` e revogação via `logoutSession()`. O host pode definir `window.sonarfyAlbumReviewAdapter` **antes** de `js/album-review.js`, ou usar `?demo=true` para carregar fixtures locais em `js/album-review-fixtures.js`.

- **Escala de avaliação**: a interface exibe 5 estrelas com seleção de meia estrela (`0,5` a `5,0`) e converte para a escala persistida do backend (`0` a `10` em passos de `0,5`, via `rating = estrelas * 2` e `estrelas = rating / 2`).
- **Resenha opcional**: limite de `255` pontos de código Unicode (`[...text].length`), com contador em tempo real; strings vazias ou apenas espaços são normalizadas para `null` no envio.
- **Conflito `409`**: caso já exista avaliação publicada para o álbum, o adapter recarrega `GET /api/albums/{spotifyId}/reviews/me` e alterna para o modo de edição (`PUT /api/reviews/{reviewId}`) sem sobrescrever automaticamente.
- **Botão Favoritar álbum (Modal de Sucesso)**: `Favoritar álbum` / `Desfavoritar álbum` alterna o estado visual (`aria-pressed`) localmente no modo demonstração ou via hook opcional `toggleFavorite` do adapter, pois o backend ainda não expõe endpoint de favoritos (`is_favorite` permanece `false` por padrão na criação).
- **Botão Fazer outra avaliação (Modal de Sucesso)**: fecha o modal e redireciona para Ecos (`adapter.routes?.echoes || 'echoes.html'`).

## Verificação

- **Suíte unitária (`npm test`)**: **283 testes em 31 arquivos** aprovados em Vitest + Happy DOM (incluindo `tests/album-review.test.js` com cobertura de refresh single-flight em `401`, expiração em falha de refresh e `logoutSession()`).
- **Script de navegador (`node tests/browser/album-review.cjs`)**: 8 combinações aprovadas sem erros de página e sem overflow horizontal:
  - **Microsoft Edge `158.0.4370.33`**: `1440px` e `390px`, temas claro e escuro.
  - **Firefox `159.0`**: `1440px` e `390px`, temas claro e escuro.
- **Limitações**: mobile emulado em navegador headless; testes de navegador executam contra fixtures `?demo=true` e testes unitários simulam respostas HTTP sem servidor backend real.
