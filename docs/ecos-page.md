# Ecos Sonarfy

Sirva a raiz do repositório e abra `pages/ecos.html`. Implementação em HTML5 semântico, CSS3 e módulos ES nativos, sem frameworks ou dependências de produção novas. O tema reutiliza `sonarfy_theme` e `js/login-theme.js`.

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

Metadados da página (`543:2`) e contextos de alta fidelidade (`543:3`, `543:140`, `543:220`, `543:336`, `543:543`, `543:685`, `543:822`, `543:1018`) foram recuperados via MCP.
Reutilizados: `css/login.css`, `js/login-theme.js`, `js/profile-shell.js` (`Header / Global`, `Sidebar / Global`, `Footer / Global`), `js/profile-dialogs.js` (contenção de foco do drawer mobile), `js/profile-icons.js`, `assets/logos/` e `assets/icons/shared/`.
Novos SVGs extraídos localmente sem edição em `assets/icons/ecos/`:
- `assets/icons/ecos/active-ecos.svg` (ícone ativo de Ecos na sidebar/drawer, `#27A9F5`)
- `assets/icons/ecos/spotify-dot.svg` (indicador `#1ED760` `8×8px` do status de sincronização e badge "Ouvindo agora")

Não existem URLs temporárias do Figma no runtime.

## Adapter e regras de negócio

Não há contrato de API de Ecos/reproduções recentes implementado neste repositório. O host pode definir `window.sonarfyEcosAdapter` **antes** do módulo `js/ecos.js`; caso contrário, `js/ecos-fixtures.js` fornece 50 reproduções locais em modo demonstração explícito.

| Método/propriedade | Contrato proposto de frontend |
| --- | --- |
| `load()` | Promise de `{ connected: boolean, items: EcoItem[] }` |
| `refresh()` | Promise de `{ connected: boolean, items: EcoItem[] }` (opcional; faz fallback para `load()`) |
| `routes` | URLs opcionais `home`, `search`, `echoes`, `profile`, `settings`, `album`, `login` |
| `actions` | Handlers opcionais `album(albumId)`, `search`, `notifications`, `review`, `logout` |

Cada `EcoItem` contém `id`, `album: { id, title, artist, cover?, color?, mark? }`, `trackName` (ou `track`), `playedAt` (ISO 8601) e `isPlaying` (booleano).

Regras implementadas em `js/ecos-state.js` e `js/ecos.js`:
- **Limite de 50 itens**: `ECOS_MAX_ITEMS = 50`; `validateEcos` trunca listas maiores que 50 itens.
- **Timestamps**: `"Ouvindo agora"` quando `isPlaying === true`; relativo `< 24h` em minutos (`18m`) ou horas (`3h`); e `Mês Dia` (`Nov 20`) a partir de `24h`, atualizado a cada minuto sem reconstruir controles.
- **Estados**: **Populated** (até 50 linhas album-first com capa `64×64px` desktop / `52×52px` mobile, título, artista, `♪ Faixa ouvida: "..."`, timestamp e ação `Avaliar`), **Empty / Spotify Not Connected** (`"Conecte seu Spotify"` com link para `spotify-sync.html?source=ecos`), **Skeleton Loading** (`aria-busy="true"`, animação desligada em `prefers-reduced-motion`), e **Error + "Tentar novamente"**.
- **Concorrência de atualização**: `createEcosState` bloqueia chamadas concorrentes de `load()` / `refresh()` enquanto uma requisição está em andamento e preserva os dados já carregados em caso de erro no refresh.
- **Navegação de álbum e saída**: clicar na linha ou em `Avaliar` chama `actions.album(albumId)` ou navega para `routes.album`, exibindo feedback de indisponibilidade quando não há handler/página configurada. Sair remove `sonarfy_token` mesmo quando a revogação remota falha.
- **Sidebar compartilhada**: `"Ecos"` foi conectado à rota `ecos.html` em `js/profile-shell.js`, tornando o link ativo em `feed.html`, `profile.html`, `account.html` e `ecos.html` (com `aria-current="page"` em `ecos.html`).

## Verificação

Comandos: `npm test` e `node tests/browser/ecos.cjs`.
`npm test` aprovou **214 testes** em 22 arquivos (incluindo 7 testes em `tests/ecos.test.js`).
O script `tests/browser/ecos.cjs` verifica Microsoft Edge e Firefox em `1440px` e `390px`, nos temas claro e escuro, cobrindo estados Populated (50 itens), Loading (`aria-busy="true"` e `prefers-reduced-motion`), Empty (`spotify-sync.html?source=ecos`), Error + Retry, drawer mobile (`296px`, contenção de foco e `Escape`), foco por teclado, carregamento de SVGs locais, ausência de overflow horizontal e remoção de `sonarfy_token` no logout.

Capturas e relatório JSON ficam em `test-results/ecos/`, ignorados pelo Git. Mobile utiliza viewport emulado em navegador headless; dados e estados são simulados via fixtures/adapter de teste e não comprovam integração real com backend ou API do Spotify.
