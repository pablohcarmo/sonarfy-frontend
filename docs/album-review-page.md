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
- **Botão Fazer outra avaliação (Modal de Sucesso)**: fecha o modal e retorna a `album-review.html` para escolher outro álbum; preserva `?demo=true` no modo demonstrativo.
- **Fechar confirmação**: botão de ícone no canto superior direito fecha o modal e redireciona ao Feed (`adapter.routes.home` ou `feed.html`), preservando `?demo=true` no adapter demonstrativo. Escape apenas fecha o modal e devolve o foco ao botão de publicação. O bloqueio de rolagem é removido ao fechar. Validado no script de navegador em Edge/Firefox, desktop/mobile e claro/escuro, com HTTP simulado.

## Busca e seleção sem sincronização — 24/11/2026

O botão **Avaliar Álbum** do Feed (convite, sidebar/drawer e estado vazio) abre `pages/album-review.html`. Sem `albumId`, o fluxo HTTP mostra busca por nome de álbum ou artista em `js/album-search.js`; não usa o álbum demonstrativo como fallback. O menu global **Pesquisar** continua como funcionalidade futura; esta busca é específica para avaliação.

O CTA **Avaliar Álbum** da navegação global (`js/profile-shell.js`) agora é um link compartilhado para essa busca em Feed, Perfil, Configurações, Ecos e Álbum, tanto na sidebar quanto no drawer. Não depende de handlers locais nem recebe o álbum da página atual. Usa `routes.review` quando configurada; senão, `album-review.html`, preservando `?demo=true` em demonstração. Ações contextuais **Avaliar este álbum** e **Editar minha avaliação** continuam no modal inline da página do Álbum.

- `GET /api/albums/search?q=<consulta>&limit=10&offset=0`: busca automática 350ms após a última digitação, sem botão Buscar; Enter antecipa a consulta. Aceita 2–100 pontos de código Unicode após trim, sem NUL. Composição de texto (IME) aguarda sua conclusão; limpar o campo ou sair da página cancela o timer e a requisição. Mantém a relevância retornada pelo backend, identifica álbuns por `spotifyId` e envia `nextOffset` nas páginas seguintes (até 1000); não inventa totais globais. Falha inicial oferece **Tentar novamente**, sem repetição automática.
- Alterar a entrada cancela requisições anteriores e limpa os resultados; respostas atrasadas são descartadas mesmo quando um adapter ignora o cancelamento. Falhas de paginação preservam resultados e offset para nova tentativa. Busca vazia, carregamento e erro são estados distintos; `Retry-After` positivo em 503 aparece na mensagem, sem repetição automática.
- Selecionar um resultado abre `album-review.html?albumId=<spotifyId>`. A página primeiro consulta `GET /api/albums/{spotifyId}`, com ID alfanumérico de 22 caracteres; essa operação resolve/persiste o catálogo. Depois consulta `/reviews/me`, cujo 404 significa ausência da avaliação. Metadados de parâmetros de URL não substituem a resposta oficial.
- O formulário só fica disponível após ambas as leituras. Falhas oferecem nova tentativa e seleção de outro álbum. Avaliação existente abre edição (inclusive nota zero); publicação mantém a recuperação de duplicata 409, sem sobrescrever automaticamente.
- O adapter HTTP expõe `searchAlbums(query, { offset, signal })` e `loadAlbumDetails(spotifyId)`, além das operações existentes. Usa Bearer Sonarfy, renovação compartilhada, `credentials: 'omit'` e `cache: 'no-store'`. Não consulta conexão pessoal Spotify, não inicia OAuth e não sincroniza escutas.
- `?demo=true` e cenários explícitos continuam exibindo somente o formulário de demonstração anterior, com fixtures locais; a busca normal usa HTTP real e não possui fallback para dados fictícios.

Contrato conferido somente para leitura em `C:/Projetos/sonarfy/docs/api/album-search.md` e no controller correspondente. Nenhum arquivo do backend foi modificado.

## Verificação

Atualização em 24/11/2026: **293 testes em 32 arquivos** aprovados. Os scripts `tests/browser/album-review.cjs` e `tests/browser/feed.cjs` passaram em oito combinações cada: Edge **158.0.4370.33** e Firefox **153.0**, **1440px/390px**, claro/escuro. Incluem fluxo de busca, paginação, indisponibilidade/retry, detalhes antes da avaliação, conflito 409 e PUT. Capturas da busca desktop claro/mobile escuro revisadas visualmente. HTTP interceptado, navegadores headless e mobile emulado; não valida deploy ou publicação real no backend. Ver [registro de testes](../tests/README.md). A evidência histórica abaixo refere-se à entrega anterior.

- **Suíte unitária (`npm test`)**: **283 testes em 31 arquivos** aprovados em Vitest + Happy DOM (incluindo `tests/album-review.test.js` com cobertura de refresh single-flight em `401`, expiração em falha de refresh e `logoutSession()`).
- **Script de navegador (`node tests/browser/album-review.cjs`)**: 8 combinações aprovadas sem erros de página e sem overflow horizontal:
  - **Microsoft Edge `158.0.4370.33`**: `1440px` e `390px`, temas claro e escuro.
  - **Firefox `159.0`**: `1440px` e `390px`, temas claro e escuro.
- **Limitações**: mobile emulado em navegador headless; testes de navegador executam contra fixtures `?demo=true` e testes unitários simulam respostas HTTP sem servidor backend real.
