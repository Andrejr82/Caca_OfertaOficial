# Hotfix Radar — selection_decision constraint

## Sintoma
A página Tendências IA exibiu `Radar falhou (PERSISTENCE_ERROR)` em execuções recentes.

## Causa raiz
O runtime Oracle persiste a decisão comercial do motor em `trend_radar_products.selection_decision` usando `TESTAR` ou `PRIORIDADE`.

A constraint do banco ainda aceitava apenas:

- `NULL`
- `IGNORAR`
- `APROVAR_TESTE`

Com isso, o `insert` dos produtos falhava com `trend_radar_products_selection_decision_check`.

## Evidência de produção
Runs recentes falharam com:

`Falha ao inserir produtos: new row for relation "trend_radar_products" violates check constraint "trend_radar_products_selection_decision_check"`

O histórico atual contém valores antigos `APROVAR_TESTE`, por isso a correção preserva compatibilidade.

## Correção
A migration passa a aceitar:

- `NULL`
- `IGNORAR`
- `APROVAR_TESTE`
- `TESTAR`
- `PRIORIDADE`

Nenhum dado histórico é reescrito.

## Escopo
- somente constraint de `trend_radar_products.selection_decision`;
- sem alteração de ranking, thresholds, quotas, discovery ou comissão;
- sem alteração de Oracle;
- sem alteração de Reels/Stories;
- sem auto-publicação.

## Validação
1. aplicar migration no Supabase;
2. conferir `pg_get_constraintdef`;
3. confirmar valores históricos existentes continuam válidos;
4. executar regressão estática da migration;
5. somente após isso validar um novo refresh do Radar.

## Oracle
Não há alteração de código/runtime Oracle nesta task; portanto não é necessário script Gemini para atualização do Oracle.
