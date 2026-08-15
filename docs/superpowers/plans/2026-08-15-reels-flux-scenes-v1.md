# Reels Flux Scenes V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Execute inline; no delegation.

**Goal:** Generate and persist four vertical FLUX 2 Klein scene assets for an existing auto-reel job.

**Architecture:** Add one focused visual-scenes domain module with scene planning, multipart Cloudflare boundary, validation, persistence orchestration, and terminal failure handling. Extend the existing auto-reel job API/UI only as needed to expose `planning`, `generating_visual`, `scenes_ready`, and `failed`; keep authorized reels untouched.

**Tech Stack:** Next.js route handlers, TypeScript, Supabase Storage/`video_jobs`, Vitest.

## Global Constraints

- Use only `@cf/black-forest-labs/flux-2-klein-4b`.
- Send the source image as multipart `input_image_0`; never expose credentials.
- Generate exactly four 768x1024 scenes with seeds 101–104 and no `steps` field.
- No migration, Oracle, FFmpeg, Dubbing V2, deploy, commit, push, PR, or merge.

### Task 1: Contract tests

**Files:** Create `src/tests/videos/auto-reel-scenes.test.ts`.

- [ ] Add tests for four scene plans, factual-only prompts, fidelity rules, multipart/model contract, persistence, invalid responses, failure state, `scenes_ready`, and regenerate preservation.
- [ ] Run the focused test and confirm RED because the scene module is absent.

### Task 2: Minimal scene pipeline

**Files:** Create `src/lib/videos/auto-reel-scenes.ts`.

- [ ] Implement the four fixed scene definitions and prompt builder.
- [ ] Implement the multipart FLUX client without `steps`.
- [ ] Implement output validation, persistence callback, and failure/success status results.

### Task 3: Integration and verification

**Files:** Modify only the existing auto-reel route/client if tests demonstrate the need.

- [ ] Wire scene processing without changing authorized-reel behavior.
- [ ] Run focused, legacy, auto-reel, lint, typecheck, and build; compare global failures with `origin/main`.
