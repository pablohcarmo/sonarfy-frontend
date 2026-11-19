# Feed Sonarfy

Sirva a raiz e abra `pages/feed.html`. Implementação em HTML5 semântico, CSS3 e
módulos ES nativos, sem frameworks ou dependências de produção novas.
`tab=following|for-you` seleciona Seguindo/Para você; valores ausentes ou inválidos
são normalizados para `following`. As trocas mantêm outros parâmetros e permitem
Voltar/Avançar. Setas, Home e End alternam abas com foco e seleção ARIA.

## Figma e componentes

Arquivo `kgOOkp9lzghCJtlBpSQtIj`, página [Feed Page](https://www.figma.com/design/kgOOkp9lzghCJtlBpSQtIj/Sonarfy?node-id=406-11862), consultado via Figma MCP somente para leitura em 26/10/2026.

| Referência | Claro | Escuro |
| --- | --- | --- |
| Desktop / Feed | `406:11863` | `406:11870` |
| Mobile / Feed | `406:11866` | `406:11873` |
| Desktop / Empty | `406:11864` | `406:11871` |
| Mobile / Empty | `406:11867` | `406:11874` |
| Desktop / Loading | `406:11865` | `406:11872` |
| Mobile / Loading | `406:11868` | `406:11875` |
| Mobile / Drawer | `406:11869` | `406:11876` |

Metadados da página e dos masters foram recuperados. Contextos de alta fidelidade
e screenshots: quatro frames Feed, Empty `407:18`/`407:40` e skeleton mobile
`407:1232`. Estados e drawers foram identificados nos metadados; sua navegação
reutiliza o renderer já implementado do perfil.

Masters: Header / Global `187:548`, Sidebar / Global `368:6383`, Activity Card /
Global `328:956`, Activity Feed / Global `329:1420`, Footer / Global `175:216`.
Community Feed usa variantes `406:7802`, `406:8022`, `406:8242`, `406:8462` com
quatro publicações. Home ativo corresponde a `368:5123` (desktop claro),
`368:5774` (desktop escuro) e `368:5426` (drawer claro).
Abas: `407:2/24/46/68`; convite: `407:9/31/53/75`; vazio: `407:18/40/62/84`.

`profile-shell.js` compartilha header, footer, sidebar, skeleton; `profile-views.js`
compartilha cards, avatares, estrelas, capas e ações sociais. `profile-dialogs.js`
fornece contenção de foco para o drawer nativo. O perfil também usa os renderers
de header/footer extraídos, e Home aponta para `feed.html` nas duas páginas.
O sidebar admite seleção explícita de Home, mantendo o contrato anterior de Perfil.
Avatar, nome público e handle agora são links para `/pages/profile.html?handle=...`
no card global. O renderer valida 255 pontos de código Unicode sem truncar.

Reutilizados: tokens de `login.css`, `login-theme.js`, chave `sonarfy_theme`,
CSS global de perfil e SVGs locais em `assets/icons/profile`, marcas em
`assets/logos` e ícones de tema em `assets/icons/shared`. O novo Home ativo foi
baixado sem edição do SVG `1b5dd.svg` retornado pelo MCP, salvo como
`assets/icons/profile/active-home.svg`. Não existem URLs temporárias no runtime.

Feed usa os tokens globais branco/#1a1a1a para fundo, branco/#242424 para superfície,
#1a1a1a/branco para texto, #65676b/#b2b3b5 para texto secundário e
#ebecef/#65676b para bordas. Inter 400/500/600/700, azul #27a9f5.
Desktop: margens 40px, sidebar 248px, gap 32px e coluna 1080px em viewport 1440px.
Mobile: margens 16px e coluna 358px em viewport 390px. Header 88/80px;
título 28/24px; abas 56px, indicador 64×4px; convite com padding 16px/20px,
avatar 44px, CTA 40px; cards preservam padding 24/16px e gap vertical 16px.
Footer é o último elemento do body em fluxo normal; drawer modal não ocupa fluxo.

Adaptações previstas pelo contrato do perfil: aviso explícito de demonstração
acrescenta uma linha; conteúdo e rodapé crescem naturalmente; avatar de fixture
permanece constante entre temas como imagem de API. Capas fictícias são as mesmas
primitivas CSS do master. Datas usam relógio real, com horas abaixo de 24h
(incluindo `0h` para a fixture de 45 minutos), e Mês Dia a partir de 24h.
Os timestamps são atualizados a cada minuto sem reconstruir controles.

## Adapter e demonstração

Não há contrato de API de feed neste repositório. O host pode definir
`window.sonarfyFeedAdapter` **antes** do módulo `feed.js`; ele substitui inteiramente
as fixtures. Não se inventam endpoints, paginação ou sincronização Spotify.

| Método/propriedade | Contrato proposto de frontend |
| --- | --- |
| `load(tab)` | Promise de `{session, viewer?, followingCount, publications}` para `following` ou `for-you` |
| `like(publicationId, boolean)` | Promise de `{liked: boolean, likeCount: number}` autoritativos, contador finito não negativo |
| `routes` | URLs opcionais `home`, `search`, `echoes`, `profile`, `settings` |
| `actions` | Handlers opcionais `search`, `echoes`, `review`, `logout`, `comments(id)`, `album(id)` |

`session.userId` identifica a sessão (ou `session: null` para bloquear curtidas).
`viewer` é o perfil público do usuário conectado, usado no convite. `followingCount`
é inteiro não negativo. `publications` usa o contrato do perfil:
`id`, `author: {id,displayName,handle,avatar?}`, `album: {id,title,artist,mark,cover?}`,
`createdAt` ISO, `rating`, `review`, `liked`, `likeCount`, `commentCount`.
O servidor deve validar identidade, autorização e limites. Nomes privados não são
usados. Os handles de autores são resolvidos pelo adapter de perfil no destino;
as fixtures existentes de perfil reconhecem apenas o próprio usuário e Lucas.

Sem host, `feed-fixtures.js` fornece quatro publicações locais e uma sessão
explicitamente demonstrativa. Para você apresenta outra ordem sobre as mesmas
entidades. Curtidas só alteram memória; recarregar restaura a demonstração.

`feed-state.js` mantém cache por aba, loading/erro independentes e bloqueio de
mutação por ID. Atualiza todas as cópias somente após confirmação; rejeições e
respostas inválidas preservam conteúdo/contadores e liberam retry. Reconcila
também respostas de carregamento que chegam após uma curtida confirmada. Carregamentos
atrasados não trocam a aba selecionada. Refresh com falha preserva o cache anterior.

Seguindo com `followingCount: 0` mostra o vazio e permite explorar Para você;
feed sem publicações mostra um vazio genérico. Requisições mostram skeleton com
`aria-busy`; `prefers-reduced-motion` desliga sua animação. Falha de carga mostra
erro e Tentar novamente. Funcionalidades sem rota/handler mostram indisponibilidade.
Sair remove `sonarfy_token` antes de navegar ao login ou invocar logout do host,
inclusive quando revogação remota falha. Tema não é removido.

## Verificação

Comandos: `npm test`, `node tests/browser/feed.cjs`,
`node tests/browser/profile.cjs`, `node tests/browser/profile-states.cjs`.
O script Feed inicia/encerra o próprio servidor; aceita `PLAYWRIGHT_MODULE` para
uma instalação externa de Playwright, sem nova dependência no frontend.

Resultados em 26/10/2026: `npm test` aprovou **127 testes**, incluindo 14 de Feed.
`feed.cjs` aprovou as oito combinações abaixo, cada uma com seis cenários
(demo, loading, vazio, texto longo, retry/falha de curtida e logout):

| Navegador | Desktop 1440 claro/escuro | Mobile 390 claro/escuro |
| --- | --- | --- |
| Microsoft Edge 156.0.4314.42 | Aprovados | Aprovados |
| Firefox 153.0 | Aprovados | Aprovados |

Sem overflow horizontal em todos os estados. Verificados: header 88/80px,
card 1080/358px, avatar 48/44px, capa 112/84px, gaps 16px, alinhamento de estrelas
e ações, footer em fluxo e último elemento, SVGs locais carregados, abas por
teclado com foco visível, query/histórico, links de autores e Home de retorno,
reconciliação de curtidas, drawer 296px de largura/altura do viewport com foco
contido e Escape, reduced-motion, 255 pontos de código e remoção da credencial.
Nenhum erro JavaScript de página foi detectado. Capturas desktop/mobile em ambos
os temas foram revisadas visualmente com os screenshots do Figma.

Regressão dos componentes compartilhados: `profile.cjs` aprovou 16 combinações de
perfil próprio/visitante e `profile-states.cjs` aprovou 40 cenários, nos mesmos
navegadores/viewports/temas. A exclusão local pré-existente de
`assets/images/sonarfy-logo-legacy.png` foi preservada.

Capturas/JSON estão em `test-results/feed/`, ignorados pelo Git. Mobile é viewport
emulado; browsers headless não substituem aparelhos físicos. Dados/mutações de
estados são simulados e não demonstram integração com backend ou sessão real.
