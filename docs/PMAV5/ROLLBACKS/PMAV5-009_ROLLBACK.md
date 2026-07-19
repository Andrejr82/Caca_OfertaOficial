# PMAV5-009 — Plano de Rollback

## Objetivo

Reverter somente a subordinação M-07 sem executar deploy, publicação, IA, Discovery, migration ou alteração de produção.

## Unidade de rollback

- Commit: `refactor(pmav5): subordinate parallel components`.
- Branch: `codex/pmav5-architecture-unification`.
- Baseline: `8f282d61ca38b4ba120797d24811c18bdc58d471`.

## Procedimento seguro

1. Confirmar que não há alterações locais não relacionadas.
2. Criar um commit de reversão do commit PMAV5-009; não usar reset destrutivo.
3. Reexecutar `npm test`, ESLint direcionado, typecheck direcionado e `git diff --check`.
4. Confirmar que Oracle Worker, Discovery, marketplaces, Scheduler, PM2, banco, schema, migrations, secrets e `.env` continuam inalterados.
5. Manter os gateways legados desativados operacionalmente. O rollback de código não autoriza reativar IA, publicação, transportes ou state writers paralelos.
6. Promover qualquer reativação somente por uma nova Sprint e novo checkpoint.

## Riscos do rollback

O baseline contém Inngest, Extension, GitHub Actions, Publish Express, scripts administrativos e gateways LLM com autoridades paralelas. Por isso, reverter M-07 sem controles externos reintroduz capacidade de alteração direta de estados, criação de posts, IA e publicação. O rollback deve permanecer apenas uma operação de código controlada e nunca um cutover automático.

## Validação pós-rollback

- CP-009 volta a `PLANNED` ou recebe registro explícito de reversão.
- A auditoria PMAV5-009 permanece no histórico como evidência.
- Nenhum efeito externo é disparado durante a validação.
