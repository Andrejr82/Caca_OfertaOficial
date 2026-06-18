CREATE TABLE IF NOT EXISTS public.ai_copy_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    offer_id UUID REFERENCES public.offers(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    winner_strategy TEXT,
    score NUMERIC,
    model TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.ai_copy_logs ENABLE ROW LEVEL SECURITY;
