# Caça Oferta Oficial — Baseline (estado atual)

## Objetivo do projeto

Centralizar a curadoria, geração de criativos (IA), rastreamento (SubID) e publicação de ofertas em múltiplos canais (Telegram, WhatsApp, Instagram e Facebook) usando um painel web (Next.js) e um conjunto de scripts/serviços auxiliares (Oracle).

## Arquitetura atual

- **Vercel**: hospeda o app Next.js (UI + rotas `/api/*`) e executa cron via `vercel.json`.
- **Supabase**: PostgreSQL + Auth + Storage; é o repositório central de estado (ofertas, posts, links, logs).
- **Oracle (VPS)**:
  - **WhatsApp Engine** (Express + Baileys) em `:3001` para envio ao Grupo WhatsApp oficial (destino operacional configurável via `WHATSAPP_TARGET_ID`; Canal/Newsletter permanece apenas como compatibilidade legada).
  - **Oracle API** (Express) em `:3002` para raspagem via Scrapfly e retorno de HTML/texto.
  - **Oracle Scraper** (Crawlee + Playwright) como processo longo que grava/atualiza dados no Supabase.
- **Windows (desenvolvimento/execução local)**: roda o Next.js localmente e scripts auxiliares quando necessário.

## Tecnologias utilizadas

- **Web**: Next.js `^16.2.2`, React `^19.2.0`, TailwindCSS.
- **Banco**: Supabase (`@supabase/supabase-js`, `@supabase/ssr`).
- **IA**:
  - **Groq** (API OpenAI-compatible via `fetch`/`axios`) no app e em scripts.
  - **Cerebras** (API OpenAI-compatible via `axios`) no `oracle-scraper.cjs` e na camada `src/core/llm/*`.
- **Scraping**: Crawlee + Playwright (+ stealth plugin), Scrapfly (HTTP API), Firecrawl (HTTP API para extração de cupons).
- **Mensageria/Publicação**: Telegram Bot API, Meta Graph API (Instagram/Facebook), Baileys (WhatsApp Web).
- **Mídia**: Sharp (proxy/normalização de imagem), Cloudinary (geração de vídeo a partir de imagem), Remotion (render em GitHub Actions).
- **Outros**: Express, Zod, Vitest.

## Estrutura de pastas

- `src/app/`: UI (App Router) e rotas de API (`/api/*`).
- `src/lib/`: integrações (WhatsApp/Instagram/Telegram/Cloudinary), regras de domínio (offers/publish/tracking), Supabase clients.
- `src/core/`: camada LLM abstrata (providers e factory) usada por scripts.
- `scripts/`: processos e utilitários (Oracle Scraper, WhatsApp Engine, Oracle API, testes).
- `supabase/`: `schema.sql` e migrações SQL.
- `.github/workflows/`: automação de publish de Reels via GitHub Actions.
- `apps/chrome-extension/`: extensão do Chrome (arquivos do MVP).

## Requisitos

- Node.js 20+
- Conta/projeto Supabase (URL + keys)
- Para publicar:
  - Telegram: Bot Token + Channel ID
  - WhatsApp: WhatsApp Engine ativo (Oracle) + `WHATSAPP_ENGINE_API_KEY` + `WHATSAPP_TARGET_ID` (JID do Grupo oficial `...@g.us`; Canal `...@newsletter` é fallback legado)
  - Instagram/Facebook: token Meta Graph API (e, opcionalmente, Cloudinary/GitHub Actions conforme o fluxo)
- Para scraping:
  - Oracle API: Scrapfly API Key(s)
  - Coupon Scraper: Firecrawl API Key

## Instalação

```bash
npm install
```

## Configuração

- Variáveis de ambiente ficam em `.env.local` (local) e, no Oracle, o motor do WhatsApp aceita `.env.local.remote` ou `.env.local` (prioriza `.env.local.remote`).
- Lista completa e finalidade: `docs/ambiente.md`.

## Execução local

```bash
npm run dev
```

- App: `http://localhost:3000`
- Para rodar o motor do WhatsApp localmente:

```bash
npm run whatsapp
```

Este comando executa em paralelo:
- `node scripts/whatsapp-engine.cjs` (porta `3001`)
- `ngrok http --domain=reasonably-droughtier-kyla.ngrok-free.dev 3001` (conforme `package.json`)

## Execução Oracle

Componentes que rodam na VPS Oracle:

- **WhatsApp Engine**: `node scripts/whatsapp-engine.cjs` (porta `3001`)
- **Oracle API**: `node scripts/oracle-api.cjs` (porta `3002`, rota `POST /api/scrape`)
- **Oracle Scraper**: `node scripts/oracle-scraper.cjs` (cron interno por `node-cron`)

## Execução Vercel

- Build/Deploy: `next build` (conforme `vercel.json`)
- Cron configurado no projeto:
  - `GET /api/instagram/poll-comments` com schedule `0 0 * * *` (conforme `vercel.json`)

## Integração Supabase

- Schema base: `supabase/schema.sql`
- Migrações adicionais: `supabase/migrations_*.sql`
- Tabelas efetivamente usadas pelo código incluem: `offers`, `affiliate_links`, `posts`, `sales`, `integration_logs`, `ai_copy_logs`, `app_settings`, `profiles`, `audit_logs`, `click_events`, `baileys_sessions`.

## Scripts principais

- `scripts/oracle-scraper.cjs`: robô de descoberta/processamento (Crawlee + LLM + gravação no Supabase).
- `scripts/whatsapp-engine.cjs`: motor de envio WhatsApp (Express + Baileys) com endpoints `/status`, `/send`, `/resolve-target/:code` e alias legado `/resolve-channel/:code`; operação oficial via Grupo (`...@g.us`).
- `scripts/oracle-api.cjs`: micro-API de scraping (Express) consumida pelo app via Oracle.
- `scripts/ai-processor.cjs`: processador de ofertas draft → posts/links (LLM Factory).
- `.github/workflows/publish-reel.yml` + `scripts/github-publish.ts`: renderiza vídeo (Remotion), faz upload no Supabase Storage e publica no Instagram.

## Fluxo geral

1. Entrada de oferta (scraping de tendências, scraping em Oracle, ou inserção via UI/API).
2. Persistência no Supabase (`offers`).
3. Geração de links rastreáveis (`affiliate_links`) e criação de rascunhos (`posts`) via IA.
4. Publicação por canal via rotas `/api/*` (Telegram/WhatsApp/Instagram/Facebook) e atualização de status no banco.
5. Tracking de cliques via `/go/:subId` + eventos (Inngest) gravando em `click_events` e agregando em `affiliate_links`.

