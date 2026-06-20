-- Migração para suportar a sessão do WhatsApp (Baileys) diretamente no PostgreSQL
create table if not exists public.baileys_sessions (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Como isso é gerenciado exclusivamente pelo Engine (Worker Node via Service Role),
-- não precisamos abrir políticas de RLS para usuários (Client Auth).
-- Mas para segurança, mantemos a RLS ativa para evitar leituras acidentais caso a Anon Key seja usada:
alter table public.baileys_sessions enable row level security;

drop policy if exists "Deny all client access to baileys_sessions" on public.baileys_sessions;
create policy "Deny all client access to baileys_sessions"
  on public.baileys_sessions for all
  using (false)
  with check (false);
