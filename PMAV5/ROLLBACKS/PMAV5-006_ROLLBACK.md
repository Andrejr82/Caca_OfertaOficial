# PMAV5-006 — Plano de Rollback

## Objetivo

Reverter integralmente a conexão do runtime oficial ao State Service sem reescrever histórico e sem alterar banco ou produção.

## Procedimento

1. interromper novas ações de Curadoria/Publicação no runtime afetado;
2. criar um revert do commit `refactor(pmav5): migrate state transitions to official state service`;
3. executar Vitest, ESLint e typecheck direcionado;
4. confirmar restauração dos callers anteriores por diff, sem executar publicação, IA ou Discovery real;
5. registrar CP-006 como `ROLLED_BACK` por novo commit documental, preservando evidências.

## Dados e infraestrutura

Não há migration, schema, coluna, tabela, trigger, RPC, variável de ambiente, feature flag ou infraestrutura nova. `integration_logs` e `app_settings` já existiam; eventos e chaves PMAV5 são históricos e não devem ser apagados automaticamente. Nenhum rollback executa deploy, altera produção ou desfaz recibos externos.

## Riscos

O revert reabre writes diretos legados; por isso só pode ser usado como contenção temporária e deve ser seguido de nova correção auditada. Publicações externas já confirmadas nunca são desfeitas por alteração de status.
