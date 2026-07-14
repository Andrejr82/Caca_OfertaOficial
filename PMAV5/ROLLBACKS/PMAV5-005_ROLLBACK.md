# PMAV5-005 — Rollback

## Objetivo

Reverter exclusivamente a transformação do Oracle Worker em Discovery-Only caso a homologação humana rejeite a Sprint, sem reescrever histórico e sem executar deploy.

## Procedimento

1. Confirmar branch `codex/pmav5-architecture-unification` e working tree limpa.
2. Identificar o commit `refactor(pmav5): make oracle worker discovery only`.
3. Criar um novo commit de reversão com `git revert <SHA_PMAV5_005>`; nunca usar reset, force push ou rebase.
4. Executar Vitest, ESLint/typecheck direcionados e regressões locais do Worker.
5. Atualizar CP-005 para `ROLLED_BACK` por novo registro documental autorizado.
6. Fazer push somente para a branch PMAV5; não fazer merge, deploy, restart PM2 ou alteração na Oracle VPS.

## Efeito esperado

- restaura o entrypoint anterior do Worker e remove o núcleo/testes/documentos introduzidos nesta Sprint;
- não altera banco, schema, migrations, dados, `.env`, secrets, State Service, Next.js ou produção;
- não exige rollback de dados porque nenhum Discovery real nem execução produtiva ocorreu nesta Sprint.

## Validação pós-rollback

- `git diff --check` sem erros;
- testes anteriores ao SHA inicial `5fdb734f52ebd7bcf56f33c282a9d1ca40ccc2fb` reproduzidos;
- nenhuma execução de IA, publicação, Discovery real ou deploy;
- evidência do novo commit de reversão anexada ao checkpoint.
