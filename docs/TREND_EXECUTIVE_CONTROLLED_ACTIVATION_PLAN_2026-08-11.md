# Trend Executive — Plano de Ativação Controlada

**Data:** 2026-08-11  
**Branch:** `docs/ai-executive-trends-2026-08-10`  
**Estado atual:** **BLOCKED / NÃO ATIVAR**  
**Produção:** `TREND_EXECUTIVE_MODE=off`  
**Autoridade atual:** `legacy_scenario`  
**Merge:** não autorizado

## Objetivo

Preparar a infraestrutura de uma futura ativação controlada do Trend Executive sem habilitar `active`, sem deploy produtivo, sem restart e sem escrita no Supabase.

A Task 5.1 transforma os critérios da decisão shadow em um gate determinístico. O gate pode declarar apenas:

- `blocked`;
- `ready_for_operator_authorization`;
- `ready_for_manual_activation`.

Mesmo no último estado, o módulo mantém `productionMode: off` e exige mudança manual de runtime após autorização explícita do operador.

## Gate de readiness

Arquivo executável:

- `scripts/trend-executive-activation-readiness.cjs`.

Critérios mínimos obrigatórios:

1. pelo menos 7 dias de shadow **e** pelo menos 20 intenções Radar executadas;
2. URL válida >= 98%;
3. identidade nativa válida >= 98%;
4. preço válido >= 98%;
5. zero bypass de guards;
6. oferta incremental válida >= 30% das intenções Radar;
7. quality delta não pior que -5%;
8. rejeição por freshness não pior que +5 pontos percentuais;
9. zero publicação automática causada exclusivamente pelo Radar;
10. zero regressão de segurança;
11. revisão técnica aprovada;
12. validações relevantes concluídas;
13. coorte inicial válida.

Qualquer falha mantém o plano em `blocked`.

## Coorte inicial

Enquanto não houver evidência comparável para outros marketplaces, a primeira coorte permitida pelo gate é:

- marketplace: **Shopee**;
- máximo: **5 intenções Radar por execução controlada**.

Esse limite é um cap de segurança de rollout, não um critério de sucesso e não concede autorização automática.

Amazon e Mercado Livre permanecem fora da primeira coorte porque o Radar atual não possui amostra roteável suficiente nesses marketplaces.

## Estado real em 2026-08-11

O readiness atual é obrigatoriamente `blocked` porque:

- ainda não houve ciclo Oracle real consumindo intenções Radar em shadow;
- não há 7 dias de observação;
- não há 20 intenções Radar executadas;
- não existe comparação real de qualidade/freshness/monetização do braço Radar de ponta a ponta.

Portanto, a Task 5.1 **não autoriza** `TREND_EXECUTIVE_MODE=active`.

## Rollback preparado

O contrato `buildTrendExecutiveRollbackPlan()` define rollback fail-closed:

- `targetMode: off`;
- restaura autoridade `legacy_scenario`;
- exige execução manual;
- não faz deploy automaticamente;
- não faz restart automaticamente;
- não grava no Supabase.

Triggers recomendados para rollback imediato em eventual rollout futuro:

- regressão de identidade/URL/preço abaixo dos thresholds;
- bypass de monetização, quality gate, freshness ou segurança;
- qualquer publicação Radar fora da coorte/autorização;
- erro de integridade ou atribuição;
- degradação material de quality score;
- decisão manual do operador.

## Procedimento futuro de ativação

Somente após todos os critérios do gate passarem:

1. revisar relatório shadow atualizado;
2. executar revisão técnica;
3. executar validações finais no head exato da branch;
4. obter autorização explícita do operador;
5. preparar mudança manual e limitada de runtime;
6. confirmar coorte Shopee <= 5 intenções;
7. manter rollback para `off` pronto;
8. observar execução antes de ampliar qualquer coorte.

Nenhum desses passos é executado automaticamente por este plano.

## Estado de entrega

- feature flag continua fail-closed;
- overlay de deploy continua aceitando somente `TREND_EXECUTIVE_MODE=off`;
- `active` continua bloqueado no runtime atual;
- nenhum deploy/restart/migration/write foi executado;
- próxima task após validação: **5.2 — fechar loop de experimentos**.
