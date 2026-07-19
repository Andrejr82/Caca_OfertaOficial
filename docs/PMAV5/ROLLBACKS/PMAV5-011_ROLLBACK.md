# PMAV5-011 — Plano de Rollback

## Unidade e objetivo

Reverter exclusivamente o commit `feat(pmav5): add end-to-end observability and recovery` por novo commit na branch PMAV5. Não usar reset, rebase, force push, stash ou cópia manual.

## Procedimento seguro

1. Confirmar branch, SHA alvo e working tree limpa.
2. Pausar apenas exportação de telemetria, se ativada futuramente; não parar autoridades.
3. Preservar audit trail e Recovery Items já persistidos.
4. Criar `git revert <sha-pmav5-011>` em janela autorizada, sem executar runtimes.
5. Reexecutar State, Oracle, Curadoria, AI, Publication, arquitetura e regressão.
6. Executar ESLint, typecheck direcionado, parser CJS e `git diff --check`.
7. Registrar rollback por novo commit documental autorizado.

## Proibições e resultado

Não alterar estados, apagar auditoria, executar replay/IA/publicação/Discovery, acessar banco/produção, aplicar migration/DDL/DML, reiniciar PM2 ou alterar Oracle/Vercel. Serviços voltam à composição anterior; efeitos externos e receipts nunca são desfeitos/apagados por rollback.

