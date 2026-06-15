# Status Geral do Sistema (Caça Ofertas Oficial)

Este documento reflete o estado cirúrgico das funcionalidades do projeto baseado unicamente nas estruturas implementadas e validadas no código fonte.

| Módulo | Status | Evidências / Observações |
| ------ | ------ | ------------------------ |
| **Banco de Dados** | ✅ Implementado | Supabase ativo. Tabelas (`offers`, `posts`, `affiliate_links`, etc) 100% integradas e blindadas via RLS. |
| **Autenticação** | ✅ Implementado | Supabase Auth com SSR rodando perfeitamente nas sessões do usuário e políticas multi-tenant. |
| **Dashboard** | ✅ Implementado | Rotas em `src/app/(dashboard)/*` com componentes visuais de tabela, histórico e painéis renderizando dados reais do banco. |
| **Scraping** | ✅ Implementado | `src/lib/publish/scraper.ts` funciona extraindo dados via Firecrawl ou fazendo parser nativo de HTML via RegExp / JSON-LD. |
| **Tracking** | ✅ Implementado | Cloaking via sub-id em `/go/[subId]/route.ts`. Contabilização unitária de cliques configurada na tabela `affiliate_links`. |
| **IA** | ✅ Implementado | Motor da Groq API configurado com System Prompt retornando JSON (Estratégias de Urgência, Emoção, etc) em `src/lib/ai/groq.ts`. |
| **Telegram** | ✅ Implementado | Integração completa no backend batendo diretamente na Bot API (envio de texto e foto). |
| **Instagram** | ✅ Implementado | Fluxo da Meta Graph API rodando de forma oficial (cria container de mídia, faz polling e publica). |
| **WhatsApp** | ⚠️ Parcial | Disparo funciona via servidor Express local rodando `Baileys` na porta 3001. Trata-se de uma gambiarra stateful que quebra a escalabilidade e segurança Serverless. |
| **Cron Jobs** | ⚠️ Parcial | A rota `/api/scraper/cron/route.ts` tem a lógica de agendamento validada por `CRON_SECRET`, mas o Next.js não roda crons autônomos. Depende de configurador externo (Vercel Cron). |
| **Analytics** | ⚠️ Parcial | Existem colunas e UI para vendas (`sales`), mas não foi implementado nenhum Webhook para ler conversões das lojas dinamicamente. O funil não fecha automaticamente. |
| **Facebook** | ❌ Não Implementado | Somente interface (`src/app/(dashboard)/facebook/page.tsx`). Sem motor de integração no backend enviando payloads reais pro FB. |
| **TikTok** | ❌ Não Implementado | Apenas chave genérica em `config/socials.ts`. Sem nenhum resquício de comunicação de API. |
