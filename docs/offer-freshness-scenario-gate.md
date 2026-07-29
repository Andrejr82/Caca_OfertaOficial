# Freshness Gate e roteamento de cenário

O Oracle agora bloqueia ofertas já apresentadas recentemente por marketplace antes da fila de qualidade e da Official AI.

- Mercado Livre/Amazon: cooldown de 14 dias.
- Shopee: cooldown de 7 dias.
- Reentrada somente com queda de preço de pelo menos 10% ou melhora de desconto de pelo menos 10 pontos percentuais.
- A identidade nativa é prioritária; o título normalizado é proteção secundária.
- O bloqueio é local ao ciclo e não remove dados já persistidos.

A decisão aparece no resumo do ciclo como `freshnessRejected` e `freshnessReasons.cooldown_repeticao_historica`.
