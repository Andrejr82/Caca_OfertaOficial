# Radar Comercial Simplificado — Plano de Reestruturação

## Meta
Maximizar oportunidades com potencial de conversão comercial. O Radar deve descobrir primeiro e filtrar apenas o necessário para evitar lixo técnico e duplicatas reais.

## Princípios
1. Ausência de vendas, comissão ou histórico interno nunca elimina um produto.
2. Mercado Livre entra no painel com os dados públicos que realmente existem.
3. Shopee deve explorar ao máximo a API disponível, usando vendas/comissão/rating como bônus de ranking, não como gate.
4. Produto antigo rejeitado ou pendente não cria blacklist permanente.
5. Ranking prioriza preço, promoção, atratividade comercial, comissão quando disponível, demanda quando disponível e novidade.
6. Melhor trazer menos produtos fortes do que completar 20 com itens que o próprio motor mandaria ignorar.
7. Nenhuma publicação automática.

## Fluxo alvo
Coleta ampla -> identidade/preço/link válidos -> deduplicação real -> ranking comercial -> painel.

## Tasks
### Task 1 — Existing Offer sem blacklist eterna
Somente ofertas com status `approved`, `selected` ou `posted` bloqueiam a mesma identidade.
`rejected`, `pending_manual_review`, `draft` e `deferred` não bloqueiam novas oportunidades.

### Task 2 — Mercado Livre sem dependência de vendas/comissão [CONCLUÍDA]
- **Regra**: Para Mercado Livre, qualquer candidato com preço positivo (`price > 0`), identidade nativa válida (`itemId` ou `productId`) e link válido (`permalink`/`product_url` com formato http/https) é considerado elegível para o Radar (`medium`, `isViable: true`).
- **Comportamento de dados ausentes**: Vendas, comissão, rating, velocity e BEST_SELLER continuam sendo usados quando existirem e permanecem estritamente `null` ou `0` quando ausentes (nunca fabricados/inventados). A ausência desses atributos NÃO gera `insufficient_data` nem elimina o produto do Mercado Livre.
- **Fail-closed preservado**: Preço inválido/não positivo, identidade nativa ausente ou link ausente/inválido continuam gerando `insufficient_data` (`isViable: false`). Avaliações baixas (`rating < 3.5`) ou micro-tickets inviáveis continuam classificados como `low` (`isViable: false`).
- **Shopee**: Mantém suas regras sem regressão.

### Task 3 — Shopee exploração máxima
Expandir paginação/cobertura da API e separar descoberta de ranking, sem usar vendas/comissão como requisitos.

### Task 4 — Competitividade real
Comparar candidatos equivalentes/famílias por preço e promoção; quando aplicável, normalizar preço por unidade/kg/litro.

### Task 5 — Top 20 comercial
Não usar `IGNORAR` para preencher vagas. Mostrar até 20 oportunidades realmente aprovadas pelo ranking.

### Task 6 — Telemetria final
Registrar por marketplace: coletados, válidos, bloqueados, elegíveis e selecionados.

## Critério final
O Radar deve retornar Shopee + Mercado Livre com diversidade real, preço competitivo e oportunidade comercial clara, sem depender de dados que cada marketplace não fornece.
