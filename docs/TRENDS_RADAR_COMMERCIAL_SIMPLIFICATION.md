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

### Task 3 — Shopee exploração máxima [CONCLUÍDA]
- **Categorias ampliadas**: Cobertura expandida de 11 para 16 categorias oficiais da Shopee (adicionando Brinquedos e Hobbies `100632`, Bebês e Crianças `100635`, Saúde e Bem-Estar `100638`, Automotivo `100639` e Livros e Papelaria `100640`).
- **Paginação real por categoria**: Suporte a múltiplas páginas por categoria (`maxPagesPerCategory = 2` por padrão, até 50 itens por página), com parada determinística quando `nodes` vier vazio ou `pageInfo.hasNextPage === false`.
- **Estratégia de catálogo sem restrição artificial**: `isAMSOffer` não é mais forçado como `true` por padrão, permitindo explorar o catálogo amplo de produtos com link e comissão de afiliado.
- **Descoberta ampla sem gates restritivos**: Produtos com preço válido e identidade `shopId + itemId` continuam sendo coletados mesmo sem vendas observadas ou sem comissão extraordinária (vendas/comissão atuam como bônus de ranking posterior).
- **Deduplicação nativa**: Deduplicação em memória por `${shopId}:${itemId}` entre páginas e entre categorias.
- **Resiliência**: Falha ou timeout em uma categoria isolada não aborta a coleta das demais.
- **Campos ricos preservados**: Preço, descontos, avaliações, comissões, tipo de loja e links são integralmente preservados para o motor de ranking V4.

### Task 4 — Competitividade real [CONCLUÍDA]
- **Módulo Dedicado**: `src/core/trends/commercial-price-competitiveness.cjs` integrado a `src/core/trends/commercial-opportunity-score-v4.cjs` e `scripts/oracle-trends-radar-engine.cjs`.
- **Extração Determinística de Unidades e Quantidades**:
  - Volume: Litros (`L`, `litros`, `lt`) e Mililitros (`ml`) normalizados para `L`. Suporte a multiplicadores (ex: `2x 5L`, `3x 500ml`).
  - Massa: Quilos (`kg`, `quilos`) e Gramas (`g`, `gr`) normalizados para `kg`. Suporte a multiplicadores (ex: `2x 1kg`, `4x 500g`).
  - Unidades / Kits: Kits (`kit 2`, `kit com 3`, `pack 10`) e Unidades explícitas (`10 unidades`, `2 peças`, `5 pares`) normalizados para `unit`.
  - Consumíveis equivalentes: L e kg são comparáveis na mesma família (ex: sabão concentrado em pó vs sabão líquido).
- **Normalização de Preço**: Cálculo de `normalized_price` em `R$/L`, `R$/kg` ou `R$/unidade`.
- **Comparação Relativa de Concorrentes (Peers no mesmo Run)**:
  - Candidatos da mesma família comercial têm seus preços normalizados comparados.
  - `best_in_family` (menor preço / melhor custo-benefício): 10 pontos em `offerCompetitiveness`.
  - `competitive` (até 15% acima do mínimo): 7-8 pontos.
  - `average` (até 35% acima do mínimo): 4-5 pontos.
  - `unfavorable` (claramente mais caro / desfavorável): 1 ponto (mesmo com alto desconto próprio anunciado).
- **Sem Regressão Solo**: Candidatos isolados sem concorrentes diretos no mesmo run continuam sendo avaliados por desconto promocional intrínseco (desconto >= 50% = 10 pts, >= 35% = 8 pts, etc.).
- **Auditoria no directEvidence**: Registro determinístico de `family_key`, `normalized_unit`, `normalized_price`, `peer_count`, `relative_price_position` e `competitiveness_reason`.

### Task 5 — Top 20 comercial
Não usar `IGNORAR` para preencher vagas. Mostrar até 20 oportunidades realmente aprovadas pelo ranking.

### Task 6 — Telemetria final
Registrar por marketplace: coletados, válidos, bloqueados, elegíveis e selecionados.

## Critério final
O Radar deve retornar Shopee + Mercado Livre com diversidade real, preço competitivo e oportunidade comercial clara, sem depender de dados que cada marketplace não fornece.
