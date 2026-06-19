# Inventário Técnico Completo

## 1. Banco de Dados (Supabase - PostgreSQL)
- **Views**: 0
- **Functions**: 0 (nenhuma customizada de negócio)
- **Triggers**: 0
- **Tabelas e Modelagem Base:**
  - `profiles`: id, full_name.
  - `offers`: user_id, platform, product_name, original_url, image_url, current_price, score, status, seasonality.
  - `affiliate_links`: offer_id, channel, original_url, tracked_url, sub_id, clicks.
  - `posts`: offer_id, affiliate_link_id, channel, content, external_id, status.
  - `sales`: offer_id, affiliate_link_id, gross_value, commission_value.
  - `integration_logs`: metadata, action, status.
  - `app_settings`: chaves/valores de painel (ex: ativador de cron).
- **Segurança (RLS)**: Cada tabela aplica restrição onde `auth.uid() = user_id`.

## 2. Endpoints Dinâmicos
- `src/app/api/scraper/cron/route.ts`: Webhook de execução periódica de robôs e envio multicanal.
- `src/app/api/ai/generate/route.ts`: Ponte frontend-backend para solicitar copy.
- `src/app/api/telegram/publish/route.ts`: Disparo REST do bot Telegram.
- `src/app/go/[subId]/route.ts`: Roteamento de cloaking/tracking de links gerados.

## 3. Serviços Externos Identificados
- **Firecrawl API**: Oculto em `src/lib/publish/scraper.ts` utilizado como a ponta de lança para extração estruturada de HTML.
- **Groq API**: Central de IA (`api.groq.com`). Modelos baseados no `llama`.
- **Telegram API**: `api.telegram.org` acessado diretamente pelo token do Bot.
- **Meta Graph API**: `graph.facebook.com` acessado nativamente pelo Backend para manipular o Instagram Business Profile do usuário.

## 4. Dependências Core (package.json)
- `@supabase/ssr` & `@supabase/supabase-js` (Estado e banco de dados).
- `@whiskeysockets/baileys` & `qrcode-terminal` (Motor exclusivo para contorno de infraestrutura oficial de WhatsApp).
- `next`, `react`, `tailwind` (Renderização e Interface).
- `zod` (Validação estrita de contratos JSON das IAs).
- `vitest`, `jsdom`, `testing-library` (Suíte de TDD/BDD do projeto).
