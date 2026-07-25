# Auditoria: Deduplicação por Famílias V5

## Objetivo
Certificar que duplicatas exatas e variantes da mesma família estão sendo tratadas corretamente.

## Estado
- Implementado o `FamilyKeyEngine`.
- Implementado o agrupamento e a marcação `selected` e `deferred` no `FamilyVariantSelector`.
- Evita-se duplicação visual de variantes idênticas, respeitando diferença de tamanho, cor ou material apenas quando relevante (baseado no NLP).

## Conclusão
O volume de redundância no painel foi drasticamente mitigado, consolidando variantes da mesma oferta e melhorando a qualidade visual.
