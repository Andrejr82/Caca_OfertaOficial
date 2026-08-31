# Shopee Novel Curation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Select three to five new, commercially strong Shopee products from the candidates already collected, without increasing OpenAPI requests or counting historical/rejected rows as delivered.

**Architecture:** The OpenAPI engine will expose its complete qualified in-memory pool while preserving the current request plan. The discovery worker will load complete Shopee identity history, remove historical products before final family selection, backfill from the remaining pool, and verify the final database status after persistence. Shopee-only routing will replace the disabled Informática slot without changing other marketplaces.

**Tech Stack:** Node.js CommonJS, Shopee Affiliate OpenAPI GraphQL, Supabase/PostgREST, Vitest, Node test runner, PM2.

## Global Constraints

- Do not add Shopee OpenAPI requests.
- Do not weaken sales, rating, commission, identity, image, link, accessory, or component gates.
- Do not reactivate `rejected` offers.
- Do not create a database table or migration.
- Do not publish to social networks during validation.
- Final selection is three to five distinct families when sufficient valid families exist.

---

### Task 1: Preserve the Qualified Candidate Pool

**Files:**
- Modify: `scripts/shopee-openapi-shadow-engine-v1.cjs`
- Modify: `scripts/__tests__/shopee-openapi-shadow-engine-v1.test.js`

**Interfaces:**
- Produces: `scenarioResult.candidatePool: ProductOffer[]`
- Produces: `selectCuratedFamilyRepresentatives(products, limit)` for final family diversity.
- Preserves: the existing FULL, DELTA, exact-item, and fallback request counts.

- [ ] **Step 1: Write a failing test** proving that two candidates from one family remain in `candidatePool`, final `top` has distinct families, and request counts do not increase.
- [ ] **Step 2: Run** `npx vitest run scripts/__tests__/shopee-openapi-shadow-engine-v1.test.js` and confirm failure because `candidatePool` is absent.
- [ ] **Step 3: Implement** `candidatePool` from the already-qualified `scenarioResult.top`; keep multiple identities per family, deduplicate only exact item IDs, and keep `top` as a compatibility projection.
- [ ] **Step 4: Run the focused test** and confirm it passes with the same request count.

### Task 2: Apply Permanent History Before Final Selection

**Files:**
- Modify: `scripts/offer-freshness-gate.cjs`
- Modify: `scripts/oracle-worker-discovery-only.cjs`
- Modify: `scripts/oracle-scraper.cjs`
- Modify: `scripts/__tests__/offer-freshness-gate.test.js`
- Modify: `scripts/__tests__/oracle-worker-discovery-only-shadow.test.js`

**Interfaces:**
- Extends: `filterFreshCandidates(marketplace, products, history, options)` with `permanentStatuses`.
- Consumes: `discovery.candidatePool`, falling back to `discovery.top` for compatibility.
- Produces: final Shopee candidates selected after historical exclusion, one per family, limit five.

- [ ] **Step 1: Write a failing gate test** proving that a 60-day-old `approved`, `selected`, `posted`, or `rejected` Shopee identity is rejected as `historical_identity` even after a material price change.
- [ ] **Step 2: Run** `npx vitest run scripts/__tests__/offer-freshness-gate.test.js` and confirm the old identity is currently accepted.
- [ ] **Step 3: Implement** permanent-status exclusion without changing cooldown behavior for other calls or marketplaces.
- [ ] **Step 4: Write a failing worker test** with an old family leader, a new alternative in the same family, and four other families; expect five new distinct products and no historical identity.
- [ ] **Step 5: Run** `npx vitest run scripts/__tests__/oracle-worker-discovery-only-shadow.test.js` and confirm failure because the worker only reads `top` and does not backfill.
- [ ] **Step 6: Implement** candidate-pool consumption, permanent Shopee history, post-history family ranking, and five-item final selection.
- [ ] **Step 7: Change scheduled history loading** so Shopee uses `loadActiveDiscoveryHistory` and other marketplaces retain `loadRecentDiscoveryHistory`.
- [ ] **Step 8: Run both focused test files** and confirm they pass.

### Task 3: Count Only Visible Approved Deliveries

**Files:**
- Modify: `scripts/oracle-scraper.cjs`
- Modify: `scripts/__tests__/shopee-openapi-v1-controlled-persist.test.js`

**Interfaces:**
- Extends: `createShopeeOpenApiV1OfficialPersistRunner({ lookupPersistedOfferStatuses })`.
- Produces: `accepted`, `offerIds`, and `visibleApproved` based only on rows whose final status is `approved`.
- Preserves: rejected rows and reports them through `ignoredNonApproved`.

- [ ] **Step 1: Write a failing test** where persistence returns one approved and one rejected ID; expect only the approved ID to count.
- [ ] **Step 2: Run** `npx vitest run scripts/__tests__/shopee-openapi-v1-controlled-persist.test.js` and confirm both currently count.
- [ ] **Step 3: Implement** post-persistence status verification with an injectable lookup and a Supabase default query.
- [ ] **Step 4: Run the focused test** and confirm approved-only accounting passes.

### Task 4: Reassign Shopee's Disabled Informática Slot

**Files:**
- Modify: `scripts/oracle-scraper.cjs`
- Modify: `scripts/__tests__/oracle-shopee-v1-resilience.test.js`

**Interfaces:**
- Produces: `resolveShopeeScenarioForCycle(scenarioId, date)`.
- Maps: `informatica_editorial` to an active Shopee niche using deterministic weekday rotation.
- Preserves: the original Informática scenario for Mercado Livre and Amazon.

- [ ] **Step 1: Write a failing test** proving that Shopee never receives `informatica_editorial`, while a non-Informática scenario is unchanged.
- [ ] **Step 2: Run** `npx vitest run scripts/__tests__/oracle-shopee-v1-resilience.test.js` and confirm the resolver is absent.
- [ ] **Step 3: Implement** deterministic rotation across Casa, Beleza, Moda, Ferramentas, Pet, and Eletrodomésticos, and apply it only to the Shopee scenario resolver.
- [ ] **Step 4: Run the focused test** and confirm it passes.

### Task 5: Verification and Safe Release Preparation

**Files:**
- Modify: `scripts/update-oracle.js` only if a newly changed runtime file is absent from the `shopee-curated-v2` profile.
- Update: this plan's checkboxes only after evidence exists.

**Interfaces:**
- Consumes: all behavior from Tasks 1–4.
- Produces: one locally committed, deployable release with no database migration.

- [ ] **Step 1: Run focused tests:** `npx vitest run scripts/__tests__/shopee-openapi-shadow-engine-v1.test.js scripts/__tests__/offer-freshness-gate.test.js scripts/__tests__/oracle-worker-discovery-only-shadow.test.js scripts/__tests__/shopee-openapi-v1-controlled-persist.test.js scripts/__tests__/oracle-shopee-v1-resilience.test.js`.
- [ ] **Step 2: Run Node contract tests:** `node --test scripts/tests/shopee-openapi-v1-contract.test.cjs scripts/tests/shopee-productcatids-map-v1.test.cjs scripts/tests/offer-freshness-gate.test.cjs`.
- [ ] **Step 3: Run syntax, lint, typecheck, and production build** for the changed runtime and test files.
- [ ] **Step 4: Confirm** `git diff --check`, no migration, no secret, and no unexpected file.
- [ ] **Step 5: Commit locally** with a concise Conventional Commit message; do not push or deploy without explicit authorization.

## Plan Self-Review

- Spec coverage: candidate reuse, permanent novelty, family diversity, backfill, approved-only accounting, disabled Informática routing, no added API cost, and release verification are covered.
- Placeholder scan: no deferred implementation steps or undefined interfaces remain.
- Type consistency: `candidatePool`, `permanentStatuses`, `visibleApproved`, `ignoredNonApproved`, and `resolveShopeeScenarioForCycle` are defined before downstream use.
