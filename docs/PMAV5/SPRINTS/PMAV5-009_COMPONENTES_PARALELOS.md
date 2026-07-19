# PMAV5-009 — Subordinação dos Componentes Paralelos

## Identificação

| Campo | Valor |
|---|---|
| Modo | `IMPLEMENTATION` |
| Implementação | M-07 — Subordinação dos Componentes Paralelos |
| Checkpoint | CP-009 |
| Status | `COMPLETED` |
| Data | 2026-07-14 |
| Branch | `codex/pmav5-architecture-unification` |
| Worktree | `C:\\Projetos_GitHub\\Caca_OfertaOficial\\.worktrees\\pmav5-architecture-unification` |
| SHA inicial | `8f282d61ca38b4ba120797d24811c18bdc58d471` |

## Especificação aprovada

O texto de execução PMAV5-009 é a especificação aprovada. A arquitetura final mantém quatro fronteiras: Oracle Worker para Discovery, State Service para transições, Official AI Service para inferência e criação de drafts e Official Publication Service para publicação. Inngest, Extension, GitHub Actions e scripts com comandos completos serão clientes; componentes sem contrato oficial seguro serão bloqueados fail-closed; adapters técnicos de transporte permanecerão acessíveis somente pela composição oficial.

## Restrições globais

- Não alterar Oracle Worker, Discovery, marketplaces, Scheduler, PM2, banco, schema, migrations, secrets ou `.env`.
- Não executar deploy, publicação real, IA real ou Discovery real.
- Não introduzir estado de negócio, seleção, aprovação, criação de posts, provider ou transporte em componentes paralelos.
- Preservar a árvore limpa do SHA inicial e produzir um único commit final com a mensagem exigida.

## Plano TDD

### Tarefa 1 — Inventário e prova RED

- [x] Inventariar callers, responsabilidades, estados, IA, publicação, transportes, banco e contratos.
- [x] Criar teste arquitetural cobrindo todos os componentes paralelos.
- [x] Confirmar RED pelas autoridades paralelas existentes.

### Tarefa 2 — Clientes oficiais

- [x] Migrar Inngest para `generateOfficialAI()` e `publishOfficialPost()`; bloquear jobs sem contrato oficial.
- [x] Migrar a rota da Extension para `generateOfficialAI()` sobre oferta já `selected`.
- [x] Migrar GitHub Actions e scripts de publicação para `publishOfficialPost()`.

### Tarefa 3 — Fail-closed legado e experimental

- [x] Bloquear Publish Express, Generic Publisher e automação órfã.
- [x] Bloquear scripts administrativos que alteram estado ou criam posts diretamente.
- [x] Bloquear gateways e experimentos de IA fora do Official AI Service.

### Tarefa 4 — Evidências e regressão

- [x] Confirmar GREEN da prova arquitetural e dos testes focados.
- [x] Executar regressão completa, ESLint e typecheck direcionado.
- [x] Criar auditoria e rollback; promover CP-009 somente com evidência fresca.
- [x] Revisar restrições, `git diff --check`, commit e push somente para a branch exigida.

## Resultado

TDD registrou três ciclos RED e GREEN. A regressão completa aprovou 333 testes em 40 arquivos. ESLint direcionado e typecheck dos 19 arquivos TypeScript alterados passaram sem diagnóstico; o typecheck global conserva somente dívida preexistente fora do diff. Oracle Worker, Discovery, marketplaces, Scheduler, PM2, banco, schema, migrations, secrets, `.env` e produção não foram alterados. Nenhuma execução real foi realizada.
