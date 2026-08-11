# Trend Executive — Loop de Experimentos

**Data:** 2026-08-11  
**Branch:** `docs/ai-executive-trends-2026-08-10`  
**Status:** Task 5.2 implementada; validação local pendente

## Fluxo

`Radar Top 3 -> Recommendation -> oferta vinculada -> publicação aprovada -> métricas -> experimento -> SCALE | ADJUST | ABORT -> feedback para o próximo Radar`

## Regras

- somente experimento com `status=completed` e `final_decision` canônica produz feedback acionável;
- `SCALE` gera `nextRadarAction=boost`;
- `ADJUST` gera `nextRadarAction=adjust`;
- `ABORT` gera `nextRadarAction=suppress`;
- experimento ainda aprovado/em andamento não produz ação;
- decisão desconhecida falha fechada para `none`;
- cliques podem permanecer observacionais;
- vendas, conversão e comissão só entram no feedback quando a atribuição estiver explicitamente verificada;
- o feedback não altera automaticamente o Commercial Opportunity Score V2;
- mudança de pesos baseada em experimentos pertence à governança da Task 5.3.

## Estado real observado

Em leitura somente leitura no Supabase em 2026-08-11 existe um experimento recente com:

- marketplace: Shopee;
- canal: Instagram;
- formato: vídeo;
- status: `approved`;
- `final_decision`: `null`;
- início: 2026-08-10;
- fim previsto: 2026-08-17;
- métricas atuais sem evidência suficiente para decisão final.

Portanto esse experimento **não deve ser encerrado antecipadamente nem gerar SCALE/ADJUST/ABORT agora**.

## Contrato

`trend-executive.experiment-feedback/v1`

O feedback carrega:

- oportunidade;
- marketplace/canal/formato;
- decisão e motivo;
- ação proposta para o próximo Radar;
- provenance de `experimentId`, `recommendationId` e `offerId`;
- métricas observáveis;
- indicador explícito de confiança da atribuição de vendas.

## Segurança operacional

- nenhuma migration;
- nenhuma escrita Supabase;
- nenhuma publicação;
- nenhum deploy produtivo;
- nenhuma alteração de `TREND_EXECUTIVE_MODE`;
- nenhum merge.
