# Plano: Desire Score V5

## Objetivo
Implementar o `desire_score` para classificação de relevância da oferta de forma totalmente observacional na Sprint V5, sem impactar a fila de publicação real (ainda baseada na cronologia ou no `quality_score`).

## Métrica
O *desire_score* avalia:
1. Relevância da marca
2. Desconto real e impacto percentual
3. Preço base e acessibilidade
4. Categoria (A, B, C)
5. Tendências e buzz
6. Frete grátis/Prime

## Estado
- Código incorporado.
- `DESIRE_SCORE_ENABLED=false` garantido no `.env` ou nas variáveis de controle para evitar bloqueio acidental.
- Logs e painel exibem o score para calibração visual do curador.

## Futuro (V6)
Quando homologado, ativaremos o `DESIRE_SCORE_ENABLED=true`, transformando a fila em estritamente orientada a desejo (Prioridade 1: Maior Desire Score).
