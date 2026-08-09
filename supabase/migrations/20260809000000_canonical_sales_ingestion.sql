-- Canonical marketplace sales provenance and idempotency.
-- Apply through the normal Supabase migration workflow; this task performs no DB writes.
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS marketplace text,
  ADD COLUMN IF NOT EXISTS source_event_id text;

ALTER TABLE public.sales
  ADD CONSTRAINT sales_marketplace_check
  CHECK (marketplace IS NULL OR marketplace IN ('Shopee', 'Mercado Livre'));

CREATE UNIQUE INDEX IF NOT EXISTS sales_source_event_unique
  ON public.sales (user_id, marketplace, source_event_id)
  WHERE marketplace IS NOT NULL AND source_event_id IS NOT NULL;
