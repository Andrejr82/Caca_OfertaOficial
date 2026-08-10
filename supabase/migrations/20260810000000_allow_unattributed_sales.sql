-- Allow real marketplace sales without provable attribution.
-- Null attribution is explicit; marketplace provenance remains separate.
ALTER TABLE public.sales
  ALTER COLUMN offer_id DROP NOT NULL,
  ALTER COLUMN affiliate_link_id DROP NOT NULL,
  ALTER COLUMN channel DROP NOT NULL;

ALTER TABLE public.sales
  ALTER COLUMN gross_value TYPE numeric(14,4) USING gross_value::numeric,
  ALTER COLUMN commission_value TYPE numeric(14,4) USING commission_value::numeric;
