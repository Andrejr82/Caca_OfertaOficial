# Shopee Novel Curation Design

## Objective

Improve the commercial quality and novelty of Shopee products that reach the
panel without increasing the current OpenAPI request volume. Every cycle must
prefer genuinely new, complete products from distinct editorial families and
must never count an old or rejected offer as a new delivery.

## Evidence behind the change

Between 2026-08-30 08:30 and 2026-08-31 18:22 (America/Sao_Paulo), Shopee
cycles extracted 240 products and sent 23 candidates to persistence, but only
one offer was new. The remaining outcomes were mostly updates to existing
identities. The current flow selects at most three products before applying
historical novelty, uses a seven-day cooldown, and allows the same deterministic
leaders to return after that period.

## Considered approaches

### A. Increase the API pool to 100 per niche

Rejected. It raises requests, latency, timeout exposure, and rate-limit risk,
while the database evidence shows that the existing extraction volume is
already sufficient.

### B. Apply novelty before final ranking and backfill from the existing pool

Selected. Keep the current API calls, retain the qualified candidates already
collected, remove historical identities, then rank and select the final set.
This fixes the ordering defect at the source without increasing API cost.

### C. Randomly rotate products

Rejected. Randomness reduces repetition but can replace commercially strong
products with weaker ones and makes results difficult to audit.

## Selected architecture

### 1. Candidate pool

The Shopee engine will preserve the qualified candidates produced by the
current FULL, DELTA, exact-item enrichment, and controlled category fallback.
It will not make extra requests. The pool may contain multiple candidates from
the same family so that an old family leader does not hide a new alternative.

### 2. Permanent historical exclusion

Before final ranking, the worker will load Shopee identities from the existing
`offers` table without a created-at cutoff. Identities already present as
`approved`, `selected`, `posted`, or `rejected` will not compete for a new panel
slot. Existing offers may be refreshed by a separate maintenance path, but an
update will not be counted as a new discovery.

No database migration is required. Existing identity and status columns are
sufficient.

### 3. Final commercial selection

After historical exclusion, candidates will be ordered by the existing
commercial evidence: product validity, sales, rating, commission, price
integrity, image/link quality, and deterministic score. Accessory and component
blockers remain mandatory.

The final selector will:

- keep one representative per commercial family;
- select between three and five products when enough valid families exist;
- backfill rejected, duplicate, or historical positions with the next valid
  candidate;
- return fewer products rather than weaken a safety or quality gate.

### 4. Persistence accounting

Only offers confirmed as visible `approved` rows will count as delivered.
Previously rejected rows remain rejected and are reported as historical
exclusions, not successful persistence. Inserted, updated, ignored, and visible
approved totals remain separate.

### 5. Editorial schedule

The system will preserve one niche per scheduled cycle to avoid multiplying API
cost. The disabled Informática slots will be reassigned to active niches with
lower recent coverage. Informática remains excluded from Shopee discovery.

## Data flow

1. Collect through the current official Shopee sources.
2. Apply semantic, accessory, technical, and commercial gates.
3. Expose the complete qualified in-memory pool without extra API calls.
4. Remove every identity already recorded in `offers`.
5. Rank remaining candidates by commercial evidence.
6. Deduplicate by commercial family and select three to five products.
7. Persist and verify the final database status.
8. Record funnel counters for historical exclusion, family duplication,
   commercial rejection, insertion, update, and visible approval.

## Failure behavior

- Source failure remains fail-closed.
- A niche with fewer than three valid new families returns the available valid
  products; it is not padded with accessories or repeated products.
- A rejected historical identity is never reactivated automatically.
- Persistence status divergence marks the cycle partial and excludes the row
  from the delivered count.

## Acceptance criteria

- No additional Shopee OpenAPI request is introduced by this change.
- Approved, posted, selected, and rejected identities are excluded regardless
  of age.
- A historical top candidate is replaced by the next new valid candidate.
- Final selections contain distinct commercial families.
- Accessories and equivalent variants remain blocked.
- Each active niche returns three to five new products when sufficient valid
  families exist.
- A cycle never reports a rejected or non-visible row as delivered.
- Informática no longer consumes a Shopee discovery slot.
- Focused tests, TypeScript, lint, production build, and a controlled database
  validation pass before deployment.

## Out of scope

- Increasing the API pool to 100 products per niche.
- Automatic social publication.
- Weakening sales, rating, commission, identity, image, link, or accessory
  gates.
- Introducing a new database table or architecture.
