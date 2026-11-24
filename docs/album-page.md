# Página do Álbum — Sonarfy

Sirva a raiz do repositório e abra `pages/album.html` (com cenários opcionais `?scenario=rated`, `?scenario=already-rated`, `?scenario=empty`, `?scenario=loading` e `?scenario=error`). Implementação em HTML5 semântico, CSS3 e módulos ES nativos, sem frameworks ou dependências de produção novas. O tema reutiliza `sonarfy_theme` e `js/login-theme.js`.

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

Reutilizados: `css/login.css`, `css/profile.css`, `css/profile-activity.css`, `css/profile-dialogs.css`, `js/login-theme.js`, `js/profile-shell.js` (`Header / Global`, `Sidebar / Global` com `Active Item=None`, `Footer / Global`), `js/profile-views.js` (`socialActions`), `js/profile-dialogs.js` (contenção de foco do drawer e do modal de capa expandida), `js/profile-icons.js`, `js/profile-utils.js`, `assets/logos/` e `assets/icons/shared/`.

SVGs extraídos localmente em `assets/icons/album/`:
- `spotify-black.svg`
- `share-light.svg` / `share-dark.svg`
- `edit-light.svg` / `edit-dark.svg`
- `delete-light.svg` / `delete-dark.svg`

Não existem URLs temporárias do Figma no runtime.

## Esqueleto, adapter (`window.sonarfyAlbumAdapter`) e modo demonstração

Como o endpoint HTTP de detalhes do álbum e avaliações da comunidade ainda está em desenvolvimento no backend, `pages/album.html` opera em **modo esqueleto / demonstração local** via `js/album-fixtures.js`, exibindo aviso explícito (`#album-demo`). Um host ou futuro `js/album-http.js` pode injetar `window.sonarfyAlbumAdapter` **antes** de `js/album.js` com o contrato:

- `loadAlbum({ albumId, sort })`: retorna `{ album, userReview, reviews }`.
- `deleteReview(reviewId)`: remove a avaliação própria após confirmação inline.
- `routes`: rotas relativas opcionais (`home`, `profile`, `settings`, `echoes`, `review`, `login`).
- `isDemo`: controla a exibição do banner de demonstração local.

Funcionalidades implementadas no esqueleto:
- **Hero do álbum**: capa clicável (abre modal `<dialog id="album-cover-dialog">` de capa expandida), título, artista, ano/quantidade de faixas, média da comunidade com estrelas e contagem, pill de nota própria quando avaliado, CTA principal (`Avaliar este álbum` / `Editar minha avaliação` com deep link para `album-review.html`), CTA `Ouça no Spotify` em conformidade com as diretrizes do Spotify (ícone monocromático preto `1:1` com mínimo de `21px` — `22×22px` desktop e `21×21px` mobile —, área de respiro `>= 0,5×` em todos os lados e alto contraste sobre `#1ED760`) e botão de compartilhamento de link.
- **Sua Avaliação**: card destacado com ações de editar e excluir (com confirmação inline `Confirmar exclusão` / `Cancelar`).
- **Avaliações da Comunidade**: ordenação (`Mais recentes`, `Maior nota`, `Menor nota`), cards com nota em estrelas + badge, suporte a avaliação apenas com nota (sem texto), ações sociais de curtir/comentar reutilizando `socialActions` (`js/profile-views.js` + `css/profile-activity.css`) em estado indisponível e não interativo (`aria-disabled="true"`, tooltips e sem contadores fictícios ou mensagens no topo da página), estado vazio (`Nenhuma avaliação para este álbum ainda`), skeleton loading (`aria-busy="true"`) e estado de erro com `Tentar novamente`.

## Verificação

- **Suíte unitária (`npm test`)**: **268 testes em 29 arquivos** aprovados em Vitest + Happy DOM (incluindo `tests/album.test.js`).
- **Verificação de navegador (`node tests/browser/album.cjs`)**: 8 combinações aprovadas sem erros de página e sem overflow horizontal:
  - **Microsoft Edge `158.0.4370.33`**: `1440px` e `390px`, temas claro e escuro.
  - **Firefox `159.0`**: `1440px` e `390px`, temas claro e escuro.
- **Limitações**: mobile verificado por viewport emulado em navegador headless; dados de álbum e avaliações são simulados por fixtures locais enquanto o endpoint do backend está em desenvolvimento.
