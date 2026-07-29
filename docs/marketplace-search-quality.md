# Qualidade de busca por marketplace

A política é opt-in por `OFFER_SEARCH_QUALITY_V2=active`. Com a flag ausente ou diferente de `active`, os candidatos seguem o fluxo atual e apenas um evento de métricas é emitido.

## Regras comuns

- cooldown de 7 dias quando a política está ativa;
- reentrada quando o preço atual cai pelo menos 10% em relação ao histórico;
- preço atual obrigatório e preço anterior somente quando consistente;
- não inferir Pix, parcelas ou cupons;
- equivalência somente com identidade nativa confiável;
- no máximo três candidatos por intenção em cada marketplace.

## Identidade por marketplace

- Mercado Livre: `catalog_id`, depois `item_id`;
- Shopee: `shop_id + item_id`;
- Amazon: ASIN.

## Limite por canal

A deduplicação de descoberta é global por produto. O cooldown separado por Telegram, WhatsApp e Facebook exige consultar o ledger de publicações na etapa de publicação; não deve ser simulado com título. Essa integração permanece separada para não alterar o transporte de mensagens nesta PR.

## Métricas

O worker emite `discovery.search_quality.evaluated` com recebidos, aceitos, rejeitados por preço, equivalência, diversidade e cooldown. Nenhuma gravação é feita pelo avaliador.
