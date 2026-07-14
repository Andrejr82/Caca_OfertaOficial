# PMAV5-007 — Plano de Rollback

## Objetivo

Reverter exclusivamente o commit `refactor(pmav5): centralize ai and draft posts in official service`, restaurando o SHA anterior `746abb2b7967315c55cf0070ae8a753ed8d02573` sem reescrever histórico, alterar banco ou ativar autoridade paralela.

## Procedimento

1. interromper novos comandos da rota `/api/ai/generate` no runtime afetado, sem executar deploy automaticamente;
2. criar um `git revert` do commit PMAV5-007 por novo commit na branch PMAV5;
3. confirmar por diff que somente arquivos PMAV5-007 foram revertidos;
4. executar Vitest serializado, ESLint e typecheck direcionado, sem IA, Discovery ou publicação real;
5. registrar CP-007 como `ROLLED_BACK` em novo commit documental, preservando auditoria e evidências;
6. manter gateways legados bloqueados até uma correção oficial; o rollback não autoriza reativar `ai-processor`, Oracle IA, Inngest IA, Extension IA ou outro gerador concorrente.

## Dados e infraestrutura

Não há migration, schema, coluna, tabela, RLS, trigger, RPC, variável de ambiente ou infraestrutura nova. Registros `pmav5.ai.idempotency.*`, `integration_logs`, affiliate links e posts draft já produzidos por eventual runtime externo não devem ser apagados. Eles são evidência/reconciliação; não se executa deleção física nem inferência compensatória.

## Estado seguro

O rollback não publica, não promove estados, não desfaz efeitos externos, não altera produção automaticamente e não reativa mais de uma autoridade. Ofertas ainda `selected` permanecem `selected`; ofertas já `approved` exigem procedimento auditado separado.

## Riscos

Restaurar a rota anterior reabriria geração/persistência fragmentada. Por isso o revert só é permitido com o endpoint de IA suspenso e deve ser seguido por correção auditada, nunca pela ativação do legado.
