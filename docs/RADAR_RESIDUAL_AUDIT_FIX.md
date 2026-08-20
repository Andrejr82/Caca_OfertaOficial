# Radar — Correções Residuais de Auditoria

Correções finais após validação do Radar em produção:

- `trend_radar_products.selection_decision` passa a ser persistido com a decisão efetiva usada pelo motor (`TESTAR`/`PRIORIDADE`).
- Na Shopee, `commissionRate` é tratado como comissão total quando informado pela OpenAPI e não é somado novamente a `sellerCommissionRate`.
- Quando o total não existe, os componentes oficiais `shopeeCommissionRate + sellerCommissionRate` podem compor a comissão efetiva.
- Comissão calculada acima de 100% é rejeitada como desconhecida, sem fabricar retorno econômico.
- Os componentes factuais continuam preservados para auditoria, sem dupla contagem no score.

Sem alteração de thresholds, quotas, discovery, publicação automática ou regras do Mercado Livre.
