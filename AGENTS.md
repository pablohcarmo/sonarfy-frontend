<UI_VERIFICATION>
## Verificação de Interface

Para alterações de HTML, CSS ou JavaScript que afetem a interface:
- Testar sempre no **Firefox** e no **Microsoft Edge** antes de concluir o trabalho.
- Verificar **desktop** (`1440px`) e **mobile** (`390px`) e, quando disponíveis, os temas **claro** e **escuro**.
- Registrar quais navegadores (e versões) foram testados e qualquer limitação de verificação (ex.: viewport mobile emulado em navegador headless, dados/adapters simulados).
- Executar também a suíte de testes apropriada às alterações (`npm test` e os scripts de navegador aplicáveis em `tests/browser/`).
- Preservar alterações locais do usuário que não façam parte da tarefa.
</UI_VERIFICATION>

<WORKFLOW_AND_CONVENTIONS>
## Diretrizes de Desenvolvimento e Pull Requests

### 1. Escopo e Tamanho do Pull Request
- Cada PR deve tratar um objetivo coeso e manter-se em torno de **~300 linhas de código alteradas** (adições + remoções em HTML, CSS, JavaScript, testes e configurações executáveis).
- Documentação, diagramas, imagens, SVGs de assets e capturas de tela não entram no cômputo restrito dessas ~300 linhas.
- O tamanho do diff é um guia interno de planejamento e revisão; não inclua seção, contagem ou checklist de tamanho na mensagem do PR. Se ultrapassar significativamente o alvo, avalie internamente a justificativa técnica ou a divisão em PRs menores.
- Sempre que trocar de branch, execute imediatamente a suíte de testes (`npm test`).

### 2. Padrões de Código, Comentários e Documentação
- Manter a implementação em HTML5 semântico, CSS3 e JavaScript Vanilla (módulos ES quando aplicável), sem introduzir frameworks ou dependências de produção sem aprovação explícita.
- Em JavaScript, utilize comentários concisos explicativos usando exclusivamente `//` (nunca blocos `/* ... */`), posicionados acima de funções e testes relevantes, alinhados com o estilo do projeto.
- Alterações de telas, rotas, tokens visuais, adapters ou contratos de integração com o backend devem atualizar a documentação correspondente em `docs/` (incluindo `docs/README.md`, `docs/figma-references.md`, documentos de página), `tests/README.md` e `README.md` quando aplicável.
- Sempre documentar explicitamente quando uma funcionalidade usa modo demonstração/fixtures locais em vez de integração real com o backend.

### 3. Mensagens de Commit
- Todos os commits devem seguir rigorosamente o padrão **Conventional Commits 1.0.0**:
  `<type>[optional scope]: <description>`
- Tipos usuais: `feat`, `fix`, `docs`, `test`, `refactor`, `style`, `perf`, `build`, `ci`, `chore`.
- Escopos comuns: `feed`, `profile`, `auth`, `login`, `register`, `verify`, `spotify`, `home`, `account`, `ui`, `assets`, `tests`, `docs`.
</WORKFLOW_AND_CONVENTIONS>

<PULL_REQUEST_TEMPLATE>
Sempre que gerar a descrição/mensagem de um Pull Request, use a estrutura abaixo com estas regras:
- Não inclua seção ou contagem de tamanho do diff na mensagem; esse controle é somente interno.
- Inclua “Integração e contratos” somente quando houver alterações em adapters, rotas ou contratos com o backend. Caso contrário, omita a seção, sem escrever “Nenhuma” ou “N/A”.
- Inclua “Issue relacionada” somente quando existir uma issue relacionada. Caso contrário, omita a seção, sem escrever “N/A”.

```markdown
## Contexto e objetivo

<!-- Qual problema ou entrega esta mudança resolve? Qual é o resultado esperado? -->

## Principais alterações

<!-- Liste mudanças de interface, comportamento, assets, testes e documentação. -->

## Integração e contratos

<!-- Seção condicional: incluir somente se houver alterações em adapters, rotas ou contratos com o backend. Indique o que está integrado e o que permanece em modo demonstração/simulado. -->

## Testes e validação

- Suíte unitária (`npm test`):
- Verificação de navegador (Firefox e Microsoft Edge, desktop/mobile, claro/escuro):
- Limitações de verificação:
- CI no GitHub: <!-- pendente até executar / resultado e link -->

## Limitações e próximos passos

<!-- Registre limitações relevantes e itens que ficaram fora do escopo. -->

## Issue relacionada

<!-- Seção condicional: incluir somente se houver issue relacionada. Use “Closes #123”, “Fixes #123” ou “Refs #123”. -->
```
</PULL_REQUEST_TEMPLATE>

<ISSUE_TEMPLATE>
Sempre que criar ou formatar uma nova Issue para o repositório, siga rigorosamente a estrutura abaixo:

```markdown
<!-- Título com prefixo padronizado: [BUG], [BUG/SECURITY], [SECURITY], [FEATURE], [ENHANCEMENT], [REFACTOR] -->

## Contexto

<!-- Qual problema ou limitação esta issue trata? O que já foi observado no código, na interface, em um PR ou em produção? -->

## Escopo

<!-- O que entra nesta issue e o que fica expressamente de fora. -->

## Proposta

<!-- Comportamento esperado, referência visual (Figma) ou caminho técnico proposto. -->

## Critérios de aceite

- [ ] <!-- Item verificável em formato de checkbox markdown -->

## Referências

<!-- Issues, PRs, frames do Figma, arquivos, documentação ou contratos do backend. -->
```
</ISSUE_TEMPLATE>
