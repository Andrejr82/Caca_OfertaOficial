-- MIGRATION: PRIVILÉGIOS DE USUÁRIOS E AUDITORIA
-- Execute este script no SQL Editor do seu painel Supabase para configurar a segurança da Fase 8.

-- 1. Estender a tabela public.profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role text DEFAULT 'viewer' CHECK (role IN ('admin', 'operator', 'viewer'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status text DEFAULT 'active' CHECK (status IN ('active', 'inactive'));

-- 2. Criar a tabela de Auditoria (public.audit_logs)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL, -- 'login', 'logout', 'create_user', 'edit_user', 'delete_offer', etc.
  target_user_id uuid,
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Habilitar Row Level Security (RLS) na tabela de auditoria
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 4. Criar políticas RLS para audit_logs
DROP POLICY IF EXISTS "audit_logs select own" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs insert own" ON public.audit_logs;

-- Permite que o próprio usuário ou qualquer Administrador veja os logs
CREATE POLICY "audit_logs select own" ON public.audit_logs 
  FOR SELECT 
  USING (auth.uid() = user_id OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- Permite que qualquer usuário autenticado insira logs (logs de login/logout)
CREATE POLICY "audit_logs insert own" ON public.audit_logs 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id OR auth.uid() IS NOT NULL);

-- 5. Atualizar políticas de profiles para permitir que admins gerenciem outros perfis
DROP POLICY IF EXISTS "profiles admin manage all" ON public.profiles;
CREATE POLICY "profiles admin manage all" ON public.profiles
  FOR ALL
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');
