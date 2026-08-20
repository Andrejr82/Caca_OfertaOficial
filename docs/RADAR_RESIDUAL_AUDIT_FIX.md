# Radar — Correções Residuais de Auditoria

Correções finais após validação do Radar em produção:

- `trend_radar_products.selection_decision` passa a ser persistido com a decisão efetiva usada pelo motor (`TESTAR`/`PRIORIDADE`).
- Na Shopee, `commissionRate` é tratado como comissão total quando informado pela OpenAPI e não é somado novamente a `sellerCommissionRate`.
- Quando o total não existe, os componentes oficiais `shopeeCommissionRate + sellerCommissionRate` podem compor a comissão efetiva.
- Comissão calculada acima de 100% é rejeitada como desconhecida, sem fabricar retorno econômico.
- Os componentes factuais continuam preservados para auditoria, sem dupla contagem no score.
- `Aprovar teste` não bloqueia mais uma nova oportunidade apenas porque a identidade oficial possui histórico `rejected`.
- Como `offers` mantém unicidade por identidade oficial, a mesma oferta é reaberta de forma auditada por `rejected -> pending_manual_review -> selected`; a rejeição anterior permanece registrada no histórico de transições.
- Não existe atalho direto `rejected -> selected`.

Sem alteração de thresholds, quotas, discovery, publicação automática ou regras do Mercado Livre.
