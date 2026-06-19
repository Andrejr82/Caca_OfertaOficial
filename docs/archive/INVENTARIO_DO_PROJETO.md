# Inventário de Projeto

Documentação gerada com base na análise de dependências (`package.json`) e rotas/componentes efetivamente implementados na pasta `src/`.

## 1. Mapeamento de Funcionalidades e Integrações

| Funcionalidade | Status | Evidência no Código |
| -------------- | ------ | ------------------- |
| Login / Auth Supabase | ✅ IMPLEMENTADO | `src/lib/supabase/*` |
| Painel Administrativo | ✅ IMPLEMENTADO | Páginas em `src/app/(dashboard)` |
| Busca automática de ofertas | ✅ IMPLEMENTADO | `src/lib/publish/scraper.ts` (Fetch + Firecrawl) |
| IA geradora de copy | ✅ IMPLEMENTADO | `src/lib/ai/groq.ts` chamando `api.groq.com` |
| Publicação Telegram | ✅ IMPLEMENTADO | `src/lib/telegram/client.ts` |
| Publicação Instagram | ✅ IMPLEMENTADO | `src/lib/instagram/client.ts` |
| Publicação WhatsApp | ⚠️ IMPLEMENTAÇÃO PARCIAL | `scripts/whatsapp-engine.cjs` (Servidor dependente rodando isolado com Baileys local) |
| Firecrawl | ✅ IMPLEMENTADO | Rotina de fallback descrita em `scraper.ts`. |
| Supabase RLS | ✅ IMPLEMENTADO | Migrations e `schema.sql` |
| Geração de Links de Afiliado | ✅ IMPLEMENTADO | Rotas de tracking `src/app/go/[subId]/route.ts` |
| Integração nativa Amazon/Shopee | ❌ NÃO IMPLEMENTADO | APIs de integração direta de afiliação não encontradas. |

## 2. Banco de Dados (Supabase/PostgreSQL)

Base de dados totalmente documentada a partir do `schema.sql` raiz.

| Tabela | Função e Dados Chave |
| ------ | -------------------- |
| **profiles** | Perfis de usuários logados vinculados ao `auth.users`. |
| **offers** | Armazena dados de raspage (produto, plataforma, preço original, preço atual, url bruto, score, imagens). |
| **affiliate_links** | Tracking de URLs. Vincula oferta + canal, gera o sub-id e contabiliza **clicks**. |
| **posts** | Histórico de publicações. Armazena canal, external_id (ID da postagem no Telegram/Insta), status (draft, published, failed). |
| **sales** | Base para inserir vendas/comissões baseadas em sub-ids. Status (pending, confirmed, cancelled). |
| **integration_logs** | Auditoria e histórico de integrações. Status, message, payload jsonb. |
| **app_settings** | Key/Value armazenando configurações personalizadas no JSONB. |

## 3. Stack Tecnológica
* **Linguagem Principal:** TypeScript
* **Framework Web:** Next.js (com App Router)
* **Estilização:** Tailwind CSS (`tailwind.config.ts`), classe `clsx`
* **Banco e Auth:** Supabase (Client, SSR e Admin mode)
* **Testes:** Vitest (`vitest.config.ts`) e `jsdom`
* **APIs de Terceiros Identificadas:** Meta Graph API, Telegram API, Firecrawl Dev API, Groq AI API.
* **Componentes WhatsApp:** `express`, `cors`, `@whiskeysockets/baileys`, `sharp`, `qrcode-terminal`
* **Utilitários Globais:** ESLint, Prettier/PostCSS, Zod.
