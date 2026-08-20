# Task 10 — Aprendizado Comercial

Data: 2026-08-20
Programa: `docs/PLANO_CONVERSAO_SOCIAL_COPY_V4.md`
Status: IMPLEMENTADA EM MÓDULO ISOLADO, AINDA NÃO ATIVADA EM PRODUÇÃO.

## Objetivo

Transformar sinais reais de telemetria, experimento e cadência em recomendações comerciais auditáveis, sem autoaplicar mudanças.

## Decisões

- `LEARN_MORE`: dados ainda insuficientes ou sem liderança clara;
- `TEST_ANGLE`: existe liderança observacional de CTR, mas ainda falta validação por compra;
- `PREFER_ANGLE`: existe liderança por conversão com compra real observada;
- `INVESTIGATE_OFFER`: há clique suficiente, mas o conjunto não converte; investigar oferta/preço/marketplace/landing;
- `WAIT_CADENCE`: existe guardrail temporário de fadiga/cadência ativo.

## Regras

- CTR líder não vira preferência definitiva;
- `PREFER_ANGLE` exige liderança por `conversion_rate` e pelo menos uma compra real;
- recomendação nunca é aplicada automaticamente (`autoApply: false`);
- guardrail de cadência tem precedência sobre exploração comercial;
- nenhuma recomendação altera fatos, preço, Radar, HERO score ou publicação;
- ausência de dados maduros retorna `LEARN_MORE`;
- decisões mantêm motivos auditáveis.

## Arquivos

- `src/lib/social/commercial-learning.ts`
- `src/tests/lib/social/commercial-learning.test.ts`
- `docs/TASK_10_APRENDIZADO_COMERCIAL.md`

## Critérios de aceite implementados

1. amostra imatura não gera preferência;
2. liderança de CTR gera somente hipótese de teste;
3. liderança por conversão com compra real pode recomendar preferência;
4. cadência ativa bloqueia recomendação de ação imediata;
5. toda saída é auditável e não automática;
6. não altera Radar nem publicação.

## Integração final

A Task 10 encerra os módulos isolados do programa Copy V4. O próximo passo é integrar Tasks 1–10 ao fluxo canônico, validar regressões, lint/typecheck/build e só então preparar o único merge/deploy de produção.

## Oracle

Esta Task não altera scripts/runtime Oracle. Nenhuma execução Gemini é necessária.
