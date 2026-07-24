-- Adiciona o status 'deferred' ao enum logico de offers

ALTER TABLE public.offers DROP CONSTRAINT IF EXISTS offers_status_check;

ALTER TABLE public.offers ADD CONSTRAINT offers_status_check 
CHECK (status in ('draft', 'pending_manual_review', 'selected', 'approved', 'posted', 'rejected', 'deferred'));
