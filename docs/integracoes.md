# Integrações (estado atual)

Somente integrações comprovadas pelo código estão listadas aqui.

## Supabase

- **Finalidade**: banco central (PostgreSQL), autenticação e storage.
- **Arquivos responsáveis**
  - Clientes: `src/lib/supabase/browser.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/admin.ts`
  - Schema/migrações: `supabase/schema.sql`, `supabase/migrations_*.sql`
- **Fluxo**
  - UI/API (Vercel) lê/escreve tabelas (`offers`, `posts`, `affiliate_links`, etc.).
  - Scripts Oracle usam Service Role para ler/escrever e para persistir sessão do Baileys (`baileys_sessions`).

## Oracle (WhatsApp Engine)

- **Finalidade**: envio ao WhatsApp via Baileys (WhatsApp Web) para canal Newsletter.
- **Arquivos responsáveis**
  - Motor: `scripts/whatsapp-engine.cjs`
  - Cliente no app: `src/lib/integrations/whatsapp/index.ts`
  - Publicação: `src/app/api/whatsapp/publish/route.ts`
- **Fluxo**
  - Vercel → `POST {engineUrl}/send` com header `x-api-key` → Baileys envia mensagem → retorno JSON ao app.
  - Estado da sessão fica no Supabase (`baileys_sessions`).

## Oracle (Oracle API — scraping remoto)

- **Finalidade**: obter HTML/texto de páginas de marketplace via Scrapfly para processamento no app.
- **Arquivos responsáveis**
  - API: `scripts/oracle-api.cjs`
  - Chamadas: `src/lib/affiliates/scraper.ts`, `src/lib/publish/scraper.ts`
- **Fluxo**
  - Vercel → Oracle API (`POST /api/scrape`) → Scrapfly → retorno para Vercel → extração/curadoria no app.

## Groq (LLM)

- **Finalidade**: geração de copy/análise de oferta e extração estruturada em fluxos do app e de scripts.
- **Arquivos responsáveis**
  - App: `src/lib/ai/groq.ts`, `src/app/api/ai/generate/route.ts`
  - Provider JS (scripts): `src/core/llm/groq.js`
  - Oracle Scraper: `scripts/oracle-scraper.cjs`
- **Fluxo**
  - O app chama Groq (OpenAI-compatible) e salva resultados em `posts`/`offers`/`ai_copy_logs`.

## Cerebras (LLM)

- **Finalidade**: provider principal em parte dos scripts (OpenAI-compatible).
- **Arquivos responsáveis**
  - Provider JS (scripts): `src/core/llm/cerebras.js`
  - Oracle Scraper: `scripts/oracle-scraper.cjs`
- **Fluxo**
  - Scripts chamam Cerebras para geração; em falha, recorrem ao fallback configurado (ex.: Groq).

## Telegram Bot API

- **Finalidade**: publicação de mensagens/fotos e uso como canal de logs de debug (webhook Instagram).
- **Arquivos responsáveis**
  - Cliente: `src/lib/telegram/client.ts`
  - Publicação: `src/app/api/telegram/publish/route.ts`
  - Webhook IG: `src/app/api/webhooks/instagram/route.ts` (logs via Telegram)
- **Fluxo**
  - Vercel → `api.telegram.org` (`sendMessage`/`sendPhoto`) → atualização de status no Supabase.

## Instagram (Meta Graph API)

- **Finalidade**: publicar Feed/Story/Reels e responder comentários via Private Reply.
- **Arquivos responsáveis**
  - Cliente/descoberta: `src/lib/instagram/client.ts`
  - Service wrapper: `src/lib/integrations/instagram/index.ts`
  - Publicação por post: `src/app/api/instagram/publish/route.ts`
  - Polling: `src/lib/instagram/comment-polling.ts`, `src/app/api/instagram/poll-comments/route.ts`
  - Webhook: `src/app/api/webhooks/instagram/route.ts`
- **Fluxo**
  - Publicação: Vercel → Graph API (`/media`, polling de status, `/media_publish`) → atualiza `posts/offers`.
  - Webhook/Private reply: Meta → Vercel (`/api/webhooks/instagram`) → Supabase (lookup) → Graph API (`/{igUserId}/messages`) para reply.

## Facebook (Meta Graph API)

- **Finalidade**: publicação em Página do Facebook quando configurado.
- **Arquivos responsáveis**
  - Publicação: `src/app/api/facebook/publish/route.ts`, `src/lib/platforms/facebook.ts`
- **Fluxo**
  - Vercel → Graph API (`/{pageId}/feed` ou `/{pageId}/photos`) → atualiza `posts`.

## GitHub (API + Actions)

- **Finalidade**: renderização e publicação de Reels via workflow sob demanda.
- **Arquivos responsáveis**
  - Workflow: `.github/workflows/publish-reel.yml`
  - Disparo: `src/app/api/instagram/publish/route.ts` (workflow_dispatch)
  - Execução: `scripts/github-publish.ts`
- **Fluxo**
  - Vercel → GitHub API (dispatch) → GitHub Runner → Remotion render → upload Supabase Storage (`reels`) → publish no Instagram → update no Supabase.

## Remotion

- **Finalidade**: renderizar vídeo (`out.mp4`) a partir de template React.
- **Arquivos responsáveis**
  - Entrypoint: `src/remotion/index.ts`
  - Execução: `scripts/github-publish.ts` (via `npx remotion render ...`)
- **Fluxo**
  - GitHub Actions renderiza o vídeo antes de subir para o Storage.

## Cloudinary

- **Finalidade**: gerar vídeo (Reels) a partir de imagem usando transformação (zoompan).
- **Arquivos responsáveis**
  - `src/lib/cloudinary/index.ts`
  - Uso: `src/lib/publish/actions.ts` (gera vídeo e publica como Reels quando possível)
- **Fluxo**
  - Vercel → Cloudinary upload/eager transform → retorna `videoUrl` → Vercel publica no Instagram.

## Scrapfly

- **Finalidade**: scraping remoto (HTML) de páginas com render JS/ASP.
- **Arquivos responsáveis**
  - Oracle API: `scripts/oracle-api.cjs`
  - Scrapers/scripts: `scripts/oracle-scraper.cjs`, `scripts/local-scraper.cjs`
- **Fluxo**
  - Oracle API chama `api.scrapfly.io` e entrega HTML/texto para o consumidor.

## Firecrawl

- **Finalidade**: extração estruturada de cupons via endpoint `https://api.firecrawl.dev/v1/scrape`.
- **Arquivos responsáveis**
  - `src/lib/affiliates/coupon-scraper.ts`
- **Fluxo**
  - Vercel → Firecrawl scrape/extract → retorna lista de cupons para uso no app.

## Mercado Livre (OAuth/API oficial)

- **Finalidade**: renovar/obter tokens e, quando aplicável, buscar detalhes do produto via API oficial.
- **Arquivos responsáveis**
  - Plataforma: `src/lib/platforms/mercadolivre.ts`
  - Callback OAuth: `src/app/api/auth/ml/callback/route.ts`
- **Fluxo**
  - Vercel → `api.mercadolibre.com` (OAuth/token) → grava credenciais em `app_settings` (`ml_credentials`).

## Rakuten/Netshoes (IDs de afiliado)

- **Finalidade**: montar parâmetros/IDs de afiliado para Netshoes.
- **Arquivos responsáveis**
  - `src/lib/platforms/netshoes.ts`
  - Scripts: `scripts/oracle-scraper.cjs` (usa `RAKUTEN_*`)
- **Fluxo**
  - Usado na construção de URLs/identificação conforme variáveis.

## TikTok

- **Finalidade**: existe como serviço marcado como STUB (sem chamada real).
- **Arquivo responsável**
  - `src/lib/integrations/tiktok/index.ts`
- **Fluxo**
  - Retorna IDs fictícios (`TIKTOK_STUB_*`) e registra warn; não publica.
