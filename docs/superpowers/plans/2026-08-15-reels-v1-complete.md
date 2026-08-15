# Reels V1 Complete Implementation Plan

**Goal:** Transform a `scenes_ready` auto Reel into a factual dubbed MP4 ready for review.

**Architecture:** Add one small domain pipeline for factual Dubbing V2 payloads, ordered scene render manifests, terminal guards, and regeneration metadata. Extend the existing video worker/API contract for `auto-reel-v1`; reuse current Supabase storage and `/reels` polling/UI.

**Tech Stack:** Next.js route handlers, TypeScript domain helpers, existing Dubbing V2/Edge TTS scripts, Python worker, Supabase `video_jobs` storage.

## Global Constraints

- Do not write to `main`, deploy, rollout Oracle, restart PM2, or create production migrations.
- Dubbing payload may use only the persisted factual snapshot and the four persisted visual scenes.
- Keep `authorized-reel-v1` unchanged and preserve previous attempts on regeneration.

### Task 1: RED contracts

**Files:** Create focused auto Reel completion tests; preserve authorized-reel tests.

- [ ] Add tests for scenes-ready transition, factual dubbing payload, ordered four-scene render manifest, failure-to-failed, persistence fields, review guards, and regeneration preservation.
- [ ] Run the focused tests and confirm they fail because the completion contract is absent.

### Task 2: Minimal domain and API

**Files:** Add the smallest domain helpers and route handlers needed for completion, approve, reject, and regenerate.

- [ ] Build payloads only from persisted metadata.
- [ ] Persist audio/video URLs, duration, and metadata without changing the schema.
- [ ] Enforce state guards and preserve prior attempts.

### Task 3: Existing worker integration and UI

**Files:** Extend the existing worker dispatch/render path and `/reels` client.

- [ ] Process `auto-reel-v1` using the four scene URLs and Dubbing audio contract.
- [ ] Reuse storage upload and polling; show preview and review/regenerate actions.

### Task 4: Verification and delivery

- [ ] Run focused, auto-reel, authorized-reel, lint, build, and typecheck comparison.
- [ ] Review diff, commit only scoped files, push branch, and open a Draft PR without merge/deploy.
