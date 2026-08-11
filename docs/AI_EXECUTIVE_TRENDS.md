# IA Executiva de Tendências — Arquitetura proposta

> Status: proposta arquitetural para implementação incremental.
>
> Base analisada: `main` em `b289f9437d87672cf305fd439c1a341cd0641e34`, Supabase de produção consultado em 2026-08-10 e página `/trends` atual.
>
> Este documento não declara nenhuma capacidade nova como implantada. Código executável, migrations, testes e runtime continuam sendo a autoridade.

## 1. Objetivo

Transformar a página **Tendências IA** em um centro executivo comercial baseado em evidência, capaz de responder diariamente:

1. quais nichos possuem o sinal comercial mais forte na semana;
2. quais produtos possuem evidência real por marketplace;
3. quais sinais de Google Trends e Achadinhos convergem com intenção de compra;
4. quais são os três principais focos comerciais de hoje;
5. qual é o ranking operacional Top 20 do Caça Ofertas;
6. qual oferta deve ser procurada pelo Discovery;
7. quais produtos, canais e formatos geram mais clique, venda, comissão e, quando houver evidência válida, crescimento de audiência.

A mudança central é inverter a origem da decisão:

```text
Hoje
cenário fixo -> palavras-chave -> Discovery -> produtos -> filtros

Proposto
mercado -> evidências -> Radar Executivo -> intenção/produto -> Discovery -> filtros -> experimento -> resultado -> próximo Radar
```

## 2. Estado atual confirmado

A fundação já existe e deve ser reutilizada.

### 2.1 Trends

A página `/trends` já possui:

- Google Trends;
- Mercado Livre Trends;
- classificação comercial por IA;
- matching de sinal com oferta;
- Radar Diário;
- estados de evidência `verified`, `partial`, `unverified` e `rejected`;
- Recommendation IA;
- recomendação de canal e formato;
- experimentos com janela temporal e métricas.

Entidades persistidas já existentes:

- `trend_signals`;
- `trend_signal_classifications`;
- `trend_opportunities`;
- `trend_recommendations`;
- `trend_experiments`.

### 2.2 Funil observado no Supabase em 2026-08-10

No momento da análise:

- `trend_signals`: 71;
- `trend_signal_classifications`: 10;
- `trend_opportunities`: 2;
- `trend_recommendations`: 2;
- `trend_experiments`: 1.

Distribuição dos sinais observada:

- Mercado Livre Trends: 50;
- Google Trends: 19;
- Radar externo: 2;
- Shopee: 0;
- performance interna: 0;
- Achadinhos/social: 0.

O problema, portanto, não é ausência de estrutura; é a falta de fechamento do ciclo entre **evidência externa, descoberta, publicação e resultado comercial real**.

### 2.3 Dados internos disponíveis

Na análise foram observadas grandes bases operacionais já existentes, incluindo `offers`, `affiliate_links`, `posts`, `click_events`, `discovery_items` e `offer_classifications`.

Porém, o Trends ainda não estava recebendo sinais internos derivados desses dados. A IA não deve afirmar que conhece “o que mais vende” ou “o que mais gera inscritos” enquanto a atribuição correspondente não estiver comprovada.

## 3. Princípio obrigatório: evidência antes da inferência

A IA Executiva não deve inventar nem completar fatos comerciais ausentes.

Fluxo obrigatório:

```text
DIRECT_EVIDENCE
      ↓
normalização determinística
      ↓
INFERRED_SIGNAL
      ↓
IA Executiva
      ↓
RECOMMENDATION
```

Exemplos de `DIRECT_EVIDENCE` válidos:

- posição em ranking explicitamente observada;
- marcador de mais vendido;
- preço atual;
- preço anterior;
- desconto calculável por preços oficiais;
- rating explícito;
- quantidade vendida quando exposta pela fonte;
- frete quando exposto pela fonte;
- URL da origem;
- horário da observação;
- identidade nativa do produto.

Se um valor não estiver disponível, deve ser `null` ou ausente. Nunca deve ser estimado pela IA como fato.

## 4. Arquitetura alvo

```text
┌──────────────────────────────┐
│ FONTES EXTERNAS              │
│ Shopee / Mercado Livre       │
│ Google Trends / Achadinhos   │
└──────────────┬───────────────┘
               ▼
┌──────────────────────────────┐
│ EVIDENCE COLLECTOR           │
│ fatos + URL + provenance     │
└──────────────┬───────────────┘
               ▼
        trend_signals
               ▼
┌──────────────────────────────┐
│ NORMALIZAÇÃO / CLASSIFICAÇÃO │
└──────────────┬───────────────┘
               ▼
┌──────────────────────────────┐
│ IA EXECUTIVA DE TENDÊNCIAS   │
│ semanal + diário             │
└──────────────┬───────────────┘
        ┌──────┴────────┐
        ▼               ▼
 Nichos 7 dias       Radar Top 20
                         ▼
                  Top 3 de hoje
                         ▼
              Trend-driven Discovery
                         ▼
             Shopee / Mercado Livre
                         ▼
             qualidade já existente
                         ▼
                oferta monetizada
                         ▼
                  experimento
                         ▼
          clique / venda / comissão
                         ▼
                 próximo Radar
```

## 5. Componentes que devem permanecer

A IA Executiva não substitui controles existentes. Devem permanecer como barreiras independentes:

- identidade nativa por marketplace;
- validação de preço;
- freshness/cooldown;
- deduplicação histórica;
- equivalência de produto;
- monetização obrigatória;
- Offer Quality;
- Curadoria Comercial;
- Official AI;
- aprovação manual;
- `posts.content` como copy oficial;
- transportes Telegram, Instagram, Facebook e WhatsApp;
- separação entre Discovery e publicação.

A mudança acontece **antes** dessas proteções: a fonte da intenção deixa de ser exclusivamente um cenário fixo e passa a poder vir de evidência comercial recente.

## 6. Estrutura executiva da página `/trends`

A página deve evoluir de painel técnico para centro executivo. Auditoria técnica continua disponível, mas em segundo plano.

### 6.1 Nichos com sinal mais forte nesta semana

Janela padrão: últimos 7 dias.

Para cada nicho:

- score 0–100;
- direção/aceleração;
- fontes convergentes;
- produtos principais;
- performance interna quando existir;
- confiança;
- links para evidências.

Exemplo:

```text
CASA E ORGANIZAÇÃO — 92/100
↑ aceleração forte

Evidências
✓ Shopee Mais Vendidos
✓ Achadinhos
✓ Google Trends
✓ 34 cliques internos

Produtos
• Organizador de cozinha
• Robô aspirador
• Air Fryer

Confiança: ALTA
```

### 6.2 Análise por marketplace

#### Shopee

Mostrar:

- Top categorias;
- produtos mais fortes;
- posição/ranking explícito;
- preço;
- sinais de mais vendido/em alta/campanha;
- número de fontes;
- confiança.

#### Mercado Livre

Mostrar:

- Top categorias;
- Best Sellers quando comprovados;
- preço;
- desconto comprovado;
- rating;
- frete quando comprovado;
- confiança.

Cada evidência deve ser auditável por origem.

### 6.3 Google Trends + Achadinhos

Google Trends representa **intenção e aceleração**, não venda comprovada.

Achadinhos/social representa descoberta visual/social e deve respeitar os mesmos princípios:

- sem views inventadas;
- sem data inventada;
- sem associação automática a venda;
- sinal isolado nunca recebe alta confiança por si só.

O valor cresce quando há convergência com marketplace.

### 6.4 Recomendação de foco para hoje

Deve ser o maior bloco da tela.

Mostrar apenas os três produtos mais prioritários:

- produto;
- evidências determinantes;
- score;
- confiança;
- marketplace;
- potencial afiliado;
- canal recomendado;
- formato recomendado;
- hipótese comercial.

A ação principal deve ser:

**Buscar melhor oferta**

Não deve existir publicação automática nesse botão.

Fluxo:

```text
Radar
  ↓
produto/intenção
  ↓
Oracle/Discovery
  ↓
marketplaces permitidos
  ↓
identidade
  ↓
preço/qualidade/frescor
  ↓
monetização
  ↓
melhor oferta elegível
  ↓
Curadoria / Official AI / aprovação
```

### 6.5 Ranking operacional Top 20

Campos mínimos:

- prioridade;
- produto;
- categoria;
- marketplace;
- fonte principal;
- evidência;
- score;
- confiança;
- potencial afiliado;
- potencial visual;
- canal recomendado;
- status de match;
- oportunidade associada.

O ranking precisa ser reproduzível e auditável.

## 7. Commercial Opportunity Score V2

O score atual do Radar deve evoluir para incorporar resultado interno sem transformar ausência de dados em estimativa.

Proposta inicial:

| Dimensão | Peso |
|---|---:|
| Qualidade da evidência | 30 |
| Convergência entre fontes | 20 |
| Demanda explícita no marketplace | 20 |
| Resultado interno | 15 |
| Atratividade comercial | 10 |
| Recência | 5 |
| **Total** | **100** |

Regra crítica:

> `resultado_interno = 0` quando não houver dado confiável.

Nunca substituir dado ausente por uma previsão da IA.

## 8. Persistência proposta

Reutilizar as tabelas Trends existentes e adicionar somente o necessário para snapshots auditáveis.

### 8.1 `trend_radar_runs`

Objetivo: representar cada execução do Radar.

Campos propostos:

- `id`;
- `radar_date`;
- `window_start`;
- `window_end`;
- `strategy_version`;
- `status`;
- `generated_at`;
- `source_health jsonb`;
- `executive_summary jsonb`.

### 8.2 `trend_radar_products`

Objetivo: congelar o Top 20 e permitir auditoria histórica.

Campos propostos:

- `radar_run_id`;
- `priority`;
- `product_term`;
- `normalized_product_term`;
- `category`;
- `marketplace`;
- `evidence_status`;
- `source_count`;
- `commercial_score`;
- `confidence`;
- `direct_evidence jsonb`;
- `inferred_signals jsonb`;
- `affiliate_potential`;
- `visual_content_potential`;
- `recommended_channel`;
- `recommended_format`;
- `opportunity_id`.

### 8.3 Motivo para snapshots

Hoje o Radar é reconstruído a partir dos sinais atuais. Para decisões comerciais é necessário responder futuramente:

> “Qual era o Top 20 exibido no início do dia?”

O snapshot preserva a decisão e as evidências daquele momento.

## 9. Contrato rígido de `trend_signals.evidence`

`trend_signals.evidence` já é flexível em `jsonb`; a proposta é padronizar o conteúdo e validá-lo antes da persistência.

Exemplo:

```json
{
  "evidence_type": "best_seller",
  "source_url": "https://...",
  "observed_at": "2026-08-10T12:00:00Z",
  "rank_position": 2,
  "best_seller_flag": true,
  "trending_flag": null,
  "sold_quantity": null,
  "price": 99.9,
  "old_price": null,
  "discount_percent": null,
  "rating": null,
  "review_count": null,
  "shipping": null,
  "marketplace_identity": {
    "shop_id": "...",
    "item_id": "..."
  }
}
```

Regras:

- URL inválida → evidência rejeitada;
- timestamp inválido → evidência rejeitada;
- preço não comprovado → `null`;
- rank não comprovado → `null`;
- quantidade vendida não comprovada → `null`;
- desconto só é fato quando calculável ou explicitamente confirmado;
- identidade de marketplace deve permanecer separada de título textual.

## 10. Fontes prioritárias

### 10.1 Shopee

Prioridade máxima porque a análise não encontrou sinais Shopee em `trend_signals`.

Coletores alvo:

- `shopee_best_sellers`;
- `shopee_trending`;
- `shopee_campaign`;
- `shopee_achadinhos`.

Ordem de preferência:

1. API oficial quando disponibilizar a evidência;
2. página pública normalmente acessível;
3. ausência de dado quando houver bloqueio.

Não contornar antibot.

### 10.2 Mercado Livre

Separar quatro papéis:

```text
ML Trends       -> intenção
ML Best Sellers -> demanda comprovável
ML ofertas      -> atratividade
ML produto      -> identidade/preço/rating/frete
```

Convergência entre esses sinais aumenta prioridade.

### 10.3 Google Trends

Manter como fonte de intenção e direção.

Google Trends isolado não deve provar venda.

Exemplo de convergência válida:

```text
Google Trends: "fone bluetooth"
        +
ML Trends: "fone de ouvido"
        +
Shopee: produto correspondente em ranking de vendas
        ↓
forte oportunidade comercial
```

### 10.4 Achadinhos/social

Adaptadores possíveis:

- Instagram Achadinhos;
- Shopee Achadinhos;
- YouTube público;
- TikTok público.

Somente quando a informação estiver legalmente e tecnicamente acessível sem contornar proteção da plataforma.

## 11. Performance interna do Caça Ofertas

### 11.1 Cliques

`click_events` deve ser agregado para criar sinais internos por:

- produto normalizado;
- categoria;
- marketplace;
- canal;
- número de publicações;
- cliques totais;
- cliques por publicação.

Fluxo:

```text
click_event
   ↓
affiliate_link
   ↓
offer
   ↓
produto normalizado / categoria / canal
   ↓
trend_signal interno
```

Exemplo de fonte:

```text
source_type = internal
source_name = caca_ofertas_clicks
```

### 11.2 Vendas e comissão

Antes de usar vendas como aprendizado, a cadeia de atribuição precisa ser validada:

```text
click
 ↓
sub_id
 ↓
marketplace attribution
 ↓
sale
 ↓
commission
```

Métricas deriváveis quando confiáveis:

- click-to-sale;
- comissão por clique;
- comissão por publicação;
- vendas por produto/categoria/canal.

### 11.3 Inscritos/audiência

Não atribuir crescimento de inscritos a um produto enquanto não existir uma fonte confiável de audiência e um desenho de atribuição adequado.

Quando APIs fornecerem métricas válidas, considerar snapshots por canal:

- followers/members;
- reach;
- impressions;
- engagement.

Crescimento temporal não deve ser apresentado automaticamente como causalidade de uma publicação.

## 12. Experimentos e aprendizado

O modelo atual de `trend_recommendations` + `trend_experiments` deve ser preservado e ampliado.

Fluxo alvo:

```text
Radar Top 3
    ↓
Recommendation
    ↓
Buscar melhor oferta
    ↓
aprovação humana
    ↓
publicação
    ↓
janela do experimento
    ↓
cliques / vendas / comissão / CTR quando possível
    ↓
SCALE | ADJUST | ABORT
    ↓
novo sinal interno para o próximo Radar
```

A IA aprende a partir de resultados medidos, não da própria recomendação anterior.

## 13. Integração com Oracle / Discovery

A ativação deve ser gradual.

Flag proposta:

```text
TREND_EXECUTIVE_MODE=off|shadow|active
```

### `off`

Comportamento atual preservado.

### `shadow`

- cenários atuais continuam como autoridade;
- Radar Executivo produz intenções em paralelo;
- comparar qualidade dos produtos e resultados;
- nenhuma mudança de publicação.

### `active`

Somente após evidência de shadow.

```text
Radar saudável?
  ├─ sim -> contrato dinâmico do Radar
  └─ não -> cenários atuais como fallback
```

### 13.1 Contrato dinâmico

Exemplo conceitual:

```text
trendRadarContract = {
  radarRunId,
  marketplace,
  normalizedProductTerm,
  category,
  searchTerms,
  allowedProductTerms,
  blockedProductTerms,
  evidenceRefs
}
```

A IA pode orientar busca, mas nunca fabricar identidade do marketplace, preço ou monetização.

## 14. Arquivos esperados no escopo

Arquivos existentes que provavelmente serão alterados:

- `src/core/trends/daily-radar.ts`;
- `src/core/trends/**`;
- `src/core/ai/trend-commercial-classifier.ts`;
- `src/lib/trends/queries.ts`;
- `src/app/(dashboard)/trends/page.tsx`;
- `src/components/trends/**`;
- `scripts/oracle-scraper.cjs`;
- `scripts/oracle-worker-discovery-only.cjs`;
- `scripts/marketplace-scenario-contracts.cjs`;
- `scripts/update-oracle.js`.

Novos módulos devem ser mínimos e orientados a fontes concretas, por exemplo:

```text
src/lib/trends/sources/shopee/*
src/lib/trends/sources/mercado-livre/*
src/lib/trends/sources/google/*
src/lib/trends/sources/social/*
src/lib/trends/sources/internal/*
```

Evitar abstrações especulativas ou dependências novas sem necessidade comprovada.

## 15. Comportamento do botão de Radar

O botão atual “Atualizar Radar do Dia” apenas atualiza a renderização da página.

Na arquitetura alvo, separar:

- `Executar Radar de Hoje`: coleta → valida → classifica → agrega → rankeia → persiste snapshot;
- `Atualizar tela`: apenas recarrega dados persistidos, se ainda necessário.

A execução real precisa de autenticação, idempotência, observabilidade e proteção contra concorrência.

## 16. Testes obrigatórios

### 16.1 Evidência

Testar que o sistema:

- não inventa ranking;
- não inventa preço;
- não inventa desconto;
- não inventa vendas;
- não inventa rating;
- rejeita URL inválida;
- rejeita timestamp inválido;
- mantém valores ausentes como `null`;
- não converte inferência em fato.

### 16.2 Ranking

Fixtures determinísticas devem provar, por exemplo:

```text
2 fontes confiáveis + best seller
>
1 sinal social isolado
```

E, quando performance interna estiver ativa:

```text
best seller + alta performance interna
>
best seller equivalente sem performance interna
```

### 16.3 Oracle

O Radar nunca pode contornar:

- identity gate;
- freshness;
- deduplicação;
- monetização;
- quality gate;
- aprovação;
- guardas contra publicação automática.

## 17. Observabilidade

Cada execução deve registrar, sem segredos:

- `radar_run_id`;
- estratégia;
- fontes consultadas;
- fontes saudáveis/falhas;
- sinais recebidos;
- sinais rejeitados por motivo;
- Top 20 gerado;
- Top 3 selecionado;
- matches realizados;
- produtos descartados;
- duração por estágio;
- correlação com experimentos.

## 18. Critérios para considerar a IA Executiva funcional

A primeira versão só deve ser considerada funcional quando:

1. os sinais têm provenance e evidência auditável;
2. o Radar Top 20 é reproduzível;
3. o Top 3 explica por que cada produto foi escolhido;
4. o botão “Buscar melhor oferta” mantém todos os gates existentes;
5. pelo menos um marketplace fornece evidência comercial forte além de Trends textual;
6. snapshots permitem consultar decisões passadas;
7. nenhuma ausência de dado é apresentada como fato;
8. o modo shadow compara a nova estratégia com a atual antes de qualquer ativação produtiva.

## 19. Resultado esperado

A página deixa de responder apenas “quais sinais existem?” e passa a responder:

> **Estas são as oportunidades comerciais mais fortes de hoje, estas são as evidências, estes são os marketplaces onde há demanda, estes são os canais/formatos recomendados e o Discovery pode agora procurar a melhor oferta válida para cada oportunidade.**

A autoridade continua sendo a evidência e os controles do sistema; a IA atua como camada executiva de interpretação, priorização e aprendizado.