# WhatsApp Top 30 Fresh Daily Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restrict the WhatsApp Top 30 preparation to offers extracted today in BRT, with a 24-hour fallback, while hiding/rejecting stale or already-used WhatsApp records.

**Architecture:** Keep the existing curadoria/router/draft pipeline and replace its broad time-window repository reads with a today-BRT read followed by a 24-hour fallback. Read all WhatsApp posts once, classify protected/seen/today-draft rows, and select only fresh candidates. The existing panel layout remains unchanged; its server query will expose only valid current-day drafts.

**Tech Stack:** Next.js server action, TypeScript, Supabase query adapter, Vitest, existing commercial curation/router modules.

## Global Constraints

- WhatsApp only; Telegram, Vídeos/Reels, Oracle, PM2, cron, scraping, bots and publishers are out of scope.
- No layout restructuring and no automatic publication or sending.
- Primary window is today 00:00 BRT; fallback is the last 24 hours only.
- Preserve `posted -> approved` protection and `OFFER_ALREADY_POSTED` behavior.
- Do not delete historical posts or publish data.

---

### Task 1: Replace broad freshness and post-read contracts

**Files:**
- Modify: `src/lib/offers/prepare-top30-whatsapp-legacy-drafts.ts`
- Modify: `src/app/(dashboard)/whatsapp/page.tsx`

- [ ] Add a deterministic BRT day-start helper using `America/Sao_Paulo` date parts.
- [ ] Replace 48h/72h reads with today-BRT and 24h fallback reads bounded by `now`.
- [ ] Read all WhatsApp posts and classify protected statuses/metadata, today-seen rows, today drafts and stale drafts.
- [ ] Prefer the most recent non-empty `explainability.correlation_id` group from today; fill remaining Top 30 slots from other today candidates before the 24h fallback.
- [ ] Filter offer status `posted`, post status `posted/published/approved`, `posted_at`, `external_id`, old drafts and today-seen non-reusable rows.
- [ ] Keep only same-day drafts eligible for reuse; preserve affiliate-link validation and draft insertion.
- [ ] Restrict the existing WhatsApp panel query to current-day valid drafts without changing its visual structure.

### Task 2: Add failing freshness and regression tests

**Files:**
- Modify: `src/tests/top30-whatsapp-legacy-drafts.test.ts`

- [ ] Cover today-BRT as the primary window and reject an offer from the previous day by default.
- [ ] Cover 24h fallback and assert no `48h`/`72h` reads.
- [ ] Cover same-day draft reuse and stale-draft non-reuse.
- [ ] Cover today-seen duplicate, offer `posted`, post `posted`, post `published`, post `approved`, `posted_at` and `external_id` protections.
- [ ] Cover latest correlation cycle prioritization and preserve no Telegram path.

### Task 3: Update action result and report

**Files:**
- Modify: `src/app/(dashboard)/whatsapp/actions.ts`
- Modify: `src/components/whatsapp/whatsapp-top30-action.tsx`
- Create: `docs/WHATSAPP_TOP30_FRESH_DAILY_FIX_REPORT.md`

- [ ] Return `today_brt`, `latest_cycle_today` or `24h_fallback` plus explicit skip counters while preserving compatibility aliases.
- [ ] Update only the existing result text, with no layout changes.
- [ ] Document cause, BRT calculation, cycle evidence, stale draft IDs observed by tests/runtime, validation and deployment status.

### Task 4: Validate and deliver

- [ ] Run all requested Vitest commands.
- [ ] Run `npm run build` and `git diff --check`.
- [ ] Verify no Telegram/Vídeos/Oracle/layout files changed.
- [ ] Commit only scoped files, push `main`, and check Vercel availability.
