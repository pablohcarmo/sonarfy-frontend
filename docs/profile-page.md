# Perfis Sonarfy

Implementação em HTML5, CSS3 e módulos ES Vanilla, sem dependências novas.
Sirva a raiz do repositório e abra `pages/profile.html` (próprio) ou
`pages/profile.html?handle=lucas_vinyl` (visitante). `tab=activities|replies|collection`
mantém a aba na URL. O tema reutiliza `sonarfy_theme` e `js/login-theme.js`.

## Dados e integração

**Não existe contrato de API de perfil, mídia, relacionamento ou publicações neste
repositório.** Sem integração, a página mostra explicitamente demonstração local,
com fixtures isoladas em `js/profile-fixtures.js`. Editar, fazer upload, seguir e
curtir só modificam a memória da demonstração; recarregar restaura as fixtures.
Não há endpoints fictícios nem pedidos enviados ao backend para essas ações.

O host pode definir `window.sonarfyProfileAdapter` antes de carregar `profile.js`.
O adapter de produção substitui inteiramente as fixtures. Este é um ponto de
integração proposto para o frontend, não um contrato existente do backend:

| Método/propriedade | Resultado esperado |
| --- | --- |
| `load(handle)` | Promise de `{profile, session, activities, replies, collection, collectionTotal?}` |
| `collection(sort)` | Promise de itens ordenados/filtrados pelo serviço; sem descartar dados durante envio |
| `updateProfile({displayName,bio,avatar,cover})` | Promise dos dados públicos atualizados, após validação/permissão no servidor |
| `follow(boolean)` | Promise de `{isFollowing,followers}` reconciliados pelo servidor |
| `like(publicationId, boolean)` | Promise de `{liked,likeCount}` reconciliados pelo servidor |
| `upload(file, field)` | Promise da URL persistente da imagem; `field` é `avatar` ou `cover` |
| `uploadPolicy` | `{types: string[], maxBytes: number}` conforme o backend real |
| `routes` | Destinos opcionais `home`, `search`, `echoes`, `profile`, `settings` |
| `actions` | Handlers opcionais `search`, `echoes`, `review`, `logout`, `comments(id)`, `album(id)` |
| `publicOrigin` / `profileURL(profile)` | Origem pública configurada ou construção da URL pelo host |

`profile` contém `id`, `displayName`, `handle` (sem @), `avatar`, `cover`, `bio`,
`city`, `country`, `joinedAt`, `ratedCount`, `followers`, `following`, `isFollowing`.
`session.userId` identifica a sessão; propriedade é determinada por ID estável.
Não há fallback para nome/sobrenome privados. Identidade e autorização devem ser
confirmadas no servidor. Os limites são 50/150/255 caracteres para nome/bio/resenha.

Cada publicação contém `id`, `author` (perfil público), `album`
(`id,title,artist,mark,cover?`), `createdAt` ISO, `rating`, `review`, `replyTo?`,
`liked`, `likeCount`, `commentCount`. Respostas não mostram estrelas. O estado
reconcilia a mesma publicação no feed, na coleção e na caixa expandida por ID.
Mutações aguardam resposta, impedem envio concorrente e preservam dados em falha.

A demonstração carrega a coleção completa e a ordena localmente. Uma integração
paginada deve traduzir as opções para os parâmetros reais do serviço e entregar
o conjunto filtrado/ordenado e a contagem correta; não deve ordenar somente a
página atual como se ela representasse a coleção completa. A interface não inventa
um protocolo de paginação enquanto esse contrato não existir.

Login já grava `sonarfy_token`; Sair remove essa credencial e navega ao login.
O host pode substituir essa ação para revogação remota. Home e Configurações usam
as páginas existentes. Pesquisa, Ecos, Avaliar Álbum, comentários e álbum usam
handlers configuráveis; sem eles, mostram feedback de indisponibilidade. Ecos não
é redirecionado ao onboarding do Spotify. Notificações permanece um placeholder.
As páginas institucionais não existem na base atual; o footer informa essa
indisponibilidade ao acionar seus controles, sem links para arquivos inexistentes.

Compartilhar usa a rota real `/pages/profile.html?handle=...` na origem configurada,
Clipboard API, URLs das redes e Web Share com fallback de seleção manual.
As URLs de compartilhamento abrem os serviços externos; não há publicação automática.

## Referência visual e adaptações

Figma consultado somente para leitura: arquivo `kgOOkp9lzghCJtlBpSQtIj`, páginas
`210:2` (Profile Page) e `385:6710` (Profile Page (Friend)). Foram consultados
contextos e screenshots dos oito frames principais `212:2`, `212:167`, `212:285`,
`212:450`, `385:6711`, `385:6825`, `385:6920`, `385:7034`.

Também foram consultadas as quatro referências de respostas, os doze estados de
coleção, quatro caixas expandidas, quatro edições, oito compartilhamentos e quatro
drawers listados no briefing. Masters consultados: Sidebar Global `368:6383`
(variantes detalhadas `368:5081`, `368:5984`), Activity Card `328:956`, Collection
Card `351:3028`, skeletons `341:1808`, `341:2245`, `344:1920`, `351:3029`, `351:3030`,
ordenação `373:5128`/`373:5129`, seguir `386:1134` e metadados dos masters de modais.
Header, footer e feed foram inspecionados nas instâncias dos frames principais.

Code Connect recusou a consulta por limitação de plano/assento. Não há mapeamentos
locais no repositório. Os componentes foram adaptados a funções Vanilla
compartilhadas em `profile-shell.js` e `profile-views.js`, conservando os contratos
conceituais de ActivityFeed/ActivityCard e Sidebar Global. O design não foi alterado.

SVGs originais do MCP ficam em `assets/icons/profile`, com nomes descritivos,
geometria e cores preservadas por variantes de tema. Ícones são imagens locais,
sem reescrever paths; logos e controle de tema reutilizam assets existentes.
Capa waveform e capas fictícias de álbuns são primitivas CSS do próprio design;
imagens recebidas do adapter permanecem dinâmicas. Não há screenshots implementados
como página nem URLs temporárias no código. Tokens de perfil estão em
`:root`/`[data-theme="dark"]`, junto dos tokens globais reutilizados de `login.css`.

O aviso de demonstração ocupa uma linha extra acima do perfil (pode quebrar no
mobile), deslocando o conteúdo em relação ao Figma. Datas relativas usam o relógio
real; fixture “3h” avança normalmente. A bio, os nomes e as respostas usam a
identidade pública correta, mesmo onde o protótipo ainda mostra “Nome Sobrenome”.
O footer e os estados vazios crescem com o conteúdo; não reproduzem a altura fixa
dos frames. Avatar de demonstração é constante entre temas, como uma imagem da API.

## Verificação

`npm test`: 113 testes aprovados, incluindo regras de limites e timestamps,
ordenação sem mutação, permissões e concorrência/reconciliação de curtidas.

`node tests/browser/profile.cjs`: 16 combinações de perfil próprio/visitante,
Edge 155 e Firefox 153, 1440/390 px, claro/escuro. Exercita abas por teclado,
seguir independente do tema, curtir, coleção 4/2 colunas, resenha expandida,
compartilhar/copiar, cancelar/salvar, drawer, foco e assets.

`node tests/browser/profile-states.cjs`: 40 cenários nos mesmos navegadores,
larguras e temas, incluindo loading/reduced-motion, vazio, uma linha, textos longos,
imagem ausente, retry e falhas em curtida, ordenação, cópia, upload e salvamento.
Verifica resenha completa com 255 caracteres e remoção da credencial no logout.

Capturas/relatórios: `test-results/profile/` e `test-results/profile-states/`,
ignorados pelo Git. Foram comparadas visualmente capturas de atividades, coleção,
modais e drawer com o Figma; verificações automáticas conferem dimensões e overflow.
Mobile usa viewport emulado, não dispositivos físicos. Sessão/dados/mutações e
clipboard são controlados nos testes; não comprovam integração de backend ou
permissão real da área de transferência do sistema. Janelas externas de redes
sociais e o painel nativo de compartilhamento não foram automatizados.

## Divisão local por feature

As branches abaixo formam uma sequência de dependências; cada uma parte da anterior.
Para revisão pequena, compare cada branch com a anterior, não todas com `main`.
Não houve merge ou push. `feature/profile-page` permanece na base original.

1. `feature/profile-page-data`: adapter, fixtures, estado, regras e testes unitários.
2. `feature/profile-page-sidebar`: shell, navegação, tokens e assets globais.
3. `feature/profile-page-header`: entrada HTML e renderizadores compartilhados.
4. `feature/profile-page-content`: estilos de atividades/coleção e ações sociais.
5. `feature/profile-page-dialogs`: editar, compartilhar e resenha expandida.
6. `feature/profile-page-navigation`: inicialização, interações e teste de navegador.
7. `feature/profile-page-tests`: estados assíncronos e documentação.

A última branch contém a implementação completa pela ancestralidade dos commits,
sem commits de merge. A exclusão local pré-existente do logo legado foi preservada
e não integra os commits desta implementação.
