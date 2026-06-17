-- =======================================================
-- MIGRATION: HARDENING DE BANCO DE DADOS & RETENÇÃO DE LOGS
-- =======================================================

-- 1. Criação do índice composto na tabela public.offers
-- Otimiza a busca e prevenção de ofertas duplicadas por usuário durante o scraping
create index if not exists offers_user_url_idx on public.offers(user_id, original_url);

-- 2. Criação da função de retenção de logs antigos
-- Remove logs de integração com mais de 30 dias para otimizar espaço e custo
create or replace function public.clean_old_integration_logs()
returns void as $$
begin
  delete from public.integration_logs
  where created_at < now() - interval '30 days';
end;
$$ language plpgsql security definer;

-- 3. (Opcional) Criação de índice para otimizar a própria consulta de deleção de logs por idade
create index if not exists integration_logs_created_at_idx on public.integration_logs(created_at);
