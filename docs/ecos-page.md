# Ecos Sonarfy

Sirva a raiz do repositório e abra `pages/echoes.html` (ou `pages/echoes.html?demo=true` para modo demonstração local). Implementação em HTML5 semântico, CSS3 e módulos ES nativos, sem frameworks ou dependências de produção novas. O tema reutiliza `sonarfy_theme` e `js/login-theme.js`.

## Figma e componentes

Arquivo `kgOOkp9lzghCJtlBpSQtIj`, página [Ecos Page](https://www.figma.com/design/kgOOkp9lzghCJtlBpSQtIj/Sonarfy?node-id=543-2), consultado via Figma MCP somente para leitura em 23/11/2026.

| Referência | Claro | Escuro |
| --- | --- | --- |
| Desktop / Populated | `543:3` | `543:685` |
| Desktop / Empty (Spotify desconectado) | `543:140` | `543:822` |
| Desktop / Loading (Skeleton) | `543:220` | `543:902` |
| Mobile / Populated | `543:336` | `543:1018` |
| Mobile / Empty (Spotify desconectado) | `543:427` | `543:1109` |
| Mobile / Loading (Skeleton) | `543:467` | `543:1149` |
| Mobile / Drawer | `543:543` | `543:1225` |

Metadados da página (`543:2`) e contextos de alta fidelidade (`543:3` / grupo `558:614`, `543:140`, `543:220`, `543:336` / grupo `558:701`, `543:543`, `543:685` / grupo `558:851`, `543:822`, `543:1018` / grupo `558:938`) foram recuperados via MCP, além dos screenshots de `543:3` e `543:685`.
As linhas de reprodução não utilizam o símbolo `"♪"` e iniciam recolhidas (`aria-expanded="false"`, indicador `▸`), expandindo sob demanda (`▾`, divisor `1px` e lista de faixas alinhada à direita da capa no desktop e à largura total no mobile) sem interferir no botão independente `Avaliar`.
Reutilizados: `css/login.css`, `js/login-theme.js`, `js/profile-shell.js` (`Header / Global`, `Sidebar / Global`, `Footer / Global`), `js/profile-dialogs.js` (contenção de foco do drawer mobile), `js/profile-icons.js`, `assets/logos/` e `assets/icons/shared/`.
Novos SVGs extraídos localmente sem edição em `assets/icons/ecos/`:
- `assets/icons/ecos/active-ecos.svg` (ícone ativo de Ecos na sidebar/drawer, `#27A9F5`)
- `assets/icons/ecos/spotify-dot.svg` (indicador `#1ED760` `8×8px` do status de sincronização e badge "Ouvindo agora")
- Reutilizados no estado desconectado: `assets/icons/spotify-sync/spotify.svg` (`64×64px`) e `assets/icons/spotify-sync/spotify-button.svg` (`24×23px`) ao lado de `"Conectar ao Spotify"`, com chip superior exibindo `"Desconectado"` (ponto `#8c8d90`) sem contador nem botão de atualização.

Não existem URLs temporárias do Figma no runtime.

## Adapter, integração HTTP e regras de negócio

Por padrão, `pages/echoes.html` usa `createHttpEchoesAdapter` (`js/echoes-http.js`) integrado ao backend (`GET /api/echoes/albums?limit=20&cursor=...`, `GET /api/echoes/albums/{spotifyId}/listens?limit=20&cursor=...`, `POST /api/echoes/sync` e `GET /api/spotify/connection`). O host ainda pode definir `window.sonarfyEcosAdapter` **antes** de `js/ecos.js`, ou usar `?demo=true` para carregar fixtures locais em `js/ecos-fixtures.js`.

- **Escopo de escutas recentes (`GET /api/spotify/connection`)**: lê `recentListensAuthorized`; quando `status === "CONNECTED"` e `recentListensAuthorized === false`, orienta a reconexão via `spotify-sync.html?source=echoes` (ou `?source=account` em Configurações).
- **Listagem de álbuns distintos (`GET /api/echoes/albums?limit=20&cursor=<opaco>`)**: exibe um único card por `album.spotifyId` na ordem exata retornada pelo backend (`lastPlayedAt` decrescente), com `listenCount` (`1 reprodução` / `N reproduções`), preservando `rated` e `reviewId` para exibir `"Avaliar"` (`rated: false`) ou `"Avaliado"` (`rated: true`, mantendo navegação por `album.spotifyId` para edição), sem fabricar `reviewId` ou artistas ausentes no resumo, mantendo edições distintas separadas e paginando via `nextCursor` (`Carregar mais álbuns`). A capa do álbum (`.eco-cover-link`) e o link discreto **`Ver álbum`** (`.eco-album-link`, ao lado de `Abrir no Spotify`) redirecionam diretamente para `album.html?albumId=<spotifyId>` sem interferir na expansão de faixas ou no botão `Avaliar`/`Avaliado`. Ao restaurar a página via histórico/bfcache (`pageshow` com `persisted: true`), `store.revalidate()` revalida os dados sem disparar `POST /api/echoes/sync`. Falhas de paginação preservam os cards já carregados e permitem nova tentativa. O histórico importado permanece visível mesmo quando o Spotify é desconectado ou exige reautorização.
- **Histórico sob demanda por álbum (`GET /api/echoes/albums/{spotifyId}/listens?limit=20&cursor=<opaco>`)**: os cards iniciam recolhidos (`aria-expanded="false"`, indicador `▸`) e carregam as escutas sob demanda na primeira expansão (reutilizando o cache ao recolher e reabrir até nova invalidação), com cursor, loading, erro/retry e paginação independentes por `album.spotifyId` (`Carregar mais reproduções deste álbum`), preservando repetições da mesma faixa com `item.id` distintos, exibindo artistas, duração e horário `HH:mm`.
- **Sincronização manual (`POST /api/echoes/sync`)**: exibe `Conectado · Sincronizar` no chip do topo, invalida a lista, os históricos carregados e todos os cursores após `200`, descarta respostas obsoletas iniciadas antes da invalidação, reinicia a listagem sem `cursor`, exibe avisos para `possibleGap === true` e `complete === false`, respeita `Retry-After` (incluindo respostas parciais `200`, `429` e `503`) e `sync.nextAllowedAt`, consulta `GET /api/spotify/connection` em `409` e exibe mensagens amigáveis em `502`/`504` sem detalhes técnicos.
- **Regras de domínio**: Ecos exibe apenas reproduções recentes efetivamente ouvidas e importadas pelo Sonarfy (não músicas curtidas/salvas, biblioteca ou playlists), com aviso explícito de que o Spotify disponibiliza apenas reproduções recentes.
- **Sidebar compartilhada**: `"Ecos"` aponta para `echoes.html` em `js/profile-shell.js` (`feed.html`, `profile.html`, `account.html` e `echoes.html`, com `aria-current="page"` em `echoes.html`).

## Verificação

Comandos: `npm test` e `node tests/browser/ecos.cjs`.
`npm test` aprovou **280 testes** em 31 arquivos (incluindo `tests/ecos.test.js`, `tests/echoes-http.test.js` e `tests/spotify-http.test.js`).
O script `tests/browser/ecos.cjs` verifica Microsoft Edge e Firefox em `1440px` e `390px`, nos temas claro e escuro, cobrindo estados Populated (álbuns agrupados, recolhidos por padrão, expansão sob demanda por teclado e redirecionamento para `pages/album.html?albumId=...` via capa e `Ver álbum`), Loading (`aria-busy="true"` e `prefers-reduced-motion`), Empty (`spotify-sync.html?source=echoes`), Error + Retry, drawer mobile (`296px`, contenção de foco e `Escape`), foco visível, carregamento de SVGs locais, ausência de overflow horizontal e remoção de `sonarfy_token` no logout.

Capturas e relatório JSON ficam em `test-results/ecos/`, ignorados pelo Git. Mobile utiliza viewport emulado em navegador headless; dados e estados são simulados via fixtures/adapter de teste e não comprovam integração real com backend ou API do Spotify.
