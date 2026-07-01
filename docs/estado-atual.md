# Estado atual (baseline)

Este documento descreve o estado atual com base exclusiva no código do repositório e nos artefatos de configuração (ex.: `supabase/schema.sql`, `vercel.json`, scripts).

## Funcionalidades implementadas

- Painel web com rotas e páginas de dashboard (`src/app/(dashboard)/*`) e autenticação via Supabase SSR (`src/lib/supabase/*`).
- CRUD e consultas de ofertas/posts/links via Supabase (`src/lib/offers/*`, `src/app/api/*`).
- Geração de links rastreáveis por canal (`src/lib/tracking/sub-id.ts`) e redirecionador com Open Graph (`src/app/go/[...subId]/route.ts`).
- Geração de copy via IA no app (`src/app/api/ai/generate/route.ts` + `src/lib/ai/groq.ts`) e logging em `ai_copy_logs`.
- Ingestão de tendências via API (`src/app/api/scraper/trends/route.ts`) com integração de scraping remoto pela Oracle (em flows do `src/lib/affiliates/scraper.ts`).
- Publicação por canal via rotas dedicadas:
  - Telegram (`src/app/api/telegram/publish/route.ts`)
  - WhatsApp (via motor Oracle) (`src/app/api/whatsapp/publish/route.ts`)
  - Instagram (`src/app/api/instagram/publish/route.ts`) e utilitários de publicação (`src/lib/instagram/*`)
  - Facebook (`src/app/api/facebook/publish/route.ts`)
- Webhook do Instagram para comentários com gatilhos e Private Reply (`src/app/api/webhooks/instagram/route.ts`) com logs enviados ao Telegram.
- Background/filas via Inngest (`src/app/api/inngest/route.ts` e `src/lib/inngest/functions.ts`).
- Motores/scripts auxiliares:
  - WhatsApp Engine (Baileys) (`scripts/whatsapp-engine.cjs`)
  - Oracle API (Scrapfly) (`scripts/oracle-api.cjs`)
  - Oracle Scraper (Crawlee/Playwright + LLM + Supabase) (`scripts/oracle-scraper.cjs`)

## Funcionalidades em operação (fluxos completos no código)

Critério usado aqui: existe um caminho completo de execução no repositório (rota/script + integração real), sem depender de módulos marcados como STUB.

- Publicação no Telegram (Bot API) com update de `posts/offers`.
- Publicação no WhatsApp via motor Oracle (HTTP + API key) com update de `posts/offers` e logs em `integration_logs`.
- Publicação no Instagram via Meta Graph API (módulos `src/lib/instagram/*` e `src/lib/integrations/instagram/*`), com caminhos de Feed e Reels.
- Publicação no Facebook via Meta Graph API quando credenciais estão configuradas (`src/lib/platforms/facebook.ts`).
- Tracking via `/go/:subId` com geração de tags OG e disparo de evento para registrar click.

## Funcionalidades experimentais / auxiliares

Critério usado aqui: existe no repositório, mas está em scripts de teste/legado, ou marcada como STUB, ou é fluxo alternativo não unificado.

- TikTok (STUB) em `src/lib/integrations/tiktok/index.ts` (retorna IDs fictícios).
- Abstração `Publisher` com métodos `retry/cancel` marcados como TODO e `status()` parcial (`src/lib/publisher/index.ts`).
- Workflow de Reels via GitHub Actions (disparo + renderização + upload + publicação) como caminho alternativo ao publish direto por Graph API:
  - Disparo em `src/app/api/instagram/publish/route.ts`
  - Execução em `.github/workflows/publish-reel.yml` + `scripts/github-publish.ts`
- Coupon Scraper via Firecrawl (`src/lib/affiliates/coupon-scraper.ts`) depende de chave e é um fluxo específico.
- Scripts de diagnóstico/teste em `scripts/*` e `scripts/legacy_tests/*`.

## Componentes ativos (existem e são usados por fluxos principais)

- Vercel: app Next.js (UI + `/api/*`) e cron (`vercel.json`).
- Supabase: PostgreSQL/Auth/Storage; tabelas e migrações em `supabase/*`.
- Oracle (VPS): WhatsApp Engine (`:3001`), Oracle API (`:3002`) e Oracle Scraper (processo longo).

## Componentes desativados (existem no repositório, mas não executam integração real)

- TikTok integration (STUB) (`src/lib/integrations/tiktok/index.ts`).
- Facebook integration service (STUB) (`src/lib/integrations/facebook/index.ts`) não é o mesmo caminho da rota real de Facebook (`src/lib/platforms/facebook.ts`).

## Pendências conhecidas (evidências no código/config)

- `vercel.json` agenda `GET /api/instagram/poll-comments` como `0 0 * * *`, mas o comentário no código do endpoint menciona outra periodicidade (`src/app/api/instagram/poll-comments/route.ts`).
- A rota `POST /api/instagram/publish` atualiza `posts.status` para `"processing"`, enquanto o `schema.sql` define o check constraint de `posts.status` com valores `('draft','published','failed','deleted')`.
- IP da Oracle está hardcoded no app em chamadas de scraping remoto (`src/lib/affiliates/scraper.ts` usa `http://193.122.242.178:3002/api/scrape`).
- `.env.example` contém entradas duplicadas (o arquivo repete blocos).
