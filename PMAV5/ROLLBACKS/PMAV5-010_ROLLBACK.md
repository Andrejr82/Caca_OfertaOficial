# PMAV5-010 — Plano de Rollback

## Objetivo e unidade

Reverter exclusivamente o commit refactor(pmav5): remove disconnected legacy runtimes na branch codex/pmav5-architecture-unification. O baseline é 0099c01c74ea883c011caf267a7729230b367c7c.

## Procedimento seguro

1. Confirmar branch, SHA e working tree limpa.
2. Criar um novo commit de reversão do commit PMAV5-010; não usar reset, stash, rebase ou backup manual.
3. Não executar nenhum arquivo restaurado.
4. Manter autoridades paralelas operacionalmente desativadas; rollback de código não autoriza dupla autoridade.
5. Reexecutar testes arquiteturais, Oracle/marketplaces, State, Curadoria, IA, publicação, transportes, regressão, ESLint, typecheck, parser CJS e git diff --check.
6. Registrar o checkpoint como ROLLED_BACK somente após evidência.
7. Exigir nova validação humana antes de eventual deploy.

## Proibições

O rollback não executa deploy, banco, migration, DDL, DML, IA, Discovery, publicação, PM2, Oracle VPS ou Vercel; não reverte dados e não copia código histórico manualmente para o runtime.

## Risco

A reversão restaura runtimes capazes de IA, Discovery, escrita direta e publicação. Eles devem permanecer sem entrypoint e bloqueados até nova Sprint autorizada. Git é a única fonte histórica.

## Validação

Confirmar que serviços oficiais e três marketplaces permanecem íntegros, que nenhuma produção foi alterada e que a árvore está limpa após o commit de reversão.
