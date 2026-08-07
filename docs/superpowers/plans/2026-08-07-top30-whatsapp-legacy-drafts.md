# Top 30 WhatsApp Legacy Drafts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline execution) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare up to 30 recent, diverse WhatsApp commercial candidates as idempotent legacy drafts using 48h with a 72h fallback.

**Architecture:** Add a server-side, dependency-injected preparation service that reads recent offers and existing state in batches, delegates ranking/routing/diversity to existing commercial modules, and persists only WhatsApp affiliate links and drafts. Add a small server action/button at the existing WhatsApp page boundary; keep `SocialChannelPostsView`, Telegram, Videos, publishing, and layout structure untouched.

**Tech Stack:** Next.js server actions, TypeScript, Supabase JS, existing commercial curation/router/tracking modules, Vitest, existing dashboard refresh/navigation.

## Global Constraints

- Janela principal: últimas 48h.
- Se não fechar 30 elegíveis para WhatsApp, ampliar automaticamente para 72h.
- Se ainda não fechar 30, criar somente as elegíveis e reportar a quantidade.
- Não publicar, não enviar WhatsApp, não chamar bot, não gerar drafts Telegram.
- Não mexer em Vídeos/Reels, Oracle, PM2, cron, scraping ou histórico total.
- Todo draft precisa ter link afiliado/rastreado; falha deve pular o item com `affiliate_link_failed`.
- Rodar duas vezes não pode duplicar; preservar posts publicados e drafts anteriores.
- Não recriar `Fila Comercial` nem `Copiar copy`.

---

### Task 1: Top 30 preparation service

**Files:**
- Create: `src/lib/offers/prepare-top30-whatsapp-legacy-drafts.ts`
- Test: `src/tests/top30-whatsapp-legacy-drafts.test.ts`

**Interfaces:**
- Produce `prepareTop30WhatsappLegacyDrafts(repository, options?): Promise<Top30WhatsappResult>`.
- Repository reads offers/links/drafts/published posts and writes affiliate links/drafts through explicit methods.

- [ ] Write failing tests for 48h default, 72h fallback, no all-history query, and Telegram exclusion.
- [ ] Run the focused test and confirm failure because the service is not implemented.
- [ ] Write failing tests for Top 30 diversity, link failure skipping, draft-only writes, and idempotent reuse.
- [ ] Implement windowed offer reads and candidate selection using existing curation/router/diversity functions.
- [ ] Implement affiliate-link reuse/create and skip-on-failure without raw-link drafts.
- [ ] Implement published protection and `offer_id + whatsapp + commercial version` draft reuse.
- [ ] Run the focused test suite and confirm all service behavior passes.

### Task 2: Existing WhatsApp panel action

**Files:**
- Create: `src/app/(dashboard)/whatsapp/actions.ts`
- Modify: `src/app/(dashboard)/whatsapp/page.tsx`
- Test: `src/tests/components/whatsapp-top30-action.test.tsx`

**Interfaces:**
- Produce server action `prepareTop30WhatsappLegacyDraftsAction(): Promise<Top30WhatsappResult>`.
- Consume the service from Task 1 and return only its summary; no publish/send transport.

- [ ] Write failing component/action tests for the exact `Atualizar melhores ofertas` button, summary feedback, and no Telegram/Vídeos labels.
- [ ] Run tests to confirm the button/action is absent before implementation.
- [ ] Add the smallest client control at the WhatsApp page boundary, preserving the existing `SocialChannelPostsView` and layout structure.
- [ ] Make the action revalidate the existing `/whatsapp` path after preparation so drafts appear in current `Aguardando aprovação`.
- [ ] Run component tests and verify no prohibited panel strings or imports return.

### Task 3: Production controlled release and report

**Files:**
- Create: `docs/TOP30_WHATSAPP_LEGACY_DRAFTS_RELEASE_REPORT.md`

- [ ] Run the requested bridge, curation, router, copy tests, build, and diff check.
- [ ] Inspect git diff to confirm only WhatsApp action/service/tests/report changed; no Telegram/Vídeos/layout structural files.
- [ ] Run the preparation once only after verification, with 48h then 72h fallback and no send/publish calls.
- [ ] Validate draft counts, affiliate links, images, copy, `status='draft'`, `channel='whatsapp'`, and no published changes.
- [ ] Run the action a second time or an idempotency-equivalent read to confirm no duplicate posts.
- [ ] Record exact window, created/reused/skipped/reasons, Telegram block, tests/build, commit/push/deploy status, and production validation.
