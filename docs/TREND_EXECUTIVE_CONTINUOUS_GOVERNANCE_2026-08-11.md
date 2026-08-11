# Trend Executive — Governança contínua

**Data:** 2026-08-11  
**Branch:** `docs/ai-executive-trends-2026-08-10`  
**Estado produtivo:** `TREND_EXECUTIVE_MODE=off`  
**Merge:** não autorizado / não executado

## Objetivo

Fechar a Task 5.3 com regras explícitas e auditáveis para versionamento, saúde de fontes, drift e revisão de pesos, sem permitir que o sistema altere seu próprio comportamento comercial sem revisão.

## Versionamento

- Score atual: `commercial-opportunity-score-v2`.
- Contrato de evidência direta: `trend-direct-evidence-v1`.
- Snapshots do Radar preservam `radarRunId`, `strategyVersion` e `generatedAt` como referências históricas.
- Mudança de algoritmo, pesos ou semântica exige nova versão explícita.

## Saúde e confiança das fontes

Uma fonte só é elegível quando:

1. `status = healthy`;
2. `trusted = true`;
3. não apresenta drift material.

Fonte `degraded`, `failed`, `unknown`, não confiável ou com drift material é bloqueada do conjunto elegível. O bloqueio não é sinônimo de exclusão de histórico: snapshots e evidências antigas permanecem auditáveis.

## Drift

O contrato de governança compara um valor observado com seu baseline explícito.

Regra inicial conservadora:

- razão entre 0,5 e 1,5: estável;
- abaixo de 0,5 ou acima de 1,5: `drifted`;
- sem baseline válido: `unmeasured`.

Uma fonte `drifted` é bloqueada para contribuição nova até revisão. A recuperação nunca é automática.

## Revisão de pesos

Feedback experimental não altera pesos automaticamente.

Regra inicial:

- menos de 3 experimentos acionáveis concluídos: `insufficient_evidence`;
- 3 ou mais decisões acionáveis (`SCALE`, `ADJUST`, `ABORT`): `review_recommended`;
- `autoApply` permanece sempre `false`.

O objetivo é abrir revisão humana baseada em evidência, não otimizar pesos por opinião nem por uma única campanha.

## Relação com o loop experimental

A Task 5.2 produz feedback auditável para o próximo Radar:

- `SCALE -> boost`;
- `ADJUST -> adjust`;
- `ABORT -> suppress`;
- experimento sem decisão final -> `none`.

A governança usa apenas feedback finalizado para recomendar revisão. Ela não altera o Score V2 diretamente.

## Segurança operacional

- nenhuma migration nova;
- nenhuma escrita no Supabase;
- nenhuma mudança automática de feature flag;
- nenhuma ativação de `active`;
- nenhuma publicação automática;
- nenhum deploy ou restart executado por esta task;
- recuperação de fonte degradada exige revisão explícita;
- mudança de pesos exige nova versão e validação.

## Conclusão

A governança contínua mantém o histórico imutável, bloqueia novas contribuições de fontes degradadas/não confiáveis, detecta drift e transforma resultados experimentais em recomendação de revisão — nunca em alteração automática.
