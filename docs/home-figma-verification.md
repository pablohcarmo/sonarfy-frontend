# Home — implementação e verificação

Referência: https://www.figma.com/design/kgOOkp9lzghCJtlBpSQtIj/Sonarfy?node-id=66-2

## Inspeção pelo Figma MCP

Foram recuperados o contexto de design e as capturas dos quatro frames:

| Frame | Nó | Referência |
| --- | --- | --- |
| Home – Tema Claro / Desktop | 70:559 | 1440 × 904 |
| Home – Tema Claro / Mobile | 70:602 | 390 × 896 |
| Home – Tema Escuro / Desktop | 70:645 | 1440 × 904 |
| Home – Tema Escuro / Mobile | 70:688 | 390 × 896 |

Os frames contêm Header / Global (187:548), hero e Footer / Global
(175:216). Não contêm cards, showcases, H3 ou menu expansível. O cabeçalho
desktop contém marca e controle de tema; o mobile também contém “Início”.

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

Cinco SVGs oficiais foram baixados para assets/icons/home-*.svg.
A marca “S” e as barras sonoras são elementos de texto/layout no Figma,
reproduzidos como tais. Não foram usadas capturas como assets de página.

## Comportamento

A Home reutiliza js/login-theme.js, incluindo a preferência sonarfy_theme,
restauração antes da pintura e tratamento de armazenamento indisponível.
Não carrega global.js nem footer.css para evitar injeção duplicada e
estilos globais conflitantes. Outras páginas não foram alteradas.

“Comece Agora” abre o cadastro existente. “Saiba Mais” abre um diálogo
nativo acessível com explicação e acesso ao cadastro: o Figma não especifica
esse destino e a implementação anterior apontava para #about inexistente.
Esse diálogo é uma decisão funcional adicional, sem referência visual no Figma.

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
- Nenhuma comparação visual de renderização local foi concluída.
  Permanecem pendentes desktop 1440px e mobile 390px nos temas claro e
  escuro, nos dois navegadores, incluindo overflow, geometria dos SVGs,
  carregamento da fonte, teclado, foco e abertura/fechamento do diálogo.
- A fonte Inter segue o padrão do login existente, via Google Fonts;
  a fidelidade tipográfica depende do carregamento dessa fonte.

A alteração local preexistente em .gitignore foi preservada.
