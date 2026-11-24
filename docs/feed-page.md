# Feed Sonarfy

Sirva a raiz e abra `pages/feed.html`. Implementação em HTML5 semântico, CSS3 e
módulos ES nativos, sem frameworks ou dependências de produção novas.

## Decisões funcionais e substituição das abas

O feed demonstrativo dividido em abas (`Seguindo` / `Para você` com `?tab=...`) foi
substituído por um **único feed paginado** de avaliações próprias e dos perfis
seguidos, consumindo o contrato real do backend (`GET /api/feed`).

- Não há abas (`Para você`, `Seguindo`, `Seguidores`), filtros ou parâmetros de aba na URL.
- O feed reúne avaliações próprias e de perfis seguidos (com ou sem resenha), incluindo avaliações anteriores ao seguimento.
- Seguir alguém não gera publicação; deixar de seguir remove esse autor das próximas consultas.
- A ordem recebida do servidor (`reviewId` decrescente) é preservada integralmente; editar nota ou texto não reposiciona o card.
- Novas publicações são carregadas ao carregar a página ou clicar no logo do Sonarfy (reiniciando a paginação), sem inserção automática durante a navegação.
- Não exige conexão Spotify.
- Likes, comentários e respostas não estão ativos nesta versão; os botões de curtir e comentar são exibidos no card em estado indisponível (`aria-disabled="true"`, `.activity-social.is-unavailable`, sem contadores fictícios), seguindo o layout global do Figma e o padrão já adotado em Atividades do Perfil. **Pesquisas** e **Notificações** ficam fora desta versão (implementações futuras).

## Contrato HTTP real e mapeamento

O adapter padrão (`js/feed-http.js`) consome:

- `GET /api/feed?limit=20&cursor=<token>` com `Authorization: Bearer <accessToken>`, `credentials: 'omit'` e `cache: 'no-store'` (via `js/auth-http.js`).
- `GET /api/profile/me` para obter o avatar do visitante no convite de avaliação rápida (`#quick-review`).

Mapeamento de cada item de `items`:

- `reviewId` → identidade estável do card (`id`/`reviewId`);
- `author` (`id`, `handle`, `displayName`, `avatarUrl`) → identidade e link para `/pages/profile.html?handle=...`;
- `album` (`spotifyId`, `name`, `coverUrl`, `artist.spotifyId`, `artist.name`) → capa, título, artista e link externo `Abrir no Spotify`;
- `rating / 2` → escala de `0` a `5` estrelas em passos de `0,25` (nota zero e quartos de estrela preservados sem dupla conversão);
- `reviewText` → texto opcional renderizado com escape HTML (validação até 255 pontos de código Unicode);
- `createdAt` → data relativa/absoluta atualizada pelo relógio real;
- `updatedAt` → preservado sem reordenar o card.

O bloco do álbum na coluna direita de cada card (`[data-album]`, com `interactiveAlbum: true`) navega diretamente para `album.html?albumId=<spotifyId>` (preservando `?demo=true` em modo demonstração ou `adapter.actions.album` quando injetado por host), mantendo também o link externo `Abrir no Spotify` e a navegação de perfil por handle.

## Paginação, concorrência, estados e invalidação

- **Carregamento inicial, adicional e atualização**: estados distintos (`loadingInitial`, `loadingMore`, `refreshing`). O botão acessível **Carregar mais avaliações** envia `nextCursor` intacto e encerra quando `nextCursor === null` ou quando uma página adicional vem vazia (sem apagar os cards já exibidos).
- **Concorrência e respostas atrasadas**: cada início/atualização incrementa a geração da consulta, cancela requisições anteriores com `AbortController` e valida geração, sessão e cursor antes de aplicar respostas. Carregamentos adicionais simultâneos para a mesma fronteira são bloqueados.
- **Estados vazios**: `followingCount = 0` não oculta avaliações próprias. Quando a primeira página está vazia:
  - `followingCount === 0`: orienta avaliar ou seguir perfis usando apenas rotas existentes (`album-review.html`, `profile.html`);
  - `followingCount > 0`: informa que ainda não há avaliações disponíveis.
- **Erros**:
  - `401`: segue `createAuthClient` (renovação single-flight única e expiração para `login.html`, sem loops).
  - `400`: indica paginação inválida/expirada e oferece **Recarregar do início**, sem repetição infinita.
  - Rede/5xx: erro contextual com **Tentar novamente**; no carregamento adicional preserva cards e cursor; no inicial não faz fallback silencioso para fixtures.
- **Invalidação e sessão**: recarrega o início em eventos `storage` (`sonarfy_reviews_dirty`, `sonarfy_following_dirty`), no clique do logo do Sonarfy (`a.brand`) e no retorno via histórico/bfcache (`pageshow` com `event.persisted`). Troca de sessão ou logout (`sonarfy_token`, `BroadcastChannel('sonarfy_auth')`, ação Sair) limpa imediatamente itens, cursor e estados pendentes.

## Modo demonstração explícito e override de host

O modo demonstração local (`js/feed-fixtures.js`) só é ativado explicitamente via `?demo=true` (com aviso `#feed-demo` visível) ou por injeção de `window.sonarfyFeedAdapter` antes de `js/feed.js`. No fluxo normal (`pages/feed.html`), o adapter HTTP real é sempre usado.

## Figma e componentes compartilhados

Arquivo `kgOOkp9lzghCJtlBpSQtIj`, página [Feed Page](https://www.figma.com/design/kgOOkp9lzghCJtlBpSQtIj/Sonarfy?node-id=406-11862).
Reutiliza `profile-shell.js` (header, footer, sidebar com Home ativo, skeleton), `profile-views.js` (`activityCard` com `socialUnavailable: true` e `interactiveAlbum: true`), `profile-dialogs.js` (`containFocus`), tokens de `login.css`/`login-theme.js` e SVGs locais.

## Verificação

Comandos executados em 24/11/2026:

- `npm test`: **31 arquivos / 280 testes aprovados** (inclui `tests/feed.test.js` e `tests/feed-http.test.js`).
- `node tests/browser/feed.cjs` (interceptando `GET /api/feed`, `GET /api/profile/me` e `POST /api/auth/logout` no HTTP real do navegador): **8/8 combinações aprovadas** (5 cenários: `populated-paginated`, `loading`, `empty-zero`, `empty-following`, `error-retry`, incluindo navegação para `pages/album.html?albumId=<spotifyId>` ao clicar no álbum).
- `node tests/browser/profile.cjs` (regressão dos componentes compartilhados): **16/16 combinações aprovadas**.

| Navegador | Versão | Desktop 1440 claro/escuro | Mobile 390 claro/escuro | Dados |
| --- | --- | --- | --- | --- |
| Microsoft Edge | `158.0.4370.33` | Aprovado | Aprovado | HTTP interceptado (simulado) |
| Firefox | `159.0` | Aprovado | Aprovado | HTTP interceptado (simulado) |

## Limitações

### Tempo das avaliações exibido como `0h` — 24/11/2026

Durante a validação manual, o usuário observou todas as avaliações com tempo `0h` e informou que o problema é do backend. A correção permanece pendente no backend; esta entrega do frontend não corrige nem compensa os horários recebidos. A causa técnica específica e a abrangência dos registros afetados não foram confirmadas nesta verificação.

O frontend usa `createdAt` para calcular horas completas: menos de uma hora aparece como `0h`; de uma a menos de 24 horas, `1h` a `23h`; a partir de 24 horas, mês e dia. Portanto, `0h` isoladamente é esperado para uma publicação recente. Essa regra não explica avaliações antigas permanecerem com `0h` quando os horários fornecidos estão incorretos. O relato se refere à validação com dados reais; os testes automatizados usam datas controladas e não reproduzem o problema do backend. Após a correção, validar novamente os horários com dados reais no Feed e nas demais telas de avaliações.

O convite **Avaliar Álbum**, o CTA da sidebar/drawer e os links de avaliação do estado vazio agora abrem a busca em `album-review.html`, sem depender de Ecos. O convite preserva `adapter.actions.review`; o link global da sidebar/drawer usa `adapter.routes.review` ou o destino padrão, sem handler local. Convite e CTA preservam `?demo=true` em demonstração. Detalhes do contrato e validação em [Avaliar Álbum](album-review-page.md).

- Testes de navegador rodam em modo headless com viewport mobile emulado (`390px`), que não substitui dispositivos físicos.
- O backend local não estava em execução na porta `8080` durante a verificação; os testes HTTP em navegador validaram o contrato real por interceptação de rede, sem alterar banco ou servidor.
- CI remota não foi executada nem verificada nesta entrega.
- **Curtidas, comentários, respostas**, **Pesquisas**, **Notificações** e as **páginas institucionais do rodapé** permanecem fora desta versão do Sonarfy (implementações futuras).
