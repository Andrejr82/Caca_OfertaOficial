# Imported Video Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add authorized Shopee Video import, processing, review, monetized Instagram/Facebook drafts, and separate publication to the existing `/videos` workflow.

**Architecture:** Extend existing `/videos`, `video_jobs`, Storage, copy engine, approval, and publication contracts. Add isolated source-resolution and imported-media worker modules; preserve `motion-v1`.

**Tech Stack:** Next.js 16, TypeScript, Supabase, Supabase Storage, Python worker, FFprobe, FFmpeg, Vitest, React.

## Global Constraints

- Accept only HTTPS sources and controlled allowlisted redirects.
- Support only Instagram and Facebook in this workflow.
- Require an existing user-owned offer and explicit rights confirmation.
- Do not process heavy media inside a Vercel request.
- Do not expose secrets, cookies, auth headers, or original source URLs in drafts or logs.
- Reuse the deterministic official copy engine.
- Do not alter `motion-v1`, Telegram, WhatsApp, Oracle, discovery, ranking, monetization, cron, PM2, or production deployment.
- Do not execute migrations in production or real import/publication tests.

---

### Task 1: Baseline and architecture contracts

**Files:**
- Create: `docs/superpowers/specs/2026-07-31-imported-video-studio-design.md`
- Create: `docs/superpowers/plans/2026-07-31-imported-video-studio.md`
- Test: existing relevant Vitest suites

- [ ] Record current dirty files and exclude them from all commits.
- [ ] Run relevant existing video, copy, Instagram, Facebook, and security tests.
- [ ] Confirm exact existing route contracts and worker callback routes.
- [ ] Commit only the design and plan documents.

### Task 2: Source URL policy and resolver

**Files:**
- Create: `src/lib/videos/import/source-policy.ts`
- Create: `src/lib/videos/import/source-resolver.ts`
- Test: `src/tests/videos/import-source-policy.test.ts`
- Test: `src/tests/videos/import-source-resolver.test.ts`

- [ ] Write failing tests for HTTPS, credentials, private IPs, unsupported protocols, ports, allowlisted Shopee redirects, unsafe redirects, redirect limits, HTML video discovery, MIME validation, size limits, and MP4 signature validation.
- [ ] Run the focused tests and confirm failures are caused by missing behavior.
- [ ] Implement dependency-injected URL validation, DNS/IP checks, redirect tracing, HTML media extraction, and bounded range probing.
- [ ] Add a fixture for the observed `br.shp.ee` chain ending in an official CDN `.mp4`; do not use a live download in unit tests.
- [ ] Run focused tests and the security suite.
- [ ] Commit source policy and resolver.

### Task 3: Import job contract and API

**Files:**
- Create: `src/lib/videos/import/import-job.ts`
- Create: `src/app/api/videos/import/route.ts`
- Modify: `src/app/api/videos/jobs/route.ts`
- Test: `src/tests/videos/import-api.test.ts`

- [ ] Write failing tests for unauthenticated users, missing offers, other-user offers, missing rights confirmation, invalid channels, duplicate normalized URLs, queue limit, and successful job creation.
- [ ] Run tests and confirm expected RED failures.
- [ ] Implement `POST /api/videos/import` with payload `{ offerId, sourceUrl, channels, rightsConfirmed }`.
- [ ] Validate channel set exactly as `instagram | facebook` and store rights evidence in namespaced metadata.
- [ ] Use the existing enqueue function or a minimal migration only if the current function cannot safely carry import metadata.
- [ ] Run focused tests and commit.

### Task 4: Imported worker pipeline

**Files:**
- Create: `scripts/imported_video_worker.py`
- Create: `scripts/imported_video_media.py`
- Modify: `src/app/api/videos/worker/next/route.ts`
- Modify: existing worker callback routes under `src/app/api/videos/worker/[id]/`
- Test: `src/tests/videos/imported-worker-contract.test.ts`
- Test: `scripts/tests/test_imported_video_worker.py`

- [ ] Write failing tests for claim, stage transitions, cancellation, retry, timeout, download cap, corrupt media, valid MP4, H.264/AAC, vertical input, horizontal adaptation, low resolution, original and processed fingerprints, Storage success, and Storage failure.
- [ ] Run tests to verify RED.
- [ ] Implement a separate `imported-video-v1` branch in the existing worker contract.
- [ ] Use FFprobe for duration, dimensions, ratio, codecs, FPS, bitrate, audio, size, MIME, rotation, and streams.
- [ ] Use FFmpeg for H.264/AAC MP4, `yuv420p`, `faststart`, safe vertical adaptation, and bounded output.
- [ ] Keep `motion-v1` code path unchanged.
- [ ] Run Python and TypeScript focused tests.
- [ ] Commit worker pipeline.

### Task 5: Assets and Storage metadata

**Files:**
- Create: `src/lib/videos/import/assets.ts`
- Modify: Storage upload contract used by the worker
- Test: `src/tests/videos/import-assets.test.ts`
- Test: `src/tests/videos/import-storage.test.ts`

- [ ] Write failing tests for Instagram cover, Facebook cover, thumbnail, reference frame, deterministic candidate selection, black/blurred frame rejection, fingerprints, upload paths, and upload failure.
- [ ] Run tests to verify RED.
- [ ] Implement deterministic frame selection and independent channel asset paths under `videos/{user_id}/{offer_id}/{job_id}/`.
- [ ] Store only required public/signed URLs and technical metadata.
- [ ] Reuse the existing `videos` bucket when its policy supports the files; create no production bucket during this work.
- [ ] Run focused tests and commit.

### Task 6: Draft generation and review state

**Files:**
- Create: `src/lib/videos/import/drafts.ts`
- Modify: `src/app/(dashboard)/videos/page.tsx`
- Modify: `src/app/(dashboard)/videos/VideosClient.tsx`
- Modify: existing approval routes only where required
- Test: `src/tests/videos/import-drafts.test.ts`
- Test: `src/tests/videos/videos-client.test.tsx`

- [ ] Write failing tests for channel-specific links, `NO_MONETIZED_LINK`, source URL exclusion, placeholders, approval, rejection, and independent channel state.
- [ ] Run tests to verify RED.
- [ ] Implement draft creation through the official deterministic copy engine using only selected-offer data.
- [ ] Add URL field, offer search, marketplace display, channel checkboxes, rights confirmation, queue stages, player, covers, assets, copy editors, technical details, approval, rejection, and separate publish buttons.
- [ ] Preserve existing video generation controls needed by `motion-v1`.
- [ ] Run focused tests and commit.

### Task 7: Instagram and Facebook publication integration

**Files:**
- Modify: `src/app/api/instagram/publish/route.ts`
- Modify: `src/app/api/facebook/publish/route.ts`
- Modify: existing publication transport only after contract audit
- Test: `src/tests/videos/import-instagram-publication.test.ts`
- Test: `src/tests/videos/import-facebook-publication.test.ts`

- [ ] Write failing tests for approved-only publication, missing draft, HTTPS media, metadata validation, duplicate fingerprint, receipt persistence, Meta error, and idempotent replay for both channels.
- [ ] Run tests to verify RED.
- [ ] Reuse Instagram Reel publication and safety contracts.
- [ ] Audit Facebook transport, token, Page ID, permissions, endpoint, async processing, polling, and receipt behavior.
- [ ] Implement Facebook video publication only when the audited transport contract is available; otherwise return a verifiable configuration error and keep all Meta calls mocked.
- [ ] Run focused publication tests and commit.

### Task 8: Regression, documentation, and final verification

**Files:**
- Create: `docs/imported-video-studio.md`
- Modify: no unrelated files
- Test: existing `motion-v1`, Telegram, WhatsApp, security, copy, and publication suites

- [ ] Write failing regression tests proving `motion-v1`, Telegram, WhatsApp, no external AI, and no secret logging remain unchanged.
- [ ] Run tests to verify RED, then implement only required test fixtures or guards.
- [ ] Document flow, states, configuration, Storage, worker, security, rights, Instagram, Facebook, tests, rollback, and limitations.
- [ ] Run unit tests, related integration tests, copy tests, worker tests, Instagram tests, Facebook tests, typecheck, lint, and build.
- [ ] Inspect `git diff`, verify only scoped files are included, and confirm production database, Storage, import, publication, deploy, and merge were not used.
- [ ] Create final logical commits and push only `feat/imported-video-studio` after verification.
