# Fluxos (estado atual)

Este documento lista somente fluxos comprovados pelo código do repositório.

## Oracle Scraper (robô V2)

- **Origem**
  - Processo Node em `scripts/oracle-scraper.cjs` (cron interno por `node-cron`).
- **Processamento**
  - Faz scraping com Crawlee + Playwright (+ stealth).
  - Gera análise/copy via LLM (Cerebras como provider principal e Groq como fallback, conforme variáveis `LLM_PROVIDER`/`LLM_FALLBACK`).
  - Cria/atualiza `offers`, cria/atualiza `affiliate_links`, cria `posts` (rascunhos) e escreve `integration_logs`.
- **Destino**
  - Supabase (PostgreSQL): `offers`, `affiliate_links`, `posts`, `integration_logs`.

## Oracle API (scraping remoto)

- **Origem**
  - App Next.js (Vercel) chamando a Oracle (IP fixo no código) via `fetch`.
- **Processamento**
  - `scripts/oracle-api.cjs` expõe `POST /api/scrape`.
  - Usa Scrapfly (`SCRAPFLY_API_KEYS`/`SCRAPFLY_API_KEY`) para obter HTML.
  - Normaliza e retorna `html`, `text` e `metadata` (não grava no banco).
- **Destino**
  - Resposta HTTP de volta para o app (Vercel), que então executa extração/curadoria.

## Scraper de tendências (API)

- **Origem**
  - Painel (UI) chama `POST /api/scraper/trends`.
- **Processamento**
  - `src/app/api/scraper/trends/route.ts` autentica usuário (Supabase Auth).
  - Executa `discoverAndIngestTrendingOffers` (módulo `src/lib/affiliates/scraper.ts`), que inclui chamadas à Oracle API em flows específicos.
  - Aplica ranking/curadoria (`rankOffersBatch`).
  - Se `GROQ_API_KEY` estiver configurada, chama `POST /api/ai/generate` para gerar rascunhos por IA.
- **Destino**
  - Supabase: grava/atualiza `offers` e, opcionalmente, cria `affiliate_links` e `posts` via `/api/ai/generate`.

## Pipeline IA (geração de copys e rascunhos)

### Via API (Vercel)

- **Origem**
  - UI chama `POST /api/ai/generate` com `offerId`.
- **Processamento**
  - Cria/atualiza `affiliate_links` (um por canal: `telegram`, `instagram`, `whatsapp`).
  - Executa `generateOfferAnalysis` (módulo `src/lib/ai/groq.ts`).
  - Atualiza `offers.score` e `offers.explainability`.
  - Remove rascunhos antigos (`posts` com status `draft`) e insere novos rascunhos em `posts`.
  - Escreve `ai_copy_logs` quando `analysis.winner_strategy_type` existir.
- **Destino**
  - Supabase: `affiliate_links`, `posts`, `offers`, `ai_copy_logs`.

### Via script (Oracle/Node)

- **Origem**
  - Execução do script `scripts/ai-processor.cjs`.
- **Processamento**
  - Lê `offers` com status `draft`.
  - Usa `src/core/llm/factory` (Cerebras/Groq) para gerar copy.
  - Cria `affiliate_links`, cria `posts` e promove oferta para `approved`.
- **Destino**
  - Supabase: `offers`, `affiliate_links`, `posts`.

## Publicação (Telegram)

- **Origem**
  - UI chama `POST /api/telegram/publish` com `postId` (e opcionalmente `content` editado).
- **Processamento**
  - Carrega `posts` + `offers`.
  - Publica via Telegram Bot API (`src/lib/telegram/client.ts`).
  - Atualiza `posts` para `published` e `offers` para `posted`.
- **Destino**
  - Telegram + Supabase (`posts`, `offers`).

## Publicação (WhatsApp)

- **Origem**
  - UI chama `POST /api/whatsapp/publish` com `postId` (e opcionalmente `content` editado).
- **Processamento**
  - Carrega `posts` + `offers`.
  - Envia para o motor WhatsApp (Oracle) via `src/lib/integrations/whatsapp` (HTTP `POST /send` com `x-api-key`).
  - Registra sucesso/erro em `integration_logs`.
  - Atualiza `posts` para `published` e `offers` para `posted`.
- **Destino**
  - WhatsApp (via Oracle) + Supabase (`posts`, `offers`, `integration_logs`).

## Publicação (Instagram)

### Via GitHub Actions (endpoint dedicado)

- **Origem**
  - UI chama `POST /api/instagram/publish`.
- **Processamento**
  - Dispara workflow `publish-reel.yml` via GitHub API usando `GITHUB_TOKEN`.
  - O workflow executa `scripts/github-publish.ts`, que:
    - Renderiza vídeo com Remotion.
    - Faz upload em Supabase Storage (bucket `reels`).
    - Publica Reel via Meta Graph API (função `publishVideoToInstagram`).
    - Atualiza `posts` e `offers` no Supabase.
- **Destino**
  - GitHub Actions + Supabase Storage + Instagram + Supabase (`posts`, `offers`).

### Via Meta Graph API (ação interna)

- **Origem**
  - Ações internas de publicação no app (ex.: `publishToInstagramAction` em `src/lib/publish/actions.ts`).
- **Processamento**
  - Verifica `INSTAGRAM_ACCESS_TOKEN`.
  - Tenta gerar vídeo via Cloudinary (Ken Burns) e publica como Reels; se falhar, publica imagem (Feed).
- **Destino**
  - Instagram + (opcional) Cloudinary.

## Publicação (Facebook)

- **Origem**
  - UI chama `POST /api/facebook/publish`.
- **Processamento**
  - Publica via Graph API (`src/lib/platforms/facebook.ts`) quando `FACEBOOK_PAGE_ID` e `FACEBOOK_ACCESS_TOKEN` estão configurados.
  - Atualiza `posts` para `published`.
- **Destino**
  - Facebook + Supabase (`posts`).

## Tracking de cliques (SubID)

- **Origem**
  - Clique em URL `GET /go/:subId`.
- **Processamento**
  - Busca o `affiliate_links` por prefixo de `sub_id` e junta metadados da oferta.
  - Retorna HTML com tags Open Graph e redirecionamento para `original_url`.
  - Dispara evento `tracking/click.registered` (Inngest) para registrar clique e atualizar métricas.
- **Destino**
  - Navegador do usuário (redirect) + Supabase (`click_events`, contadores em `affiliate_links`) via Inngest.

## Instagram (Webhook de comentários)

- **Origem**
  - Meta envia eventos para `GET/POST /api/webhooks/instagram`.
- **Processamento**
  - `GET`: valida token de verificação (`META_WEBHOOK_VERIFY_TOKEN`).
  - `POST`: detecta gatilhos de comentário e responde via Graph API (Private Reply).
  - Usa Supabase (Service Role) para encontrar `posts` e `affiliate_links`.
  - Envia logs de debug via Telegram.
- **Destino**
  - Instagram (reply) + Supabase (`posts`, `affiliate_links`) + Telegram (logs).

## Instagram (Polling via cron na Vercel)

- **Origem**
  - Vercel Cron chama `GET /api/instagram/poll-comments` (configurado em `vercel.json`).
- **Processamento**
  - Proteção opcional via `CRON_SECRET` (Authorization Bearer).
  - Executa `pollAndReplyComments` para buscar comentários e responder com link quando aplicável.
- **Destino**
  - Instagram (reply) + Supabase (leituras para localizar oferta/link).
