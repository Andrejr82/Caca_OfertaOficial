# DOCUMENTAÇÃO MESTRA - CAÇA OFERTA OFICIAL (V3)

## Visão Geral
Sistema SaaS multicanal de afiliados, projetado para automação de scraping, geração inteligente de copys (Groq API) e postagem simultânea em canais sociais mantendo uma arquitetura híbrida de execução.

## Arquitetura
- **Core Serverless:** Next.js (App Router), Vercel.
- **Background Jobs:** Filas gerenciadas via Inngest (Scraping, IA, Publicação, Analytics).
- **Engine Isolado:** Container/Script `whatsapp-engine.cjs` provendo ponte controlada (via x-api-key) com Baileys local, orquestrado pelo Frontend via HTTP.

## Banco de Dados
Supabase (PostgreSQL) com RLS ativado:
- `profiles`, `offers`, `affiliate_links`, `posts`, `sales`, `integration_logs`, `app_settings`

## Integrações
- **Telegram:** Completa (Bot API).
- **Instagram:** Completa (Meta Graph API).
- **WhatsApp:** Híbrida (Service Client em `src/lib/integrations/whatsapp` delegando para Engine Expresso em `:3001`).
- **Facebook:** PREPARADO PARA IMPLEMENTAÇÃO (Stub).
- **TikTok:** PREPARADO PARA IMPLEMENTAÇÃO (Stub).

## IA e Scraping
- Motor LLM: Groq (Geração de Copys variadas e formatadas estruturalmente).
- Scraper: Híbrido (Firecrawl API -> Regex/JSON-LD). Adicionado sistema de `confidence_score` nativo.

## Segurança e Tracking
- Zod acoplado para tipagem segura nas integrações de ponta.
- Sub-ID tracking (cloaking dinâmico) acoplado e métricas preparadas para ingestão de webhooks via serviço de Analytics.
