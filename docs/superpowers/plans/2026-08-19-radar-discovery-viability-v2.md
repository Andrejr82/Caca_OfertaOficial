# Radar Discovery and Commercial Viability V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reestruturar o pipeline do botão "Solicitar Radar" da página Tendências IA para minerar produtos novos diretamente de Shopee e Mercado Livre com recência configurável, deduplicação por catálogo (ML productId) e semântica (Shopee família), viabilidade comercial V2 observada, loop de refill (alvo 20, mínimo 10), diversidade no Top 20 e observabilidade estrita no `source_health` com `google_trends_used = false`.

**Architecture:** Módulos determinísticos isolados em Node.js (`scripts/`): motor de viabilidade comercial V2 (`commercial-viability-v2.cjs`), gerenciador de freshness por janela de recência e chaves de catálogo (`oracle-trends-radar-freshness.cjs`), orquestrador de descoberta paginada e refill Shopee/ML com diversidade e ranking executivo (`oracle-trends-radar-engine.cjs`, `oracle-trends-radar-runner.cjs`).

**Tech Stack:** Node.js CommonJS, Next.js / TypeScript, Supabase Client, node:test, vitest.

## Global Constraints

- Nunca fabricar preço, vendas, rating, comissão, desconto, velocidade ou qualquer outro dado ausente.
- Manter `google_trends_used = false` sempre.
- Não executar publicação automática; não alterar fluxos sociais ou de mensageria (WhatsApp, Telegram, Meta).
- Não criar ofertas automáticas na tabela `offers` pelo simples aparecimento no Radar.
- Não executar deploy Oracle, não alterar PM2, não alterar variáveis de ambiente remotas nesta execução.
- Não executar `docs:audit` (Documentation Audit deve permanecer isolada).
- Meta de quantidade: `target_products = 20`, `minimum_products = 10`.
- Menos de 10 produtos só é aceito com motivo explícito `eligible_sources_exhausted` após esgotamento real de fontes/páginas.

---

### Task 1: Motor de Viabilidade Comercial V2 (`scripts/commercial-viability-v2.cjs`)

**Files:**
- Create: `scripts/commercial-viability-v2.cjs`
- Test: `scripts/__tests__/commercial-viability-v2.test.js`

**Interfaces:**
- Produces: `calculateCommercialViabilityV2(candidate, options)`:
  - Return: `{ classification: 'high' | 'medium' | 'low' | 'insufficient_data', effectiveCommissionPercent: number, estimatedCommissionPerSale: number | null, reasons: string[], diagnostic: object }`
  - `isViableForRadar(viabilityResult)`: boolean (`true` para `high` e `medium`, `false` para `low` e `insufficient_data`)

- [ ] **Step 1: Write the failing tests for Commercial Viability V2**
  - Test `high` classification on strong demand/commission/ticket.
  - Test `medium` classification on verified demand and accessible price.
  - Test `low` classification on micro-ticket with negligible commission or poor rating/zero demand.
  - Test `insufficient_data` when price is missing or invalid.
  - Test `sales_velocity` usage only when `velocity_status === 'computed'`.
  - Test non-fabrication of missing commission, rating or velocity.

- [ ] **Step 2: Run tests to verify they fail**
  Run: `node --test scripts/__tests__/commercial-viability-v2.test.js`

- [ ] **Step 3: Implement `scripts/commercial-viability-v2.cjs`**
  - Extract observed `effectiveCommissionPercent` and `estimatedCommissionPerSale`.
  - Classify into `high`, `medium`, `low`, `insufficient_data` fail-closed.
  - Implement `isViableForRadar`.

- [ ] **Step 4: Run tests to verify they pass**
  Run: `node --test scripts/__tests__/commercial-viability-v2.test.js`

---

### Task 2: Freshness com Janela de Recência e Identidade de Catálogo (`scripts/oracle-trends-radar-freshness.cjs`)

**Files:**
- Modify: `scripts/oracle-trends-radar-freshness.cjs`
- Test: `scripts/__tests__/oracle-trends-radar-freshness-v2.test.js`

**Interfaces:**
- Produces:
  - `getMarketplaceIdentityKey(candidate)`:
    - ML: `mercadolivre:catalog:${productId}` (se productId existir), senão `mercadolivre:item:${itemId}`, senão `mercadolivre:name:${normalizedName}`.
    - Shopee: `shopee:shop:${shopId}:item:${itemId}`.
  - `fetchCompletedRadarIdentityKeys(client, tenantId, options)`:
    - Queries `trend_radar_runs` with `status = 'completed'` AND `created_at >= window_start` (default 7 days).
    - Returns `{ latestRunId, runCount, recentIdentityKeys, recentRunIds, agedOutRunCount, recencyDays }`.
  - `filterCandidatesWithRecency(candidates, recentIdentityKeys, existingOfferKeys)`:
    - Returns `{ fresh, excludedRecentHistory, excludedExistingOffers }`.

- [ ] **Step 1: Write the failing tests for recency window and catalog identity**
  - Test ML identity key prioritizes `productId` over `itemId`.
  - Test Shopee identity key includes `shopId` and `itemId`.
  - Test recency window blocks products seen within window (e.g. 7 days).
  - Test products seen outside recency window are NOT blocked (aged out).
  - Test existing offer exclusion when required.

- [ ] **Step 2: Run tests to verify they fail**
  Run: `node --test scripts/__tests__/oracle-trends-radar-freshness-v2.test.js`

- [ ] **Step 3: Implement updates in `scripts/oracle-trends-radar-freshness.cjs`**

- [ ] **Step 4: Run tests to verify they pass**
  Run: `node --test scripts/__tests__/oracle-trends-radar-freshness-v2.test.js`

---

### Task 3: Deduplicação Semântica e Diversidade de Famílias (`scripts/radar-semantic-dedup-v2.cjs`)

**Files:**
- Create: `scripts/radar-semantic-dedup-v2.cjs`
- Test: `scripts/__tests__/radar-semantic-dedup-v2.test.js`

**Interfaces:**
- Consumes: `family-key-engine.cjs` (`computeAllKeys`, `extractProductTypeSlug`, `normalizeToken`).
- Produces:
  - `deduplicateCatalogAndSemantic(candidates, options)`:
    - Deduplicates ML by `productId` (best representative).
    - Deduplicates Shopee by `family_key` / semantic equivalence (best representative).
    - Returns `{ uniqueCandidates, excludedCatalogDuplicates, excludedSemanticDuplicates, familyMap }`.
  - `applyFamilyDiversityCap(rankedCandidates, maxPerFamily)`:
    - Caps items per family (e.g. max 3) in Top 20 while preserving top performers.

- [ ] **Step 1: Write failing tests for semantic deduplication and diversity**
  - Test two ML products with same `productId` and different `itemId` -> 1 chosen (best score/sales).
  - Test two semantically equivalent products (e.g. smart interactive cat ball) -> 1 chosen.
  - Test two genuinely different products in same category (e.g. air fryer vs liquidificador) -> both remain.
  - Test diversity capping avoids 6+ items of the exact same family.

- [ ] **Step 2: Run tests to verify they fail**
  Run: `node --test scripts/__tests__/radar-semantic-dedup-v2.test.js`

- [ ] **Step 3: Implement `scripts/radar-semantic-dedup-v2.cjs`**

- [ ] **Step 4: Run tests to verify they pass**
  Run: `node --test scripts/__tests__/radar-semantic-dedup-v2.test.js`

---

### Task 4: Descoberta Paginada, Refill Loop e Orquestração do Radar (`scripts/oracle-trends-radar-engine.cjs`, `scripts/oracle-trends-radar-runner.cjs`)

**Files:**
- Modify: `scripts/oracle-trends-radar-engine.cjs`
- Modify: `scripts/oracle-trends-radar-runner.cjs`
- Test: `scripts/__tests__/radar-discovery-viability-v2.test.js`

**Interfaces:**
- Consumes: `commercial-viability-v2.cjs`, `oracle-trends-radar-freshness.cjs`, `radar-semantic-dedup-v2.cjs`.
- Produces:
  - `processPendingTrendRadarRuns(options)`:
    - Implements multi-round discovery & refill loop.
    - `target_products = 20`, `minimum_products = 10`.
    - `google_trends_used = false`.
    - Populates exhaustive `source_health` metrics.
    - Zero publish calls, zero automatic offers created.

- [ ] **Step 1: Write failing tests covering all 20 required TDD scenarios**
  - TEST 1: Same Shopee shopId + itemId twice -> 1 candidate.
  - TEST 2: Same ML productId with different itemIds -> 1 commercial product.
  - TEST 3: Two semantically equivalent products -> only best representative.
  - TEST 4: Two different products of same category -> both remain.
  - TEST 5: Product seen within recency window -> blocked.
  - TEST 6: Product seen outside recency window -> eligible again.
  - TEST 7: Product in existing offer when policy requires -> excluded.
  - TEST 8: Low viability product -> excluded.
  - TEST 9: High viability product -> eligible.
  - TEST 10: Medium viability product -> eligible.
  - TEST 11: Insufficient data product -> does not occupy main commercial slot.
  - TEST 12: First collection produces 3 candidates -> refill triggers new round.
  - TEST 13: Refill reaches 10+ -> continues normally.
  - TEST 14: Refill reaches 20 -> `target_reached = true`.
  - TEST 15: Sources exhaust at 7 -> finishes with 7, `target_reached = false`, `completion_reason = eligible_sources_exhausted`, 0 fabricated candidates.
  - TEST 16: Top 20 contains 0 duplicate commercial identities.
  - TEST 17: Top 20 contains 0 prohibited semantic duplicates.
  - TEST 18: `google_trends_used === false`.
  - TEST 19: 0 automatic publications.
  - TEST 20: 0 automatic offer creations.

- [ ] **Step 2: Run tests to verify failure**
  Run: `node --test scripts/__tests__/radar-discovery-viability-v2.test.js`

- [ ] **Step 3: Implement discovery pagination, refill loop, and full source_health in `oracle-trends-radar-engine.cjs` and `oracle-trends-radar-runner.cjs`**

- [ ] **Step 4: Run tests to verify they pass**
  Run: `node --test scripts/__tests__/radar-discovery-viability-v2.test.js`
  Run: `node --test scripts/__tests__/oracle-trends-radar-runner.test.js`

---

### Task 5: Validação Integral do Sistema

- [ ] **Step 1: Run all test suites**
  Run: `npm run test`
  Run: `node --test scripts/__tests__/*.test.js`
- [ ] **Step 2: Run Lint**
  Run: `npm run lint`
- [ ] **Step 3: Run Typecheck**
  Run: `npm run typecheck`
- [ ] **Step 4: Run Build**
  Run: `npm run build`
- [ ] **Step 5: Run Security Check**
  Run: `npm run security:check`
- [ ] **Step 6: Prepare standalone Oracle Rollout Prompt**
