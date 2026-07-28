# Express Extraction Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Publicação Expressa consume one typed marketplace-extraction result, preserve known product identity through Mercado Livre anti-bot redirects, and report source failures accurately.

**Architecture:** Add a pure extraction-resolution contract that translates URL-resolution outcomes into confirmed, recoverable-failure, or rejected states. Keep existing marketplace adapters as data providers, but make the Express action consume the contract rather than interpret provider and redirect failures inline. Persist only after product validation; leave the PMAV5 ingestion-service migration as a separately deployable follow-up because no ingestion service exists in the current runtime.

**Tech Stack:** Next.js server actions, TypeScript, Vitest, Supabase.

## Global Constraints

- Keep SSRF, redirect-limit, item-mismatch and non-product rejections closed.
- `ANTI_BOT_REDIRECT_WITH_ORIGINAL_ID` is recoverable only when a normalized source item ID exists.
- Never label Mercado Livre anti-bot or API authorization failure as `REDIRECT_LOOP` or `PRODUCT_NAME_MISSING`.
- Preserve supplied affiliate URL; canonical URL is extraction evidence only.
- Do not change database schema or production credentials in this change.

---

### Task 1: Typed URL-resolution outcome

**Files:**
- Create: `src/lib/publish/product-extraction-contract.ts`
- Test: `src/tests/lib/product-extraction-contract.test.ts`

**Interfaces:**
- Consumes: `UrlResolveResult` from `src/lib/publish/express-url-resolver.ts`.
- Produces: `classifyResolution(result): ProductResolutionOutcome`.

- [ ] **Step 1: Write failing tests**

```ts
expect(classifyResolution({
  resolvedUrl: "https://www.mercadolivre.com.br/gz/account-verification",
  redirectChain: ["https://www.mercadolivre.com.br/p/MLB70426632?pdp_filters=item_id%3AMLB6861361746"],
  marketplace: "Mercado Livre",
  selectedItemId: "MLB6861361746",
  errorCode: "ANTI_BOT_REDIRECT_WITH_ORIGINAL_ID",
})).toMatchObject({ status: "confirmed_identity", itemId: "MLB6861361746" });

expect(classifyResolution({ resolvedUrl: "https://meli.la/x", redirectChain: [], errorCode: "REDIRECT_LOOP" }))
  .toMatchObject({ status: "rejected", code: "REDIRECT_LOOP" });
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- --run src/tests/lib/product-extraction-contract.test.ts`

Expected: FAIL because `product-extraction-contract` does not exist.

- [ ] **Step 3: Implement minimal classifier**

```ts
export type ProductResolutionOutcome =
  | { status: "confirmed_identity"; itemId: string; resolvedUrl: string }
  | { status: "ready"; resolvedUrl: string }
  | { status: "rejected"; code: string };

export function classifyResolution(result: UrlResolveResult): ProductResolutionOutcome {
  if (result.errorCode === "ANTI_BOT_REDIRECT_WITH_ORIGINAL_ID" && result.selectedItemId) {
    return { status: "confirmed_identity", itemId: result.selectedItemId, resolvedUrl: result.resolvedUrl };
  }
  if (result.errorCode) return { status: "rejected", code: result.errorCode };
  return { status: "ready", resolvedUrl: result.resolvedUrl };
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npm test -- --run src/tests/lib/product-extraction-contract.test.ts`

Expected: PASS.

### Task 2: Mercado Livre source-failure mapping

**Files:**
- Modify: `src/lib/publish/actions.ts`
- Modify: `src/lib/platforms/mercadolivre.ts`
- Test: `src/tests/lib/express-marketplace-native.test.ts`

**Interfaces:**
- Consumes: `ProductResolutionOutcome` and `fetchMLProductDetailsResult`.
- Produces: `MARKETPLACE_AUTH_DENIED` or `MARKETPLACE_SOURCE_UNAVAILABLE` without attempting product validation.

- [ ] **Step 1: Write failing action-level tests**

```ts
expect(classifyMLApiFailure(403)).toBe("MARKETPLACE_AUTH_DENIED");
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- --run src/tests/lib/express-marketplace-native.test.ts`

Expected: FAIL because `classifyMLApiFailure` is not exported.

- [ ] **Step 3: Implement typed provider failure**

Add `classifyMLApiFailure(status)` and `fetchMLProductDetailsResult(url, userId)`. The new function returns `{ ok: true, data: LinkMetadata }` or `{ ok: false, code }`; the existing `fetchMLProductDetails` remains a compatibility wrapper returning `LinkMetadata | null`. Update `generateQuickPostAction` to stop with the mapped status before generic product validation.

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- --run src/tests/lib/express-marketplace-native.test.ts src/tests/lib/express-url-resolver.test.ts`

Expected: PASS.

### Task 3: Integrate typed resolution in Publicação Expressa

**Files:**
- Modify: `src/lib/publish/actions.ts`
- Test: `src/tests/lib/express-url-resolver.test.ts`

**Interfaces:**
- Consumes: `classifyResolution`.
- Produces: stable error mapping for Mercado Livre URL handling.

- [ ] **Step 1: Write failing regression test**

```ts
expect(classifyResolution(antiBotResult)).toMatchObject({
  status: "confirmed_identity",
  itemId: "MLB6861361746",
});
```

- [ ] **Step 2: Run targeted tests and verify intended failure**

Run: `npm test -- --run src/tests/lib/product-extraction-contract.test.ts src/tests/lib/express-url-resolver.test.ts`

Expected: PASS only after Task 1; then use the action test from Task 2 as RED for action integration.

- [ ] **Step 3: Replace inline anti-bot branching**

Use `classifyResolution` in Mercado Livre flow. `confirmed_identity` must use its `itemId` for official lookup. `rejected` must retain existing safe error mapping. No direct redirect-loop message for anti-bot outcomes.

- [ ] **Step 4: Run contract suite**

Run: `npm test -- --run src/tests/lib/product-extraction-contract.test.ts src/tests/lib/express-url-resolver.test.ts src/tests/lib/express-marketplace-native.test.ts src/tests/lib/express-affiliate.test.ts`

Expected: PASS.

### Task 4: Build and document next boundary

**Files:**
- Modify: `docs/PMAV5/CONTRATOS/CONTRATO_INGESTION.md`

- [ ] **Step 1: Document Express as a future authenticated capture producer**

Add a short note: Publicação Expressa must send a fully normalized capture to ingestion; it must not own direct persistence or copy generation in the long-term architecture.

- [ ] **Step 2: Run build**

Run: `npm run build`

Expected: exit code 0.

- [ ] **Step 3: Commit verified implementation**

Run:

```bash
git add src/lib/publish/product-extraction-contract.ts src/lib/publish/actions.ts src/lib/platforms/mercadolivre.ts src/tests/lib/product-extraction-contract.test.ts src/tests/lib/express-marketplace-native.test.ts docs/PMAV5/CONTRATOS/CONTRATO_INGESTION.md
git commit -m "fix(express): unify marketplace extraction outcomes"
```
