# Multimarketplace Offer Quality Dry-Run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a read-only, feature-flagged evaluator that compares Mercado Livre, Amazon and Shopee offer quality before any future persistence change.

**Architecture:** Add a pure TypeScript evaluation core that consumes normalized Candidate V1-like objects and returns explainable decisions. Add a Node dry-run adapter that reads fixtures or an explicitly supplied export, never imports a write client, and emits sanitized JSON/NDJSON reports. Keep `OFFER_QUALITY_PIPELINE_V2=false` and leave the current Oracle path untouched.

**Tech Stack:** TypeScript, Vitest, Node.js CommonJS dry-run script, existing PMAV5 Candidate V1 contracts, existing curation/family rules.

## Global Constraints

- No writes to Supabase, Oracle, PM2, Vercel or social channels.
- No changes to the current production selection or persistence path.
- Feature flag defaults to `false`; dry-run remains observational even if explicitly enabled.
- No marketplace scraping in automated tests; use deterministic fixtures and existing exported data.
- Do not include secrets, service-role keys or private URLs in reports.
- Destructive migration, backfill and historical cleanup are prohibited.
- Every production function must have a test written and observed failing before implementation.

---

### Task 1: Add the evaluation contracts

**Files:**
- Create: `src/core/offer-quality/types.ts`
- Test: `src/tests/core/offer-quality/types.test.ts`

**Interfaces:**
- Produce `OfferQualityCandidate`, `OfferQualityDecision`, `OfferQualityReport`, `ScoreBreakdown`, `DiscountConfidence` and `DecisionKind`.
- Require `marketplace` to be `Mercado Livre`, `Amazon` or `Shopee`.
- Represent `recordCount` and `persistAttemptCount` in the report, with `persistAttemptCount` always zero for dry-run.

- [ ] **Step 1: Write failing type/shape tests** asserting a valid candidate contains native identity, price, image and source metadata, and that a report defaults to zero persistence attempts.
- [ ] **Step 2: Run** `npm test -- src/tests/core/offer-quality/types.test.ts`; confirm failure because the contracts do not exist.
- [ ] **Step 3: Implement the minimal exported TypeScript types and constructors** with no runtime side effects.
- [ ] **Step 4: Run the targeted test again** and confirm it passes.
- [ ] **Step 5: Run** `npm run typecheck`.
- [ ] **Step 6: Commit** with `feat(quality): add multimarketplace evaluation contracts`.

### Task 2: Implement native identity, input validation and grouping

**Files:**
- Create: `src/core/offer-quality/grouping.ts`
- Test: `src/tests/core/offer-quality/grouping.test.ts`

**Interfaces:**
- `validateNativeIdentity(candidate): ValidationResult`
- `validateCandidateBasics(candidate): ValidationResult`
- `getGroupKey(candidate): GroupKeyResult`

**Rules:**
- Mercado Livre: accept only non-empty native `item_id`; use catalog `/p/MLB...` when present, otherwise item identity.
- Amazon: accept a valid ten-character ASIN; group primarily by ASIN.
- Shopee: require `itemId`; include `shopId` in the group key when present, and never merge different sellers without it.
- Reject invalid HTTPS image/source URLs, non-positive prices, malformed titles and native IDs containing URLs.
- Do not merge candidates by generic title alone.

- [ ] **Step 1: Add failing tests** for valid/invalid identities and all grouping rules, including ML sellers with similar titles and Shopee sellers sharing an item title.
- [ ] **Step 2: Run the targeted test** and verify expected failures.
- [ ] **Step 3: Implement the pure grouping/validation functions** using no I/O.
- [ ] **Step 4: Re-run targeted tests** and confirm they pass.
- [ ] **Step 5: Commit** with `feat(quality): add native identity and grouping rules`.

### Task 3: Implement discount confidence and explainable scoring

**Files:**
- Create: `src/core/offer-quality/scoring.ts`
- Test: `src/tests/core/offer-quality/scoring.test.ts`

**Interfaces:**
- `calculateDiscount(candidate): DiscountResult`
- `scoreCandidate(candidate, context): ScoreBreakdown`
- `compareCandidates(a, b): number`

**Rules:**
- Calculate mathematical discount only when `originalPrice > currentPrice > 0`.
- Mark confidence `unverified` without price history/evidence; never call it a real discount.
- Use versioned weights: price/freight 25, verified discount 20, seller trust 15, sales/ratings/availability 15, logistics 10, desire/utility 15.
- Apply hard blockers before ranking: invalid identity, image, title, price or missing mandatory monetization.
- Resolve ties deterministically by confidence, final price, seller signals and stable native identity.

- [ ] **Step 1: Write failing tests** for no discount, verified discount, unverified old price, blockers, ranking and deterministic ties.
- [ ] **Step 2: Run the targeted test** and verify failure.
- [ ] **Step 3: Implement pure scoring functions** and expose the weight version in the breakdown.
- [ ] **Step 4: Re-run tests** and verify all pass.
- [ ] **Step 5: Commit** with `feat(quality): add explainable offer scoring`.

### Task 4: Implement the common evaluator and report model

**Files:**
- Create: `src/core/offer-quality/common-evaluator.ts`
- Create: `src/core/offer-quality/report.ts`
- Test: `src/tests/core/offer-quality/common-evaluator.test.ts`
- Test: `src/tests/core/offer-quality/report.test.ts`

**Interfaces:**
- `evaluateCandidates(candidates, options): OfferQualityReport`
- `serializeReport(report): string`
- `serializeNdjson(report): string`

**Rules:**
- Validate every candidate, group valid candidates, rank each group and mark exactly one winner when eligible.
- Mark other group members `duplicate` with the winner identity.
- Mark invalid candidates `rejected` or `missing_data` with typed reasons.
- Validate the four channels without modifying data: Telegram `tg_`, WhatsApp `wp_`, Facebook `fb_`, Instagram `ig_`, each with a complete UUID.
- Report current-flow status alongside proposed decision.
- Set `persistAttemptCount=0` and reject any injected persistence callback.

- [ ] **Step 1: Write failing integration-style tests** using deterministic candidates from all three marketplaces.
- [ ] **Step 2: Run targeted tests** and verify failure.
- [ ] **Step 3: Implement the evaluator by composing Tasks 1–3**, with no network or database imports.
- [ ] **Step 4: Implement deterministic JSON and one-record-per-line NDJSON serialization** with sanitized URLs.
- [ ] **Step 5: Re-run targeted tests** and verify all pass.
- [ ] **Step 6: Commit** with `feat(quality): add read-only common evaluator and reports`.

### Task 5: Add the dry-run CLI and feature flag

**Files:**
- Create: `scripts/offer-quality-dry-run.cjs`
- Create: `src/tests/core/offer-quality/dry-run-script.test.ts`
- Modify: `.env.example` only if the variable is not already documented.

**Interfaces:**
- CLI command: `node scripts/offer-quality-dry-run.cjs --input <fixture-or-export> --output <directory>`
- Environment flag: `OFFER_QUALITY_PIPELINE_V2=false`

**Rules:**
- Input must be an explicit local JSON/NDJSON file; no implicit scraping and no implicit Supabase client.
- Output must be written only under the requested report directory.
- Exit non-zero for missing input, malformed records or attempted persistence.
- Print totals, winners, rejection counts and `persist_attempts=0`.
- Sanitize tokens and query parameters before writing reports.

- [ ] **Step 1: Write failing script tests** for valid fixture execution, malformed input, missing file and persistence guard.
- [ ] **Step 2: Run the targeted tests** and verify failure.
- [ ] **Step 3: Implement the CLI as a thin CommonJS adapter around the pure evaluator**.
- [ ] **Step 4: Re-run targeted tests** and verify all pass.
- [ ] **Step 5: Add a small deterministic fixture under `src/tests/fixtures/offer-quality/`** covering all marketplaces.
- [ ] **Step 6: Run the CLI against the fixture and confirm reports contain zero persistence attempts.**
- [ ] **Step 7: Commit** with `feat(quality): add feature-flagged offer quality dry-run`.

### Task 6: Document operation and verification

**Files:**
- Create or update: `docs/offer-quality-dry-run.md`
- Update: `docs/architecture-current.md` only with the inactive, read-only capability.
- Test: existing targeted suites plus project verification commands.

**Documentation must state:**
- the flag is false by default;
- the current Oracle path is unchanged;
- how to run a fixture dry-run;
- report fields and interpretation;
- no-write guarantee;
- criteria for future activation;
- rollback procedure.

- [ ] **Step 1: Write documentation tests/checks** that verify the flag, command and no-write language are present.
- [ ] **Step 2: Run the checks and confirm failure before documentation is added.**
- [ ] **Step 3: Add the documentation.**
- [ ] **Step 4: Run targeted quality tests, `npm run typecheck`, `npm run build` and `git diff --check`.**
- [ ] **Step 5: Review the complete diff and verify no production runtime path changed.**
- [ ] **Step 6: Commit** with `docs(quality): document read-only dry-run operation`.

### Task 7: Produce evidence for approval

**Files:**
- Create: `reports/offer-quality/README.md` only if the repository already tracks report instructions; generated reports remain untracked or ignored.

**Procedure:**
- Run the dry-run against the agreed deterministic export, not a new scrape.
- Produce JSON and NDJSON reports.
- Compare proposed winners with current-flow selections.
- Record counts by marketplace, rejection reasons, grouping collisions, discount confidence and monetization completeness.
- Confirm zero Supabase writes, zero Oracle changes, zero PM2 restarts and zero publication calls.

- [ ] **Step 1: Execute exactly one approved dry-run evidence run.**
- [ ] **Step 2: Review the report manually for false grouping and false rejection.**
- [ ] **Step 3: Publish the branch for PR review without enabling the flag.**
- [ ] **Step 4: Request approval before any future integration work.**

## Verification Gate

Before claiming the first delivery complete, run fresh:

```text
npm test -- src/tests/core/offer-quality
npm run typecheck
npm run build
git diff --check
```

The delivery is not complete if any command fails, if any report has a persistence attempt, or if the feature flag is enabled.
