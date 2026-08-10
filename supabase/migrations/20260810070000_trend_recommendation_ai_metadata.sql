-- Tendências IA: metadata da recomendação e replay idempotente.
alter table public.trend_recommendations
  add column if not exists confidence numeric(5,2),
  add column if not exists strategy_version text,
  add column if not exists ai_provider text,
  add column if not exists ai_model text;

update public.trend_recommendations
set strategy_version = 'trend-channel-format-v1'
where strategy_version is null;

alter table public.trend_recommendations
  alter column strategy_version set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.trend_recommendations'::regclass
      and conname = 'trend_recommendations_contract_values_check'
  ) then
    alter table public.trend_recommendations
      add constraint trend_recommendations_contract_values_check check (
        (channel is null or channel in ('WhatsApp', 'Telegram', 'Instagram', 'Facebook'))
        and (format is null or format in ('imagem', 'carrossel', 'vídeo'))
        and (confidence is null or (confidence >= 0 and confidence <= 100))
      );
  end if;
end $$;

create unique index if not exists trend_recommendations_user_opportunity_strategy_idx
  on public.trend_recommendations(user_id, opportunity_id, strategy_version);
