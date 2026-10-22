# Home — implementação e verificação

Referência: https://www.figma.com/design/kgOOkp9lzghCJtlBpSQtIj/Sonarfy?node-id=66-2

## Inspeção pelo Figma MCP

Foram recuperados o contexto de design e as capturas dos quatro frames:

| Frame | Nó | Referência |
| --- | --- | --- |
| Home – Tema Claro / Desktop | 70:559 | 1440 × 1778 |
| Home – Tema Claro / Mobile | 70:602 | 390 × 2414 |
| Home – Tema Escuro / Desktop | 70:645 | 1440 × 1778 |
| Home – Tema Escuro / Mobile | 70:688 | 390 × 2414 |

Os frames atualizados contêm Header / Global (187:548), hero, a seção
“Sobre o Sonarfy / Como Funciona” e Footer / Global (175:216).
O cabeçalho contém marca, controle de tema e “Entrar” nos dois tamanhos,
com destino à página local pages/login.html. Não há menu expansível.

O MCP não retornou variáveis vinculadas para a seção (70:771). Os tokens CSS
foram extraídos dos valores efetivos dos frames: branco/#1a1a1a para fundo;
#1a1a1a/branco para texto; #65676b/#b2b3b5 para texto secundário;
#ebecef/#65676b para a linha do header; #8c8d90 para a borda secundária;
#27a9f5 para destaque. Inter 400/500/600/700 e 600 itálico; título
56px desktop/36px mobile, entrelinha 1.12; descrição 18px/16px,
entrelinha 1.6; botões 14px/600; rodapé 12px/20px.

Espaçamento principal: 8/16/24/32/48px; botões com raio 8px e mínimo
48px de altura. Sem sombras decorativas no design. As bordas internas
preservam as dimensões de conteúdo do Auto Layout. Os mínimos verticais
de hero e footer seguem os frames, mas podem crescer com o conteúdo.

Os SVGs oficiais agora estão em assets/icons/index/ e assets/icons/shared/, incluindo
três ícones de recursos (24 × 24px) e o chevron claro/escuro (16 × 16px).
Os antigos SVGs de retorno sem uso foram removidos na limpeza anterior.
A marca completa usa os SVGs em `assets/logos/`; as barras sonoras são elementos de layout no Figma,
reproduzidos como tais. Não foram usadas capturas como assets de página.

## Comportamento

A Home reutiliza js/login-theme.js, incluindo a preferência sonarfy_theme,
restauração antes da pintura e tratamento de armazenamento indisponível.
Não carrega global.js nem footer.css para evitar injeção duplicada e
estilos globais conflitantes. Outras páginas não foram alteradas.

“Comece Agora” e “Começar Agora” abrem o cadastro existente. “Saiba Mais”
usa href="#saiba-mais" e scroll-behavior: smooth, com suporte nativo
ao histórico, acesso direto pelo fragmento e funcionamento sem JavaScript.
A preferência prefers-reduced-motion desativa o movimento suave.
O diálogo anterior e js/index.js foram removidos.

## Nova seção explicativa

Contextos e screenshots dos quatro frames foram recuperados novamente via
Figma MCP. Nós das seções: 224:253, 224:293, 224:333, 224:373.

- Introdução com chamada “CONHEÇA A PLATAFORMA” em 12px/16px/600,
  H2 em 36px/40px/700 desktop e 28px/32px/700 mobile, descrição em
  16px/24px/400. Largura máxima 800px, gap interno 16px.
- Seção com padding 96px vertical e 64px horizontal no desktop;
  64px vertical e 24px horizontal no mobile. Gap 48px/32px.
- Grid com largura máxima 1200px, três colunas iguais no desktop,
  uma coluna abaixo de 1024px, gap 24px.
- Cards com padding 24px, gap 24px, raio 8px e borda 1px
  #8c8d90 no claro/#65676b no escuro. Mínimo 280px desktop/256px
  mobile, crescimento natural pelo conteúdo. Títulos H3 18px/24px/600,
  descrição 16px/24px/400 e gap de 8px.
- Ícones oficiais em contêineres de 48px com borda e raio 8px.
- Convite final com padding 32px, gap 24px, borda 1px, raio 8px,
  título 24px/32px/700 e CTA de 48px, largura total no mobile.
- Tokens anteriores preservados; adicionados --feature-border,
  --space-8 (64px) e --space-12 (96px).
- Rodapé preservado e último elemento do body, no fluxo normal.

Os destinos institucionais anteriores foram preservados. As páginas
termos.html, privacidade.html, regulamentos.html e apoio.html não existem
neste repositório e continuam pendentes; o Figma não define destinos.

## Validação nesta sessão

- npm test: 7 arquivos e 59 testes passaram.
- git diff --check: sem erros.
- Os cinco SVGs locais têm conteúdo não vazio.
- Firefox: tentativa de inspeção interrompida pelo Computer Use:
  “browser URL policy enforcement is not yet supported for the current
  Windows browser”.
- Microsoft Edge: não validado; o Computer Use encerrou o acesso nessa
  sessão e o conector alternativo não listou navegadores disponíveis.
- Na nova tentativa de inspeção o Computer Use retornou novamente o
  bloqueio de política de URLs do navegador Windows. Não houve interação
  posterior com navegadores nesta atualização.
- Nenhuma comparação visual de renderização local foi concluída.
  Permanecem pendentes desktop 1440px e mobile 390px nos temas claro e
  escuro, nos dois navegadores, incluindo overflow, geometria dos SVGs,
  carregamento da fonte, teclado, foco e navegação pela âncora.
- A fonte Inter segue o padrão do login existente, via Google Fonts;
  a fidelidade tipográfica depende do carregamento dessa fonte.

A alteração local preexistente em .gitignore foi preservada.
