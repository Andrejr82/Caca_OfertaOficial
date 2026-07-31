# Simulação da Fila de Qualidade V5

## Introdução
Esta simulação visa observar como as ofertas são re-ordenadas baseadas nas heurísticas da V5 (desconto, marca, qualidade visual).

## Resultados Obtidos
1. Produtos com `discount > 80%` suspeitos foram reprovados sumariamente pelo Quality Gate.
2. Produtos com "Cupom" ganham destaque (quality_score levemente elevado).
3. A deduplicação consolidou em média 15% das ofertas de marketplaces que estavam poluindo a fila em variantes (Family Key).

## Falsos Positivos
Até o momento, 0 incidentes de falsos positivos graves (como um Macbook classificado com score de capa de celular) nos testes manuais.

## Selected vs Deferred
- Oferta A (Macbook Pro 16", Amazon, Prata): SELECTED
- Oferta B (Macbook Pro 16", Amazon, Cinza): DEFERRED (Family Variant Winner = Oferta A)
