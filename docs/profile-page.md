# Perfis Sonarfy

Implementação em HTML5, CSS3 e módulos ES Vanilla, sem dependências novas.
Sirva a raiz do repositório e abra `pages/profile.html` (próprio) ou
`pages/profile.html?handle=lucas_vinyl` (visitante). `tab=activities|replies|collection`
mantém a aba na URL. O tema reutiliza `sonarfy_theme` e `js/login-theme.js`.

Home agora abre [Feed](feed-page.md) em `pages/feed.html`. Header e footer
também são renderizados por `profile-shell.js`; os cards globais compartilham
links de perfil no avatar, nome e handle, além da validação de resenha no renderer.

## Dados e integração

O cabeçalho e os relacionamentos usam o backend por padrão. A página sem handle
consulta GET `/api/profile/me`; com handle consulta também
GET `/api/profile/by-handle/{handle}`. A identidade autenticada vem de `/me`,
não de IDs fornecidos pela URL, fixtures ou decodificação do token no navegador.

`js/profile-http.js` mapeia somente `ProfileDto.identity`, `viewer.isFollowing`, `viewer.canEdit` e
`statistics.followers/following`. Não exibe campos cadastrais privados nem inventa
contagem de álbuns no carregamento inicial do perfil; assim que a Coleção (`GET /api/profile/by-handle/{handle}/collection`) é carregada, `totalReviews` sincroniza `profile.ratedCount` no cabeçalho (`#profile-header` com ícone `disc-light.svg`/`disc-dark.svg`, número em negrito e rótulo `Álbuns Avaliados` em tom secundário conforme o Figma `383:6710` / `383:6726`) e no modal de compartilhamento. A aba **Avaliações** (`#panel-activities`) consome
`GET /api/profile/by-handle/{handle}/reviews` (Bearer, `limit=20`, cursor `beforeId`,
sem `@`, ordem `reviewId` decrescente), exibindo nota `rating / 2` com precisão de
quartos de estrela, resenha escapada como texto e paginação por “Carregar mais avaliações”,
preservando o layout `Activity Card / Global` com ícones sociais sem contadores fictícios.
Respostas permanecem com indisponibilidade explícita nesta entrega. A aba **Coleção** (`#panel-collection`) consome `GET /api/profile/by-handle/{handle}/collection` (Bearer, `limit=20`, `sort=recent|oldest|highest|lowest`, `writtenOnly=true|false`, `cursor` opaco, `cache: 'no-store'`), preservando a ordem do servidor, exibindo `totalReviews` como “N álbuns avaliados” e `matchingReviews` separadamente quando filtrada, além de paginação com “Carregar mais álbuns”, retry em falha de rede e ações de edição/exclusão no diálogo apenas quando o ID do autor coincide com a sessão autenticada (invalidação automática após exclusão e em `pageshow`).
A edição textual do próprio perfil (`PUT /api/profile/me` com `displayName` até 60 pontos de código e `biography` até 150), o upload/recorte circular de avatar (`POST /api/profile/me/avatar` com `multipart/form-data`, `file` JPEG/PNG estático ≤ 5 MiB / ≤ 16 MP e `cropX`/`cropY`/`cropSize` inteiros em pixels orientados por EXIF) e o upload de capa/wallpaper (`POST /api/profile/me/wallpaper` com campo único `file` JPEG/PNG estático ≤ 5 MiB / ≤ 16 MP e enquadramento responsivo `object-fit: cover`) estão integrados quando `viewer.canEdit === true`. Os estilos e a sidebar global existentes foram preservados.

O token de acesso existente em `sonarfy_token` é enviado no header Authorization
Bearer, com credentials=omit e cache=no-store. Não enviar token na URL nem header
CSRF para estas operações Bearer. Base da API: `js/api.js`; localhost usa
`http://localhost:8080/api`, conforme o backend local. O endereço remoto existente
continua dependendo da configuração real do ambiente. A mudança de porta também
se aplica às páginas de login/cadastro que já usam esse arquivo compartilhado.

Seguir usa PUT e deixar de seguir usa DELETE em `/api/profile/{identity.id}/following`,
sem corpo. Somente 204 confirma a mutação; o adapter faz um novo GET do perfil e
reconcilia estado e contadores com a resposta. Não incrementa números localmente.
Durante a operação o botão fica desabilitado e cliques adicionais são ignorados.
Falha de mutação ou da leitura posterior preserva o último snapshot e oferece
Atualizar estado; esse próximo clique apenas consulta o perfil, sem enviar uma
nova mutação ou inverter uma operação cujo resultado seja incerto. Em falha não
anuncia sucesso. O próprio perfil não apresenta botão de seguir.

Sem token inicial, remove a credencial e encaminha para login sem enviar requisição.
Em `401` com token presente, `js/auth-http.js` tenta uma única renovação via
`POST /api/auth/refresh` (`credentials: 'include'`, `cache: 'no-store'`, `X-Sonarfy-CSRF: 1`)
com deduplicação concorrente (single-flight) e repete a requisição uma única vez; se o
refresh ou o retry falhar, limpa o token e encaminha para `login.html`.
404 informa perfil indisponível; falhas HTTP de servidor usam mensagem genérica sem
classificá-las como falha de conexão; falhas de rede no carregamento exibem
“Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.”
sem expor mensagens técnicas do navegador nem recorrer a fixtures, preservando o
botão “Tentar novamente” que remove o erro anterior ao recuperar o perfil.
Respostas recebidas após troca de token são descartadas. Alteração de sessão em
outra aba recarrega a página; reconciliação de um perfil substituído é descartada.

### Demonstração explícita

Use `pages/profile.html?demo=true` ou
`pages/profile.html?demo=true&handle=lucas_vinyl` para as fixtures isoladas.
Nunca há fallback para demonstração após falha de rede ou autenticação.
Edição, uploads, publicações e curtidas continuam simulados apenas nesse modo;
recarregar restaura as fixtures. Compartilhamento gera a URL canônica de perfil
real, sem propagar demo=true. O host ainda pode injetar `window.sonarfyProfileAdapter`.

No adapter HTTP, load retorna `{profile,session,contentAvailable:false,activities:[],replies:[],collection:[]}`;
follow retorna o perfil público reconciliado. O adapter demonstrativo mantém seus
métodos collection, updateProfile, like e upload para a regressão visual.
`profile` contém identidade pública, mídia, localização e os três campos reais
followers/following/isFollowing. `session.userId` é normalizado como string para
comparação com profile.id. O limite demonstrativo de edição continua em 50/150;
o futuro editor real deve usar os limites do backend (60/150 pontos de código).

Cada publicação contém `id`, `author` (perfil público), `album`
(`id,title,artist,mark,cover?`), `createdAt` ISO, `rating`, `review`, `replyTo?`,
`liked`, `likeCount`, `commentCount`. Respostas não mostram estrelas. O estado
reconcilia a mesma publicação no feed e na coleção por ID. No perfil, a caixa
expandida da avaliação (`Collection / Expanded Review Box` `362:4160`: `362:4044` Light Desktop,
`362:4073` Light Mobile, `362:4102` Dark Desktop, `362:4131` Dark Mobile) não exibe
curtidas nem comentários; mostra apenas os dois botões quadrados `40 × 40px` (`border-radius: 8px`)
somente-ícone de Editar avaliação (`656:8316`/`656:8324`, ícone de lápis `edit-light.svg`/`edit-dark.svg`, que transiciona o modal para `Collection / Expanded Review Box (Editando)` `663:8412` — `663:8316` Light Desktop, `663:8340` Light Mobile, `663:8364` Dark Desktop, `663:8388` Dark Mobile — com caixa de texto editável e botão `Salvar` `40px` `#27a9f5` que envia `PUT /api/reviews/{reviewId}`)
e Excluir avaliação (`656:8318`/`656:8326`, ícone de lixeira `trash-light.svg` `#b42318` / `trash-dark.svg` `#fda29b`, que transiciona para `Collection / Expanded Review Box (Confirmar Exclusão)` `667:8980` — `667:8884`, `667:8908`, `667:8932`, `667:8956` — com botões `Confirmar exclusão` `#b42318`/`#fda29b` e `Cancelar`, enviando `DELETE /api/reviews/{reviewId}` somente ao confirmar),
e somente quando o ID do autor coincide com a sessão autenticada (perfis de terceiros ficam só leitura).
Mutações aguardam resposta, impedem envio concorrente e preservam dados em falha.

A demonstração carrega a coleção completa e a ordena localmente. Uma integração
paginada deve traduzir as opções para os parâmetros reais do serviço e entregar
o conjunto filtrado/ordenado e a contagem correta; não deve ordenar somente a
página atual como se ela representasse a coleção completa. A interface não inventa
um protocolo de paginação enquanto esse contrato não existir.

Login já grava `sonarfy_token`; Sair abre `pages/logout.html` e, ao confirmar (ou via
ações diretas de logout na sidebar), chama `POST /api/auth/logout` com `credentials: 'include'`
e `X-Sonarfy-CSRF: 1`, remove `sonarfy_token` no `finally` e navega ao login.
O host pode substituir essa ação para revogação remota. Home, Ecos e Configurações usam
as páginas existentes. **Pesquisar**, **Notificações**, **curtidas/comentários/respostas**
e as **páginas institucionais do rodapé** (`Termos de Uso`, `Privacidade`, `Diretrizes`,
`Apoie o Sonarfy`) ficam fora desta versão do Sonarfy (implementações futuras); Pesquisar
e Notificações permanecem desabilitadas na sidebar global e o footer informa indisponibilidade
sem links para arquivos inexistentes. Avaliar Álbum e álbum usam handlers configuráveis
quando não há rota direta. Ecos não é redirecionado ao onboarding do Spotify.

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

## Validação de relacionamentos — 20/11/2026

- npm test: 14 arquivos / 160 testes passaram, incluindo o adapter HTTP, tradução de
  falhas de rede/JSON sem mensagens técnicas e reconciliação de relacionamentos.
- tests/browser/profile-following.cjs: Edge 157.0.4341.60 e Firefox 153.0,
  headless, viewports 1440px e 390px (mobile emulado), claro e escuro: oito
  combinações aprovadas. Capturas em test-results/profile-following.
- As requisições são interceptadas pelo Playwright com respostas simuladas.
  Cobertura: perfil próprio/visitante, dados públicos reais do contrato, ausência
  de fixtures, seguir/deixar de seguir, clique duplo, estado pendente, GET posterior,
  recuperação após 204 seguido de erro, 404 com retry, falha de rede com mensagem
  amigável e recuperação por “Tentar novamente”, 401, foco e drawer mobile.
- Não representa validação pela rede contra o backend real, uso de contas reais,
  teste em celular físico ou CI remoto. A validação manual integrada do fluxo
  completo depende do ambiente com backend local ativo.

Roteiro manual: iniciar backend com migração 008 aplicada e servir a raiz do
frontend por HTTP em uma origem permitida pelo CORS do backend (por padrão,
http://localhost:63342; manter o host localhost). Fazer login com conta de teste e abrir pages/profile.html:
confirmar identidade, contagens e ausência do botão seguir. Abrir
profile.html?handle=<outra conta de teste>, seguir e deixar de seguir; conferir
PUT/DELETE 204 seguidos de GET 200 e valores reais. Simular perda da leitura após
uma mutação e usar Atualizar estado: deve haver somente GET, até reconciliar.
Verificar 404 sem dados fictícios e 401 encaminhando ao login. Não compartilhar
headers de autorização, credenciais ou capturas que exibam tokens.

Regressão de demonstração: profile.cjs passou em 16 combinações próprio/visitante,
Edge/Firefox, desktop/mobile, claro/escuro. profile-states.cjs passou em 40 cenários;
a expectativa antiga de logout foi alinhada à confirmação já existente na main.
As capturas mobile escura e desktop clara do fluxo HTTP foram inspecionadas.
