# Banco de dados atual — Supabase

Fonte estrutural: `supabase/schema.sql` e `supabase/migrations/**`. Fluxo: [architecture-current.md](architecture-current.md).

Entidades principais: `profiles`, `offers`, `affiliate_links`, `posts`, `sales`, `integration_logs`, `app_settings` e `ai_copy_logs`. Migrations também criam/adaptam categorias, auditoria, tracking e sessões Baileys.

`offers.status`: `draft`, `pending_manual_review`, `selected`, `approved`, `posted`, `rejected`. `posts.status`: `draft`, `published`, `failed`, `deleted`.

O Oracle Worker materializa Candidate/Ingestion V1 e chama `upsert_discovery_offers_v1/v2`. Índices únicos por identidade nativa, chaves de idempotência e checkpoint do ciclo evitam reprocessamento indevido. RLS está habilitado; operações administrativas usam client server-side.
