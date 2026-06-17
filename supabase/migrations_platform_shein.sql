-- MIGRATION: ADICIONAR PLATAFORMA SHEIN NA TABELA DE OFERTAS
-- Execute este script no SQL Editor do seu painel Supabase para aplicar a mudança.

-- 1. Dropar a constraint antiga se existir
ALTER TABLE public.offers DROP CONSTRAINT IF EXISTS offers_platform_check;

-- 2. Adicionar a nova constraint atualizada que inclui a Shein
ALTER TABLE public.offers ADD CONSTRAINT offers_platform_check 
  CHECK (platform IN ('Shopee', 'Amazon', 'Magalu', 'Mercado Livre', 'Shein', 'Outro'));
