-- =======================================================
-- MIGRATION: TRACKING DE CLIQUES & ANALYTICS
-- =======================================================

-- 1. Criação da tabela transacional de eventos granulares (Append-Only)
CREATE TABLE IF NOT EXISTS public.click_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_link_id uuid NOT NULL REFERENCES public.affiliate_links(id) ON DELETE CASCADE,
  source text, -- Origem extraída do referer
  device_type text, -- Ex: 'mobile', 'desktop', 'tablet'
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Índices de performance para click_events
CREATE INDEX IF NOT EXISTS click_events_link_id_idx ON public.click_events(affiliate_link_id);
CREATE INDEX IF NOT EXISTS click_events_created_at_idx ON public.click_events(created_at DESC);

-- Habilitar RLS em click_events
ALTER TABLE public.click_events ENABLE ROW LEVEL SECURITY;

-- Políticas para click_events
DROP POLICY IF EXISTS "click_events select own" ON public.click_events;
CREATE POLICY "click_events select own" ON public.click_events
  FOR SELECT
  USING ((SELECT user_id FROM public.affiliate_links WHERE id = affiliate_link_id) = auth.uid());

-- Permitir inserção por qualquer rota autenticada via Service Role (Bypass) ou usuários
DROP POLICY IF EXISTS "click_events insert own" ON public.click_events;
CREATE POLICY "click_events insert own" ON public.click_events
  FOR INSERT
  WITH CHECK (true); -- Workers do Inngest usam bypass_rls, então isso protege pouco, mas caso mude no futuro

-- 2. Criação da tabela de consolidação diária (Analytics)
CREATE TABLE IF NOT EXISTS public.daily_click_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_link_id uuid NOT NULL REFERENCES public.affiliate_links(id) ON DELETE CASCADE,
  date date NOT NULL,
  total_clicks integer NOT NULL DEFAULT 0,
  mobile_clicks integer NOT NULL DEFAULT 0,
  desktop_clicks integer NOT NULL DEFAULT 0,
  source_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(affiliate_link_id, date)
);

-- Índices para daily_click_stats
CREATE INDEX IF NOT EXISTS daily_click_stats_link_date_idx ON public.daily_click_stats(affiliate_link_id, date DESC);

-- Habilitar RLS em daily_click_stats
ALTER TABLE public.daily_click_stats ENABLE ROW LEVEL SECURITY;

-- Políticas para daily_click_stats
DROP POLICY IF EXISTS "daily_click_stats select own" ON public.daily_click_stats;
CREATE POLICY "daily_click_stats select own" ON public.daily_click_stats
  FOR SELECT
  USING ((SELECT user_id FROM public.affiliate_links WHERE id = affiliate_link_id) = auth.uid());

