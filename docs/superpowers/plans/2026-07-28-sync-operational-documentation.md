# Documentation Synchronization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reconcile the canonical project documentation with the current runtime and recent production changes without modifying application code or historical PMAV5 evidence.

**Architecture:** Update the operational summaries (`README.md`, `docs/architecture-current.md`, `CHANGELOG.md`, `.env.example`) and add a current release-status note. Preserve PMAV5 snapshots as immutable historical evidence, while adding a clear pointer from the current documentation to the historical boundary.

**Tech Stack:** Markdown, Mermaid, environment-variable reference inventory, Git.

## Global Constraints

- No runtime source, Supabase schema, Oracle files, Vercel configuration, credentials, or secrets may be changed.
- Do not edit historical PMAV5 certification/evidence files.
- `.env.example` may contain names and safe defaults only; never values from `.env.local`.
- Verify links, environment-key coverage, whitespace, and the final diff before claiming completion.

### Task 1: Update canonical operational architecture

**Files:**
- Modify: `docs/architecture-current.md`
- Modify: `README.md`

- [ ] Update the architecture date and runtime description to mention the current Express ingestion/monetization path, channel-specific tracking links, social-image normalization, and the current Discovery schedule exactly as implemented.
- [ ] Keep the explicit limitation that Shein, Magalu, and Netshoes are not part of the current Oracle Discovery-Only cycle.
- [ ] Add a clear distinction between current operational documentation and immutable PMAV5 historical snapshots.

### Task 2: Synchronize release history

**Files:**
- Modify: `CHANGELOG.md`

- [ ] Add a dated 2026-07-28 section for the recent production changes: discovery monetization filtering/link verification, channel-link persistence and UUID integrity, copy-channel isolation/duplicate prevention, commercial formatting, social-image normalization, and Express marketplace extraction/redirect corrections.
- [ ] Preserve all existing historical entries.

### Task 3: Complete the safe environment inventory

**Files:**
- Modify: `.env.example`

- [ ] Add runtime-referenced variables grouped by public app, AI, marketplace, discovery limits, Oracle operation, publication/social integrations, observability, and media storage.
- [ ] Document optional/internal variables as blank or safe defaults.
- [ ] Keep secrets blank and explicitly mark server-side-only values.
- [ ] Document canonical `FACEBOOK_ACCESS_TOKEN` and note any compatibility alias without replacing the runtime name.

### Task 4: Add current release status and validate

**Files:**
- Create: `docs/RELEASE_STATUS_2026-07-28.md`
- Modify: `docs/official.md`

- [ ] Record the current source-of-truth rule, latest main SHA as a value to verify at release time, current marketplace/cycle boundaries, and the PMAV5 historical boundary.
- [ ] Link the release-status document from the official index.
- [ ] Verify all relative documentation links, compare runtime environment references with `.env.example`, run `git diff --check`, and inspect the final diff.
