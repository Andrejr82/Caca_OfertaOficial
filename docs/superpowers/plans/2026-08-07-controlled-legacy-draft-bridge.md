# Controlled Legacy Draft Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate the Curadoria Comercial → ranked candidate → affiliate link → legacy draft → approval-panel bridge with at most one WhatsApp and one Telegram draft, without publishing or invoking bot APIs.

**Architecture:** Add a standalone, dependency-injected operational bridge that reads eligible Shopee/Mercado Livre offers, ranks and routes them through the existing curation modules, and persists only `affiliate_links` plus `posts(status=draft)` when explicitly run with `--execute`. The bridge will use `offer_id + channel` checks and database uniqueness as idempotency boundaries, and will emit machine-readable evidence consumed by the report.

**Tech Stack:** TypeScript via `tsx`, Supabase JS service client, existing commercial curation/router/tracking modules, Vitest, Next.js panel queries.

## Global Constraints

- Create no more than 1 WhatsApp draft and 1 Telegram draft.
- Do not touch Vídeos, publish, send, call Telegram Bot API, call WhatsApp bot, or alter layout.
- Dry-run must be read-only and must show offer_id, title, marketplace, price, score, channel, image, affiliate-link status, and existing-draft status.
- Reuse existing affiliate links and drafts; idempotency is `offer_id + channel`.
- Telegram is allowed only as a draft and must not be consumed automatically.

---

### Task 1: Add the controlled bridge runtime

**Files:**
- Create: `scripts/controlled-legacy-draft-bridge.ts`
- Modify: `package.json`

**Interfaces:**
- Produces `runControlledBridge(client, { dryRun, limits })` with dry-run/execution results and no publisher imports.
- CLI accepts exactly one of `--dry-run` and `--execute`, with fixed per-channel limit `1`.

- [ ] **Step 1: Implement read-only candidate selection and reporting.**
- [ ] **Step 2: Implement idempotent affiliate-link reuse/create and legacy draft insertion.**
- [ ] **Step 3: Add final-state checks for draft visibility, image, copy, affiliate URL, draft status, and zero publication fields.**
- [ ] **Step 4: Expose an npm script for the controlled dry-run/execute commands without changing UI routes.**

### Task 2: Cover bridge safety contracts

**Files:**
- Create: `src/tests/controlled-legacy-draft-bridge.test.ts`

**Interfaces:**
- Tests use an in-memory fake repository/client; no network or Supabase write is required.

- [ ] **Step 1: Test dry-run performs no writes and selects at most one candidate per channel.**
- [ ] **Step 2: Test existing draft/link reuse and no duplicate insert.**
- [ ] **Step 3: Test execution creates only draft posts with image/copy/affiliate URL and never invokes publisher APIs.**
- [ ] **Step 4: Test Telegram is draft-only and the hard limits cannot be overridden.**

### Task 3: Run the controlled production check and document evidence

**Files:**
- Create: `docs/CONTROLLED_LEGACY_DRAFT_BRIDGE_TEST_REPORT.md`

- [ ] **Step 1: Run the dry-run command and capture the two selected candidates and existing state.**
- [ ] **Step 2: Run execute mode once, limited to one draft per channel.**
- [ ] **Step 3: Query the same panel source used by `/whatsapp` and `/telegram` and verify both drafts, image, copy, affiliate link, and `status=draft`.**
- [ ] **Step 4: Run the requested build/tests/diff check.**
- [ ] **Step 5: Write the report with recommendation to release Top 30 only if every criterion passes.**
