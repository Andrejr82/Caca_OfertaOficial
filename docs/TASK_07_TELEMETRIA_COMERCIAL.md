# Task 7 — Telemetria Comercial

Data: 2026-08-20
Programa: `docs/PLANO_CONVERSAO_SOCIAL_COPY_V4.md`
Status: IMPLEMENTADA EM MÓDULO ISOLADO, AINDA NÃO ATIVADA EM PRODUÇÃO.

## Objetivo

Medir o funil comercial por `oferta x canal` para separar claramente gargalos de atenção, clique e compra.

Funil:
`publicação -> impressão (quando disponível) -> clique -> compra -> ganho afiliado`.

## Contrato

Métricas derivadas:
- `ctrPct`: cliques / impressões, somente quando impressões reais existem e são maiores que zero;
- `conversionRatePct`: compras / cliques, somente quando houve ao menos um clique;
- `epcBRL`: ganho afiliado real / cliques, somente quando ambos existem;
- `noConversionSignal`: verdadeiro apenas quando houve publicação + clique, mas nenhuma compra;
- `funnelStage`: `unpublished | no_click | no_purchase | converted`.

## Regras de honestidade analítica

- ausência de impressão não vira CTR 0; vira `null`;
- ausência de ganho afiliado não vira EPC 0; vira `null`;
- publicação sem clique é diferente de clique sem compra;
- compra maior que clique é inconsistente e falha fechado;
- conteúdo não publicado não pode registrar clique, compra ou ganho;
- valores negativos, infinitos ou contagens fracionárias são rejeitados;
- uma mesma oferta/canal não pode aparecer duplicada no mesmo lote;
- nenhuma métrica desta Task altera score, seleção ou publicação automaticamente.

## Arquivos

- `src/lib/social/commercial-telemetry.ts`
- `src/tests/lib/social/commercial-telemetry.test.ts`
- `docs/TASK_07_TELEMETRIA_COMERCIAL.md`

## Critérios de aceite implementados

1. calcula CTR, conversão e EPC quando os dados factuais necessários existem;
2. mantém `null` quando não há base factual suficiente;
3. distingue `no_click` de `no_purchase`;
4. sinaliza ausência de conversão apenas após clique real;
5. valida integridade dos dados antes de calcular métricas;
6. não depende de comissão prevista nem de estimativas;
7. não publica automaticamente;
8. não altera Radar, Copy V4 ou seleção HERO nesta etapa.

## Integração futura

A captura/persistência dos eventos reais e a conexão com o pipeline canônico ficam para o fechamento do programa, quando todas as Tasks estiverem prontas para o único merge/deploy de produção. Essa integração deverá reutilizar tracked URLs/sub_ids já existentes e fontes reais de compra/ganho afiliado, sem criar métricas sintéticas.

## Oracle

Esta Task não altera scripts/runtime Oracle. Nenhuma execução Gemini é necessária.
