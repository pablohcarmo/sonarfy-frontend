# Confirmação de e-mail — verificação

A seção **Email Confirmation**, dentro da Register Page do [Sonarfy no Figma](https://www.figma.com/design/kgOOkp9lzghCJtlBpSQtIj/Sonarfy?node-id=96-463), foi inspecionada pelo Figma MCP com `get_metadata` e quatro chamadas de `get_design_context`, incluindo seus screenshots.

| Tema | Desktop 1440px | Mobile 390px |
| --- | --- | --- |
| Claro | 96:316 | 96:348 |
| Escuro | 96:384 | 96:416 |

## Implementação

Essa seção representa a confirmação **pendente após cadastrar**, “Quase lá!”, não o resultado da ativação pelo link. O estado existente em `pages/cadastro.html` foi refatorado e retirado do card do formulário: agora ocupa o main inteiro, com Header / Global e Footer / Global. `pages/verify.html`, que consome o token do link, não foi alterado.

Não há OTP no Figma. O card contém badge de envelope, título/subtítulo, endereço editável, instruções, CTA “Reenviar e-mail”, link de login e retorno ao formulário. O badge e as duas setas mobile foram baixados para `assets/icons/confirmation/`. Ícones do header reutilizam os mesmos SVGs já presentes no cadastro. Nenhum URL temporário do Figma é usado em runtime.

Tokens globais são reutilizados de `css/login.css`, e os específicos estão em `css/confirmation.css`:

| Propriedade | Claro | Escuro |
| --- | --- | --- |
| Fundo | #ffffff | #1a1a1a |
| Card | #ffffff | #242424 |
| Badge/endereço | #f7f8fa | #2a2a2a |
| Texto principal | #1a1a1a | #ffffff |
| Texto secundário | #65676b | #b2b3b5 |
| Borda do card | #ebecef | #65676b |
| Links de ação | #1a1a1a | #27a9f5 |
| CTA | #27a9f5, texto/borda #1a1a1a | #27a9f5, texto/borda #1a1a1a |

Inter 400/500/600/700. Título: 32px desktop, 28px mobile, entrelinha 1.2. Subtítulo/instruções: 15px/24px. Endereço: 15px/24px desktop, 14px/24px mobile, peso 600. Ações: 14px, peso 600; Editar: 13px. Gaps 8/16/24px. Card com raio 16px, padding 32px desktop e 16px mobile; superfícies/CTA com raio 8px. Badge 64px. CTA e ações com altura mínima 48px. Sem sombra externa no card. O limite desktop de 560px e os paddings de página preservam o Auto Layout sem fixar a altura do conteúdo.

Os estados de hover/active/focus-visible do CTA reutilizam os controles globais. A altura mínima da área principal é 744px no desktop e 752px no mobile, conforme Figma, podendo crescer com feedback e endereços longos.

O reenvio e a correção mantêm o cooldown existente de 30 segundos. O countdown usa um prazo real, e não apenas a quantidade de ticks, para tolerar pausas da aba. O status é anunciado no início/fim; o formulário e os botões indicam requisições em andamento e impedem envios duplicados. O fluxo transfere foco ao título da confirmação e ao primeiro campo ao retornar. A edição conserva o token temporário somente em memória e usa PATCH com Bearer; mensagens dinâmicas são inseridas como texto. O log de payload que expunha a senha no console foi removido.

O formulário duplicado de reenvio foi removido desse fluxo: a ação agora usa diretamente o e-mail da confirmação. A cobertura de testes correspondente foi substituída por cenários de reenvio direto, falha de rede, erro HTTP, envio duplicado e retorno ao formulário. As fixtures foram isoladas para não acumular listeners DOMContentLoaded entre testes.

## Verificação

Suíte `npm test`: **63 testes passaram** em oito arquivos.

Microsoft Edge **155.0.4283.45** e Firefox **153.0**, via Playwright em modo headless. Cada navegador foi verificado em 1440 × 956 e 390 × 960, nos temas claro e escuro. As capturas mostram o card com o botão liberado após o cooldown e o diálogo de correção. Métricas, versões e geometria dos SVGs estão em `results.json`.

Verificados: cadastro até a confirmação; endereço dinâmico; foco; bloqueio e liberação do cooldown; PATCH autenticado; atualização do endereço; erro de reenvio e nova tentativa; feedback de sucesso; endereço longo sem overflow; navegação de volta; alternância de tema; ícones carregados; ausência de erros de JavaScript. A geometria do card é aproximadamente 560 × 550px no desktop e 342 × 602px no mobile, com diferenças subpixel de arredondamento das fontes.

Limitações: mobile por viewport, sem dispositivo físico. Endpoints do backend foram simulados; não foram enviados e-mails reais, nem verificada a entrega/ativação. A página de processamento do token `verify.html` permanece fora deste escopo. O diálogo de correção foi preservado e verificado funcionalmente; não há um frame de modal nessa seção do Figma para comparação visual.

## Reproduzir

Sirva a raiz do projeto (`python -m http.server 4173 --bind 127.0.0.1`) e execute `node tests/browser/confirmation.cjs` com Playwright disponível. `PLAYWRIGHT_MODULE` aceita uma instalação externa do módulo; `BASE_URL` permite outro endereço local. O teste usa Edge instalado e Firefox do Playwright. Não há dependência de Playwright no frontend em produção.

Para testar manualmente, abra `pages/cadastro.html` e conclua um cadastro em seu ambiente de desenvolvimento. A confirmação usa o e-mail retornado pela API; após 30 segundos, reenvio e edição são liberados.

Também é possível abrir `preview/confirmation.html` sem cadastro. A prévia importa o markup atual do card, header, footer e diálogo a partir do HTML do cadastro; não carrega os scripts de cadastro nem de API. Edição e reenvio são simulados e identificados como tal, sem envio de e-mails. O aviso pode ser ocultado para conferir o layout. A prévia foi testada em Edge e Firefox, 1440px/390px, claro/escuro, incluindo a ausência de chamadas à API (`node tests/browser/confirmation-preview.cjs`).
