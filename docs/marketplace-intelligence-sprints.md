# Marketplace Intelligence Engine

======================================================================
## Objetivo da Épica

O objetivo não é criar Score V3.
O objetivo é eliminar toda a fragmentação existente.

Ao final desta épica deverá existir apenas:
- um Marketplace Extraction Engine;
- um Normalization Engine;
- um Quality Engine;
- um Deduplication Engine;
- um Ranking Engine;
- um Marketplace Intelligence Engine;
- um AI Decision Engine;
- um Publication Pipeline.

Toda inteligência deverá estar centralizada em um único motor.

======================================================================
## CAPÍTULO 1: Visão Geral

- **problema atual**: Arquitetura extremamente fragmentada e repetitiva, com regras comerciais desconexas e redundantes.
- **múltiplos scores**: Score V1 (o ativo mas falho), Score V2 (shadow/telemetria apenas), multiplicador da Shopee, e IA, todos competindo ou sobrepondo funções.
- **múltiplos pipelines**: `oracle-scraper` e `temp-runner` duplicam as mesmas funções matemáticas e rotinas sem sincronia.
- **regras espalhadas**: Qualidade no adapter do scraper, limites de banco no `ai-processor`, deduplicação falha no insert do banco, deduplicação teórica forte abandonada no `product-validator.ts`.
- **scripts duplicados**: Funções de pontuação copiadas e coladas.
- **limitações encontradas**: Estrangulamento no banco de dados. Centenas de rascunhos acumulando porque os fluxos de inserção e processamento possuem vazões diferentes (Top 10 hardcoded).
- **impacto da fragmentação**: Impossibilidade de evoluir a ferramenta sem causar bugs em cadeia, Top 10 infestado por itens fracos, baratos demais e variantes clonadas.

======================================================================
## CAPÍTULO 2: STATUS DA ÉPICA

Sprint 01
Status: CONCLUÍDA

Sprint 02
Status: CONCLUÍDA

Sprint 03
Status: CONCLUÍDA

Sprint 04
Status: CONCLUÍDA

Sprint 05
Status: CONCLUÍDA

Sprint 06
Status: NÃO INICIADA

Sprint 07
Status: NÃO INICIADA

Sprint 08
Status: NÃO INICIADA

======================================================================
## CAPÍTULO 3: Arquitetura Atual

A auditoria recente mapeou a real arquitetura em uso:

**Scraper** (`oracle-scraper.cjs` extrai)
↓
**Normalização** (LLM Groq limpa o HTML e formata JSON)
↓
**Quality Gate** (`validateProduct` aplica filtros de preço e bloqueia anomalias básicas)
↓
**Score** (`calculateScoreV1` e `ShopeeBoost` atribuem a nota fria)
↓
**Draft** (`upsertOffer` deduplica de forma rasa por URL e salva no Supabase)
↓
**IA** (`ai-processor.cjs` consome os Top 10 pendentes ordenados pelo Score)
↓
**Posts** (Gera a Copy e as URLs de Afiliado, muda status para `approved`)
↓
**Dashboard** (Lê base de dados)
↓
**Publicação** (Manda pros Canais e WhatsApp)

**Arquivos, Funções e Responsabilidades mapeadas:**
- `oracle-scraper.cjs`: Extração e Score.
- `temp-runner.cjs`: Extração clonada paralela.
- `product-validator.ts`: Filtros e Quality Gate base.
- `ai-processor.cjs`: Limitador e gerador cego de copy.

======================================================================
## CAPÍTULO 4: Problemas Encontrados

- **Score V1:** Fórmula distorcida.
- **Score V2:** Existe mas atua apenas como A/B test passivo na telemetria.
- **Regras duplicadas:** Cálculos duplicados.
- **temp-runner:** Fluxo paralelo não unificado.
- **hardcodes:** Valores cravados pelo código sem padronização.
- **OFFERS_PER_STORE:** No scraper é 6, no temp-runner é 5.
- **VIP_SLOTS:** No AI é 10. No Scraper é infinito.
- **deduplicação insuficiente:** `original_url` pura permitindo variantes escaparem.
- **IA limitada:** Toma decisões sem ver desconto.
- **categorias ignoradas:** Itens irrelevantes concorrem com essenciais.

======================================================================
## CAPÍTULO 5: Arquitetura Objetivo

A arquitetura consolidada eliminará o espalhamento e se tornará:

**Marketplace Extraction Engine**
↓
**Normalization Engine**
↓
**Quality Engine**
↓
**Deduplication Engine**
↓
**Ranking Engine**
↓
**Marketplace Intelligence Engine**
↓
**AI Decision Engine**
↓
**Publication Pipeline**

======================================================================
## CAPÍTULO 6: ENGINE REGISTRY

**Marketplace Extraction Engine**
- Objetivo: Extrair dados de páginas HTML e APIs (Crawlee/Playwright).
- Responsabilidade: Raspar HTML.
- Status: A fazer.
- Sprint: N/A.

**Normalization Engine**
- Objetivo: Estruturar os dados raspados.
- Responsabilidade: Limpar o HTML e retornar JSON estruturado com IA.
- Status: A fazer.
- Sprint: N/A.

**Quality Engine**
- Objetivo: Agir como Gatekeeper contra produtos defeituosos ou não permitidos.
- Responsabilidade: Separar Qualidade Técnica (URL, preço nulo) de Comercial (Blacklist, Marketplace inválido) retornando `APPROVED`, `NEEDS_REVIEW` ou `REJECTED`.
- Status: CONCLUÍDO.
- Sprint: Sprint 02.

**Ranking Engine**
- Objetivo: Calcular pontuação fria e comercial da oferta (Score Base e Multiplicadores).
- Responsabilidade: Porta única de ranqueamento. Onde se define a prioridade matemática.
- Status: CONCLUÍDO.
- Sprint: Sprint 03.

**Marketplace Intelligence Engine**
- Objetivo: Atribuir lógica de negócios em cima do ranking.
- Responsabilidade: Popularidade, Tier Oficial, Vendidos.
- Status: CONCLUÍDO.
- Sprint: Sprint 04.

**Deduplication Engine**
- Objetivo: Identificar duplicidade comercial real, ignorando diferenças apenas de URL.
- Responsabilidade: Construir Commercial Identity e barrar variantes e clones.
- Status: CONCLUÍDO.
- Sprint: Sprint 05.

**AI Decision Engine**
- Objetivo: Refinar a triagem com contexto profundo e inteligência LLM.
- Responsabilidade: Vetar, priorizar, e escrever Copy com contexto macro.
- Status: A fazer.
- Sprint: N/A.

**Publication Pipeline**
- Objetivo: Entregar o produto para os canais.
- Responsabilidade: WhatsApp, Webhooks (Escopo WhatsApp Sprints).
- Status: A fazer.
- Sprint: N/A.

======================================================================
## CAPÍTULO 7: ENGINE RESPONSIBILITIES

**Marketplace Extraction Engine**
- Entrada: URLs.
- Saída: HTML/JSON bruto.
- Responsabilidade: Raspar dados mecanicamentre, sem inteligência de negócios.
--------------------------------------------
**Normalization Engine**
- Entrada: HTML/JSON bruto.
- Saída: Objeto Produto padronizado (OfferValidationInput).
- Responsabilidade: Mapear chaves caóticas de marketplaces distintos num esquema unificado.
--------------------------------------------
**Quality Engine**
- Entrada: Produto padronizado.
- Saída: Decisão (APPROVED, NEEDS_REVIEW, REJECTED) e Motivo.
- Responsabilidade: Impedir entrada de lixo técnico ou violação comercial primária no sistema. Sem fazer score.
--------------------------------------------
**Ranking Engine**
- Entrada: Produto Qualificado (APPROVED).
- Saída: Score Frio Final e Multiplicadores Básicos aplicados.
- Responsabilidade: Calcular "Qual a prioridade comercial desta oferta?" através de deduções exclusivas de valor e desconto. Não avalia veto, não avalia copy.
--------------------------------------------
**Marketplace Intelligence Engine**
- Entrada: Score Ranking Engine e Metadados do Produto.
- Saída: Tier List (S, A, B, C, Lixo).
- Responsabilidade: Elevar o patamar de ofertas oficiais/populares acima das baratas aleatórias.
--------------------------------------------
**Deduplication Engine**
- Entrada: Offer enriquecida com Commercial Tier.
- Saída: DeduplicationDecision (UNIQUE / DUPLICATE).
- Responsabilidade: Barrar a passagem de produtos idênticos (com base na identidade comercial), protegendo o AI Decision Engine.
--------------------------------------------
**AI Decision Engine**
- Entrada: Tier List.
- Saída: Veto/Aprovação fina, Copywriter pronto.
- Responsabilidade: Interpretar se a oferta faz sentido para a audiência alvo baseada no dia, mercado e concorrência no top 10.
--------------------------------------------
**Publication Pipeline**
- Entrada: Oferta prontas e curadas.
- Saída: Post publicado via WhatsApp e Dashboard.
- Responsabilidade: Entregar a mensagem no momento certo (Agendamentos, Imagens geradas, Tracking).

======================================================================
## CAPÍTULO 8: CHANGELOG ARQUITETURAL

### Sprint 01
- Arquitetura centralizada.
- SSOT: `oracle-scraper.cjs` definido como motor único de importação de módulos lógicos.
- Funções _DEPRECATED marcadas (como `processTopOffers` em scripts menores) preservadas para rollback.

### Sprint 02
- Quality Engine criado (`src/core/scraper/product-validator.ts` -> `QualityEngine`).
- Separação Technical/Commercial formalizada, retirando a confusão entre url quebrada vs. keyword banida.

### Sprint 03
- Ranking Engine criado (`src/core/ranking/ranking-engine.ts`).
- Centralização do Score: `calculateScoreV1`, `calculateScoreV2` e afins encapsulados.
- Porta única de ranqueamento estabelecida abstratamente.

### Sprint 04
- Marketplace Intelligence Engine criado (`src/core/intelligence/intelligence-engine.ts`).
- Estabelecido contrato para gerar um Multiplicador/Tier comercial de forma isolada do Ranking Base.

### Sprint 05
- Deduplication Engine criado (`src/core/deduplication/deduplication-engine.ts`).
- Estabelecido o conceito de `Commercial Identity` (Hash baseado em ID, Seller, Marketplace, Nome Normalizado e Preço) abolindo a limitação da deduplicação por URL estrita.

======================================================================
## CAPÍTULO 9: RASTREABILIDADE

### Sprint 01
- Objetivo: Eliminar duplicidades e unificar o `oracle-scraper.cjs` como SSOT.
- Resultado: Funções copiadas extraídas, uso centralizado imposto.
- Arquivos alterados: `scripts/oracle-scraper.cjs`, `scripts/temp-runner.cjs`, `scripts/ai-processor.cjs`.
- Arquivos preservados: `src/core/scraper/product-validator.ts`
- Homologação: Validação estrita confirmou que extração não parou e lógica roda por referência.
- Status: CONCLUÍDA.
- Próxima Sprint: Sprint 02.
- Commit: Consultar histórico Git.
- Push: Consultar histórico Git.

### Sprint 02
- Objetivo: Centralizar Quality Gate e Product Validator em uma abstração separando Qualidade Técnica de Qualidade Comercial.
- Resultado: `QualityEngine` introduzido delegando as checagens independentemente. Decisões `APPROVED`, `REJECTED`, `NEEDS_REVIEW`.
- Arquivos alterados: `src/core/scraper/product-validator.ts`, `scripts/scraper-adapter.cjs`.
- Arquivos preservados: `scripts/oracle-scraper.cjs`, `src/lib/publish/quality-gate.ts`, `scripts/temp-runner.cjs`.
- Homologação: Teste caveman sem regressões, as antigas chamadas funcionam.
- Status: CONCLUÍDA.
- Próxima Sprint: Sprint 03.
- Commit: Consultar histórico Git.
- Push: Consultar histórico Git.

### Sprint 03
- Objetivo: Criar Ranking Engine para unificar a matemática de pontuação num único ponto.
- Resultado: `RankingEngine` isolou V1, V2, ShopeeBoost e merge de AI score, eliminando repetição na base do scraper.
- Arquivos alterados: `src/core/ranking/ranking-engine.ts`, `scripts/scraper-adapter.cjs`.
- Arquivos preservados: `scripts/oracle-scraper.cjs`, `scripts/temp-runner.cjs`.
- Homologação: Criado e centralizado sem regressões na produção paralela.
- Status: CONCLUÍDA.
- Próxima Sprint: Sprint 04.
- Commit: Consultar histórico Git.
- Push: Consultar histórico Git.

### Sprint 04
- Objetivo: Iniciar a inteligência comercial das ofertas respondendo "Qual o valor comercial desta oferta?".
- Resultado: Criado `MarketplaceIntelligenceEngine` que consolida popularidade, comissão, mall e ratings em `Tiers` (S, A, B, C, LIXO) sem recalcular score puro de preço.
- Arquivos alterados: `src/core/intelligence/intelligence-engine.ts`.
- Arquivos preservados: `scripts/oracle-scraper.cjs`, `src/core/ranking/ranking-engine.ts`, `src/core/scraper/product-validator.ts`.
- Homologação: Código implementado preservando compatibilidade arquitetural total.
- Status: CONCLUÍDA.
- Próxima Sprint: Sprint 05.
- Commit: Consultar histórico Git.
- Push: Consultar histórico Git.

### Sprint 05
- Objetivo: Implementar Deduplication Engine focado na identidade comercial, e não apenas em URLs.
- Resultado: Criado `DeduplicationEngine` e a abstração de `Commercial Identity`, agrupando hashes determinísticos baseados na inteligência.
- Arquivos alterados: `src/core/deduplication/deduplication-engine.ts`.
- Arquivos preservados: `scripts/oracle-scraper.cjs`, `src/core/scraper/product-validator.ts`.
- Homologação: A engine não quebrou os scrapers e preserva a interface unidirecional da arquitetura.
- Status: CONCLUÍDA.
- Próxima Sprint: Sprint 06.
- Commit: Consultar histórico Git.
- Push: Consultar histórico Git.

======================================================================
## CAPÍTULO 10: Metodologia Oficial

Toda Sprint desta épica deverá obrigatoriamente utilizar:

`/using-superpowers`
↓
`/ponytail`
↓
`/caveman`
↓
**Validação**
↓
**Homologação**
↓
**Commit**
↓
**Push**
↓
**Deploy**

======================================================================
## CAPÍTULO 11: Roadmap das Sprints

### SPRINT 01: Arquitetura
- Status: CONCLUÍDA

### SPRINT 02: Quality Engine
- Status: CONCLUÍDA

### SPRINT 03: Ranking Engine
- Status: CONCLUÍDA

### SPRINT 04: Marketplace Intelligence Engine
- **Objetivo:** Adicionar inteligência comercial (Popularidade, Categoria, Loja Oficial, Shopee Mall, Vendidos, Rating, Comissão, Campanhas, Frete, Cashback).
- **Status:** CONCLUÍDA

### SPRINT 05: Deduplication Engine
- **Objetivo:** Implementar `contentHash`. Tratar Produtos semelhantes, Variantes, URLs equivalentes. Eliminar duplicidades ativamente no DB.
- **Status:** CONCLUÍDA

### SPRINT 06: AI Decision Engine
- **Objetivo:** Transformar IA em avaliadora comercial. Decidir: aprovar, rejeitar, priorizar.
- **Status:** NÃO INICIADA

### SPRINT 07: Dashboard Intelligence
- **Objetivo:** Exibir Score, Categoria, Marketplace, Motivos, Diversidade, Inteligência.
- **Status:** NÃO INICIADA

### SPRINT 08: Analytics
- **Objetivo:** Implementar CTR, Conversão, Marketplace, Categoria, Performance, Ranking, Histórico.
- **Status:** NÃO INICIADA

======================================================================
## CAPÍTULO 12: Decisões Arquiteturais

Nunca mais criar:
- Score paralelo;
- Runner paralelo;
- Pipeline paralelo;
- Engine paralela;
- Regra duplicada.

Toda inteligência deverá existir em um único lugar, como uma fonte única de verdade (Single Source of Truth).

======================================================================
## CAPÍTULO 13: Boas Práticas

Uma Sprint somente poderá ser considerada concluída após:
Implementação
↓
Testes
↓
Homologação
↓
Atualização da documentação
↓
Commit
↓
Push
↓
Deploy

**A documentação passa a fazer parte da Definition of Done (DoD).**

- reutilizar código;
- evitar duplicidade;
- documentar decisões.

======================================================================
## CAPÍTULO 14: Referências Obrigatórias

Toda Sprint desta épica deverá obrigatoriamente consultar:
- `docs/marketplace-intelligence-sprints.md`
- `docs/whatsapp-sprints.md`
- `docs/roadmap.md`
- `README.md`
- `AGENTS.md`

**docs/whatsapp-sprints.md**
Responsável por: publicação, WhatsApp, canais.

**docs/marketplace-intelligence-sprints.md**
Responsável por: Extração, Ranking, Inteligência, Analytics.

======================================================================
## CAPÍTULO 15: ENGINE CONTRACTS

**Marketplace Extraction Engine**
- Entrada: URL
- Saída: Offer
- Responsabilidade: Extrair dados do marketplace.
- Nunca: validar; ranquear; gerar score.

**Normalization Engine**
- Entrada: Offer
- Saída: NormalizedOffer
- Responsabilidade: Normalizar dados.
- Nunca: validar; ranquear.

**Quality Engine**
- Entrada: NormalizedOffer
- Saída: APPROVED, NEEDS_REVIEW, REJECTED
- Responsabilidade: Validar qualidade técnica e comercial.
- Nunca: Calcular ranking.

**Ranking Engine**
- Entrada: Offer aprovada.
- Saída: priorityScore
- Responsabilidade: Ordenar ofertas.
- Nunca: Validar qualidade; Gerar copy.

**Marketplace Intelligence Engine**
- Entrada: Offer válida, priorityScore.
- Saída: Commercial Tier.
- Responsabilidade: Classificar valor comercial.
- Nunca: Calcular ranking; Gerar IA; Publicar.

**AI Decision Engine**
- *Status:* PLANEJADO
- Responsabilidade futura: Receber apenas ofertas aprovadas.
- Nunca: Calcular ranking; Validar qualidade.

**Publication Pipeline**
- Responsabilidade: Responsável apenas pelo envio.

======================================================================
## CAPÍTULO 16: CONTRATO DOS TIERS

**Tier S**
- Grandes Achados.
- Características: Alta demanda. Alta confiança. Excelente comissão. Excelente reputação. Grande potencial de conversão.
- Destino: Estes produtos deverão possuir prioridade máxima.

**Tier A**
- Muito bons. Produtos fortes.
- Características: Boa demanda. Boa confiança. Boa conversão.

**Tier B**
- Produtos interessantes.
- Destino: Podem consumir IA dependendo da disponibilidade.

**Tier C**
- Produtos comuns.
- Destino: Baixa prioridade. Devem consumir IA apenas em situações específicas.

**Tier LIXO**
- Produtos sem relevância comercial.
- Exemplos: Produtos extremamente nichados, genéricos, repetidos, baixa atratividade, cupons sem produto, baixa confiança.
- Destino: Tier LIXO não deverá consumir recursos da IA quando o AI Decision Engine for implementado.

======================================================================
## CAPÍTULO 17: FLUXO OFICIAL DA ARQUITETURA

Marketplace Extraction Engine
↓
Normalization Engine
↓
Quality Engine
↓
Ranking Engine
↓
Marketplace Intelligence Engine
↓
Commercial Tier
↓
AI Decision Engine
↓
Publication Pipeline

*Este passa a ser o fluxo oficial do projeto.*

======================================================================
## CAPÍTULO 18: PREPARAÇÃO PARA A SPRINT 05

A próxima Sprint criará o Deduplication Engine.
Objetivo: Deixar de comparar apenas URLs. Passar a comparar identidade comercial.

Futura arquitetura de comparação:
Mesmo Produto
↓
Mesmo Marketplace
↓
Mesmo Vendedor
↓
Mesmo Nome Normalizado
↓
Mesmo Preço
↓
Mesmo Tier
↓
Mesmo Hash Comercial
↓
Duplicado

*(Nota: Regra puramente documental nesta Sprint. Implementação apenas na Sprint 05.)*

======================================================================
## CAPÍTULO 19: PREPARAÇÃO PARA A SPRINT 06

Objetivo futuro: A IA não deverá mais consumir todas as ofertas.
Fluxo planejado de consumo:

**Tier S** ↓ Sempre elegível.
**Tier A** ↓ Elegível.
**Tier B** ↓ Elegível conforme disponibilidade.
**Tier C** ↓ Baixa prioridade.
**Tier LIXO** ↓ Não deverá consumir IA.

*(Nota: Esta regra ainda NÃO está implementada. Ela será implementada exclusivamente na Sprint 06.)*

