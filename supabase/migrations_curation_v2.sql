-- Adiciona colunas do Motor de Curadoria V2 na tabela offers

ALTER TABLE public.offers
ADD COLUMN IF NOT EXISTS legacy_score numeric(4,2) CHECK (legacy_score IS NULL OR (legacy_score >= 0 AND legacy_score <= 10)),
ADD COLUMN IF NOT EXISTS new_score numeric(4,2) CHECK (new_score IS NULL OR (new_score >= 0 AND new_score <= 10)),
ADD COLUMN IF NOT EXISTS explainability jsonb DEFAULT '{}'::jsonb;

-- Cria um indice na coluna de new_score para futuras análises de performance da IA
CREATE INDEX IF NOT EXISTS offers_new_score_idx ON public.offers(new_score DESC);
