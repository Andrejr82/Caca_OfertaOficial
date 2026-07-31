# Shopee Discovery Intelligence V5

Status: RELEASED

Data: 2026-07-12

Referência de release: `main` em produção; SHA confirmado por `git rev-parse HEAD` após atualização Oracle.

## Arquitetura vigente

Categorias nativas oficiais

`shopeeOfferV2`

`productOfferV2(productCatId, sortType=2, page=1, limit=50)`

Sanitização, Novelty Gate, deduplicação global, score determinístico, Top 20 por categoria, `pending_manual_review`, escolha manual, IA somente após `selected` e publicação após aprovação.

## Métricas homologadas

- Categorias nativas: 30.
- Categorias com produtos: 29.
- Categoria vazia: `100531` (`New BAU Comm - Food Delivery`).
- Chamadas: 31.
- Produtos brutos: 1.450.
- Sanitizados: 1.450.
- Deduplicados: 1.450.
- Finalistas máximos: 580.
- IA na escolha: NÃO.
- Keywords: ZERO.
- Publicação automática: NÃO.

## Transição

`SHOPEE_DISCOVERY_V5=true` é flag transitória. Legado Shopee permanece isolado durante homologação, sem mistura com V5. Remoção definitiva ocorrerá em Sprint posterior.
