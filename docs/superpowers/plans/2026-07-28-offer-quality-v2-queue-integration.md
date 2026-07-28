# Offer Quality V2 Queue Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the existing Offer Quality V2 evaluator to the Discovery queue behind an explicit `active` flag while preserving the current V1 behavior for `false` and `shadow`.

**Architecture:** Add a pure queue-admission adapter that converts already validated Oracle candidates into V2 candidates without fabricating persisted tracking URLs. The worker will call it immediately before `selectCopyQueue` only when `OFFER_QUALITY_PIPELINE_V2=active`; the default `false` path and observational `shadow` path remain unchanged. The adapter will return only V2 winners, and the existing V1 queue/persistence remains the sole writer.

**Tech Stack:** Node.js CommonJS Oracle worker, TypeScript Offer Quality core, Vitest, deterministic feature flag.

## Global Constraints

- `OFFER_QUALITY_PIPELINE_V2=false` remains the default and must produce byte-for-byte equivalent queue inputs.
- `shadow` must never filter, reorder, persist, publish or call Supabase.
- `active` must be opt-in only; this branch must not enable it in production or deploy Oracle.
- Never fabricate `tracked_url`, UUIDs or channel prefixes before an offer row exists; pre-persist admission uses the already validated `product.monetization.valid` signal, while persisted-link verification remains downstream.
- No Supabase writes, Oracle changes, PM2 restarts, scraping or publication during development.
- TDD is mandatory: every production change receives a failing test before implementation.

---

### Task 1: Define the pre-persist admission contract

**Files:**
- Modify: `src/core/offer-quality/types.ts`
- Create: `src/core/offer-quality/queue-adapter.ts`
- Test: `src/tests/core/offer-quality/queue-adapter.test.ts`

**Interfaces:**
- `OfferQualityQueueProduct` maps one Oracle product to its `sourceItemId` and V2 candidate fields.
- `selectOfferQualityQueueProducts(products, options): { accepted, rejected }`.
- `options.monetizationValid(product)` is required and must be supplied by the Oracle caller.

**Rules:**
- Reject malformed identity, HTTPS source/image, title or price using existing evaluator rules.
- Treat `monetizationValid(product) === true` as pre-persist monetization evidence; do not create affiliate links.
- Rank/group with existing V2 evaluator and return only winner `sourceItemId`s.
- Preserve original product objects; no mutation, URL fabrication or persistence callback.

- [x] Write a failing test for one valid ML winner and one invalid candidate.
- [x] Run `npm test -- src/tests/core/offer-quality/queue-adapter.test.ts` and verify the expected failure.
- [x] Implement the smallest pure adapter and pre-persist monetization contract.
- [x] Re-run the targeted test and verify it passes.

### Task 2: Integrate admission before the V1 queue

**Files:**
- Modify: `scripts/oracle-worker-discovery-only.cjs`
- Test: `src/tests/oracle-worker-discovery-only.test.ts`

**Rules:**
- Add an optional `qualityAdmission` dependency to `runDiscoveryOnlyCycle`.
- Execute it only when `OFFER_QUALITY_PIPELINE_V2 === 'active'`.
- Keep `false` and `shadow` candidate arrays unchanged; `shadow` remains handled by the existing observer.
- If active admission fails, fail closed for that marketplace and emit a typed observation; do not fall back to V1.
- Pass the filtered candidates into `selectCopyQueue`; call existing `persist` only for the queue result.

- [x] Add failing tests proving `false` calls no admission and preserves all candidates.
- [x] Add a failing test proving `shadow` does not filter candidates.
- [x] Add a failing test proving `active` passes only admitted winners to queue/persist.
- [x] Run the targeted worker tests and verify failures for the new assertions.
- [x] Implement the guarded integration and minimal observation payload.
- [x] Re-run targeted worker tests and verify all pass.

### Task 3: Wire the Oracle adapter without enabling it

**Files:**
- Modify: `scripts/oracle-scraper.cjs`
- Modify: `scripts/offer-quality-shadow-runtime.cjs` only if the generated runtime needs the new adapter export.
- Test: `src/tests/oracle-worker-ingestion.test.ts`

**Rules:**
- Load the queue adapter lazily only for `active`; importing the scraper with the flag unset must remain safe.
- Map `product.monetization.valid` to the adapter's pre-persist monetization callback.
- Do not pass affiliate links or synthetic UUIDs to the adapter.
- Keep `createQualityShadowRunner()` unchanged for `shadow`.

- [x] Add a failing integration test covering an Amazon candidate with valid pre-persist monetization.
- [x] Run the test and verify it fails before wiring.
- [x] Wire the lazy adapter and callback.
- [x] Re-run the integration test and verify it passes.

### Task 4: Document activation and rollback

**Files:**
- Modify: `docs/offer-quality-shadow-mode.md`
- Create: `docs/offer-quality-v2-active-mode.md`

**Documentation must state:**
- `false`: current V1 path, no evaluator call.
- `shadow`: V1 path plus read-only comparison.
- `active`: V2 admission before queue, still using existing V1 persistence; activation requires explicit approval and one controlled cycle.
- rollback is setting the flag to `false`; no database rollback is required.
- pre-persist monetization validation does not fabricate tracked links.

- [x] Add a documentation assertion for all three flag states.
- [x] Run it and verify failure before documentation is added.
- [x] Add the two documents and the assertion.
- [x] Run the documentation assertion and targeted suites.

### Task 5: Verification gate

- [x] Run `npm test -- src/tests/core/offer-quality src/tests/oracle-worker-discovery-only.test.ts src/tests/oracle-worker-ingestion.test.ts`.
- [x] Run `npm run typecheck`.
- [x] Run `npm run build`.
- [x] Run `git diff --check`.
- [x] Confirm `OFFER_QUALITY_PIPELINE_V2` is not enabled in code, `.env*`, CI or Oracle scripts.
- [x] Review diff for zero Supabase/Oracle/PM2 changes and present the branch/commit for approval.

## Definition of Done

The branch is ready for review only when `false` and `shadow` are proven unchanged, `active` is covered by tests, the build/typecheck/diff checks are fresh and no runtime deployment has occurred.
