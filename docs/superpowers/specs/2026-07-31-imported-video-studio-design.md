# Authorized Imported Video Studio Design

## Goal

Allow an authenticated user to select an existing offer, paste an authorized Shopee Video link, process the source asynchronously, generate channel-specific drafts with affiliate tracked URLs, review the result, and publish Instagram Reels and Facebook video separately.

## Scope

- Extend the existing `/videos` dashboard.
- Add `POST /api/videos/import` for validated job creation.
- Reuse `video_jobs.metadata`, existing Storage, posts, affiliate links, copy engine, approval flow, and publication services where contracts permit.
- Add an `imported-video-v1` worker path without changing `motion-v1` behavior.
- Support only Instagram and Facebook for this workflow.
- Do not perform real import, real publication, production database changes, production Storage writes, deploy, or merge during implementation verification.

## Architecture

The web application validates the session, offer ownership, rights confirmation, channels, source URL, queue policy, and idempotency key, then enqueues a `video_jobs` record. The worker claims the job, resolves an allowlisted Shopee redirect chain, downloads with SSRF and resource limits, validates media with FFprobe, normalizes it with FFmpeg, generates deterministic assets, uploads them to the existing `videos` bucket, and stores metadata in `video_jobs.metadata`.

The review page reads the job and its metadata, creates or updates only Instagram and Facebook drafts using the existing deterministic copy engine, and requires independent channel approval. Existing Instagram publication contracts remain the source of truth. Facebook publication remains disabled unless its existing transport proves video support and valid credentials; otherwise the feature returns an explicit configuration error without making a Meta request.

## Data contract

The job keeps the existing primary status values and stores detailed stages in `stage` and `metadata`. Metadata keys are namespaced under `importedVideo` and include source provenance, rights evidence, media metadata, asset paths, channel drafts, fingerprints, and publication receipts. No new table is required for the MVP unless the audit of reuse or RLS proves `video_jobs.metadata` insufficient.

## Source resolution

The initial allowlist accepts `br.shp.ee`, `s.shopee.com.br`, and `shopee.com.br`. Redirects are limited and each hop is checked. A Shopee Video page may expose a CDN URL only after the controlled redirect chain; the final host is accepted only when discovered from that chain and validated as an official Shopee media host. HTTPS, DNS/IP safety, port, timeout, response size, content type, and MP4 signature are enforced. Credentials, private networks, metadata services, non-HTTPS protocols, CAPTCHA bypass, personal cookies, and watermark removal are prohibited.

## Copy and monetization

The selected offer is the only source for commercial facts. The system resolves `affiliate_links` for `instagram` and `facebook`, and the generated drafts contain only their channel-specific `tracked_url`. Missing or invalid monetized links fail with `NO_MONETIZED_LINK`. Source URLs never enter a draft. Tokens and secrets never enter copy or logs.

## Verification

Tests are written before production code and must demonstrate RED before GREEN. Network, Storage, FFprobe, FFmpeg, and Meta are mocked in automated tests. A separate preflight test records the observed example-link resolution without downloading the complete video. Final verification runs relevant tests, typecheck, lint, and build. No real import or publication is executed.
