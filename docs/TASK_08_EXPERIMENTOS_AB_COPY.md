# Task 8 — Experimentos A/B de Copy

Data: 2026-08-20
Programa: `docs/PLANO_CONVERSAO_SOCIAL_COPY_V4.md`
Status: IMPLEMENTADA EM MÓDULO ISOLADO, AINDA NÃO ATIVADA EM PRODUÇÃO.

## Objetivo

Comparar ângulos comerciais da Copy V4 sem misturar produto, canal ou evidência factual.

Ângulos elegíveis:
- `proof`
- `saving`
- `price`
- `benefit`
- `standard`

## Regra experimental

Cada experimento compara variantes da **mesma oferta e do mesmo canal**. Variar produto ou canal no mesmo teste é rejeitado para reduzir confusão causal.

Estados:
- `insufficient_data`: experimento inválido para leitura ou variante ainda não publicada;
- `learning`: há dados, mas ainda não existe exposição mínima ou vantagem observacional clara;
- `leader`: existe liderança observacional acima dos guardrails mínimos.

`leader` não significa significância estatística nem causalidade provada.

## Métricas e guardrails

Prioridade:
1. `conversion_rate` quando todas as variantes têm pelo menos 20 cliques;
2. `ctr` quando conversão ainda não é comparável, mas todas têm pelo menos 200 impressões;
3. caso contrário, permanecer `learning`.

Uma liderança só é indicada quando a melhor variante supera a segunda por pelo menos 10% de diferença relativa na métrica comparável. Empate ou vantagem pequena mantém o teste em `learning`.

## Integridade

- mínimo de duas variantes;
- `variantId` único;
- um ângulo por variante, sem duplicidade de ângulo;
- mesma oferta e mesmo canal;
- não usa comissão prevista;
- não inventa impressões, cliques, compras ou receita;
- não escolhe líder por contagem bruta de clique quando não há denominador comparável;
- não altera publicação, HERO score ou Radar automaticamente.

## Arquivos

- `src/lib/social/copy-experiments.ts`
- `src/tests/lib/social/copy-experiments.test.ts`
- `docs/TASK_08_EXPERIMENTOS_AB_COPY.md`

## Critérios de aceite implementados

1. amostra pequena permanece `learning`;
2. conversão é priorizada quando há cliques suficientes;
3. CTR é fallback quando há impressões suficientes, mas ainda não há base de conversão;
4. vantagem pequena não produz falso vencedor;
5. ofertas/canais diferentes não podem ser comparados no mesmo teste;
6. ângulos e ids duplicados falham fechado;
7. nenhuma decisão do experimento publica automaticamente.

## Integração futura

A persistência de assignment/variant e a ligação automática com eventos reais da Task 7 serão feitas no fechamento do programa, junto da ativação canônica da Copy V4. Até lá, o avaliador permanece puro e isolado.

## Oracle

Esta Task não altera scripts/runtime Oracle. Nenhuma execução Gemini é necessária.
