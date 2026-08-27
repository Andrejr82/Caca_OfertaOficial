# Tendências IA — Task 7: Runtime Autoritativo dos 7 Nichos

Status: implementação preparada e validada localmente; rollout pendente.

## Evidência que motivou a Task 7

O primeiro snapshot real após o rollout anterior (`b3b9996b-12cf-48f8-9784-5c8444527565`) completou o pipeline, porém revelou que a descoberta upstream ainda era comandada pelo motor comercial legado:

- `strategy_version = commercial-opportunity-v4`
- `generated_by = oracle_radar_commercial_opportunity_v4_engine`
- `target_products = 20`
- marketplaces selecionados: Shopee + Mercado Livre
- Amazon ausente
- `verified = 0`, `partial = 20`

Também foram observados falsos enquadramentos, incluindo tripé/câmera em Moda, transformador em Eletrodomésticos e cartão de memória em Informática.

## Correção

O arquivo `oracle-trends-radar-runner-seven-niches.cjs` deixa de delegar para `oracle-trends-radar-runner-final.cjs`/runner comercial legado e passa a ser o orquestrador autoritativo.

Fluxo alvo:

`Solicitar Radar -> oracle-trends-radar -> 7 nichos -> Shopee + Mercado Livre + Amazon -> canonical guardrails -> Trend Evidence Gate -> Trend Score -> Commercial Score -> snapshot -> UI`

### Descoberta

- Shopee: somente categorias associadas aos 7 nichos e posterior classificação canônica pelo produto.
- Mercado Livre: intenções derivadas de `commercial-niche-config.cjs`, sem lista genérica paralela; depois Trends por categoria/global e Highlights.
- Amazon: Best Sellers coletado como fonte separada, não misturada no pipeline do Mercado Livre.

### Evidência de tendência

Uma tendência `verified` exige pelo menos um sinal forte:

- aceleração temporal de vendas suficientemente material;
- sinal nativo de tendência do Mercado Livre por categoria com match de produto;
- subida relevante em ranking autoritativo;
- ou confirmação forte independente em múltiplos marketplaces.

Best Seller parado continua sendo observação, não tendência automática.

### Persistência

- `verified`: tendência exibível.
- `partial`: observação histórica.
- máximo de 20 linhas continua apenas como cap físico do snapshot.
- não existe meta de preencher 20 tendências.
- a UI continua mostrando apenas `trending_flag=true`.

### Commercial Score

Continua sendo calculado como segunda camada e não bloqueia nem cria tendência.

## Regressões reais adicionadas

Devem ser rejeitados como falsos enquadramentos:

- `190cm Tripé Câmera Profissional ... Bolsa de Transporte`
- `Transformador 7000va ... Ar Condicionado Geladeira Freezer`
- `Kit 2 Cartão De Memória 128gb Câmera Notebook Wifi Ultra Hd`

## Gate local

- novos testes Task 7: 14 PASS / 0 FAIL
- node syntax checks: PASS
- Supabase schema: compatível, sem migration
- publishCalls = 0
- postsWrites = 0
- offersWrites = 0

## Rollout

Após promoção para `main`, atualizar somente `oracle-trends-radar` via Gemini/IDE. Não tocar no `oracle-scraper`, cron editorial ou ciclos.
