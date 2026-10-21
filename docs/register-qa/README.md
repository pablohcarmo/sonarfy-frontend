# Verificação do cadastro

Implementação baseada na página **Register Page** do arquivo [Sonarfy](https://www.figma.com/design/kgOOkp9lzghCJtlBpSQtIj/Sonarfy?node-id=66-3), inspecionada pelo Figma MCP em 20/10/2026.

| Tema | Desktop 1440px | Mobile 390px | Desktop / Cidade ativa | Mobile / Cidade ativa |
| --- | --- | --- | --- | --- |
| Claro | 73:1200 | 73:1286 | 78:74 | 78:257 |
| Escuro | 73:1342 | 73:1428 | 78:407 | 78:590 |

Os oito frames foram obtidos com `get_design_context`, incluindo seus screenshots. Header / Global e Footer / Global foram inspecionados nas instâncias desses frames. Os SVGs utilizados estão em `assets/icons/register/`, sem dependência dos URLs temporários do Figma. A marca e a onda sonora são texto e retângulos no próprio design, reproduzidos com HTML/CSS.

Tokens: Inter 400/500/600/700; títulos 32px desktop e 28px mobile, entrelinha 1.2; labels 14px/20px; campos 48px; gaps 8/16/24/32px; card 16px e controles 8px de raio. Claro: fundo/card/campos `#ffffff`, texto `#1a1a1a`, secundário `#65676b`, borda estrutural `#ebecef`, borda dos campos `#8c8d90`, superfície auxiliar `#f7f8fa`. Escuro: fundo/campos `#1a1a1a`, card/showcase `#242424`, superfície auxiliar `#2a2a2a`, texto `#ffffff`, secundário `#b2b3b5`, borda estrutural `#65676b`. Azul `#27a9f5`. Dropdown: sombra `0 4px 8px rgba(0,0,0,.08)` / `.4`; foco escuro: `0 0 12px 3px rgba(39,169,245,.2)`.

Os frames mostram requisitos neutros; a consulta de variáveis retornou `{}` e não forneceu cores de validação. Foram reutilizados os tokens acessíveis do login: erro `#b42318` / `#fda29b` e sucesso `#216e39` / `#86efac`. O label de usuário segue o Figma atualizado, “Usuário”. A senha recebe o destaque de foco quando o usuário entra no campo; não é forçado foco no carregamento. O checkbox de termos presente no Figma foi mantido.

Atualização posterior: os oito frames foram novamente consultados via MCP. O link “Início” já existente no frontend foi conferido nos headers Desktop e Mobile, nos dois temas. Os SVGs de benefícios, olhos, calendário, globo, seta de “Início”, sol e seta escura de “Voltar ao início” foram substituídos pelas exportações com os recortes corrigidos. Os SVGs usam suas dimensões intrínsecas exportadas, incluindo os traços antes recortados; os slots originais do layout foram preservados. O checklist agora utiliza círculos CSS: vazados e neutros enquanto pendentes, preenchidos de verde quando atendidos. A mudança de preenchimento diferencia os estados além da cor; cada requisito possui uma descrição acessível de seu estado. Os indicadores voltam a ficar vazados se a senha deixar de cumprir o requisito. Não há dependência de ícones de fonte nem de assets recortados.

## Navegadores e resultados

Microsoft Edge **155.0.4283.45** e Firefox **153.0** (build de automação do Playwright), em modo headless. Em cada navegador: 1440px e 390px, claro e escuro, estados padrão e Cidade ativa. As 16 capturas estão nesta pasta; métricas e assets renderizados estão em `results.json`.

Verificados: ausência de overflow horizontal e erros de JavaScript; carregamento de Inter e ícones; requisitos de senha; confirmação divergente; mostrar senha; seleção de Cidade com setas/Enter; alternância de tema. O card desktop mede 608px de largura, com conteúdo de 544px; o formulário mobile mede 342px. A altura resulta do conteúdo, sem fixação do formulário.

Suíte: `npm test` — 63 testes, incluindo quatro novos testes de interação, respostas atrasadas e indisponibilidade do provedor de cidades.

Limitações: mobile verificado por viewport, sem dispositivo físico. A API de cidades foi simulada com os quatro resultados do Figma para testes determinísticos; disponibilidade da GeoNames e chamadas reais ao backend de cadastro não foram verificadas. Os testes existentes cobrem esses fluxos com mocks. O seletor de data usa o calendário nativo de cada navegador.

## Reproduzir

Execute um servidor estático na raiz do projeto, por exemplo `python -m http.server 4173 --bind 127.0.0.1`, e rode `node tests/browser/cadastro.cjs` com Playwright disponível. `PLAYWRIGHT_MODULE` aceita o caminho de uma instalação externa, e `BASE_URL` permite outro endereço local. O teste usa Microsoft Edge instalado e o Firefox de teste do Playwright (`playwright install firefox`). Não há dependência de Playwright no código entregue ao navegador.

## Integração de cidades

O cadastro usa GeoNames quando `GEONAMES_USERNAME` está configurado. Um provedor global pode ser injetado como `window.sonarfyCitySearch = async (query, { signal }) => [...]`, retornando objetos `{ name, adminName1, countryName }`. O componente aplica debounce de 350ms, cancelamento e descarte de respostas antigas. Sem provedor/configuração, há uma lista local limitada aos exemplos do Figma; ela não representa uma base mundial. `js/env.js` permanece como configuração local existente e não foi alterado.
