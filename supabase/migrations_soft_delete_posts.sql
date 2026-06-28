-- Migration: Soft Delete para Posts
-- Data: 2026-06-28

-- 1. Adicionar colunas de controle de exclusão lógica
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id);

-- 2. Atualizar a constraint de check do status
-- O nome da constraint precisa ser descartado antes. Se o nome original for gerado dinamicamente e desconhecido, 
-- uma abordagem segura seria buscar e remover a constraint programaticamente. Mas o supabase geralmente usa o padrão:
-- table_column_check. Como foi definido in-line, o nome exato varia. 
-- Tentamos remover nomes padrão e recriar.
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.posts'::regclass 
    AND contype = 'c' 
    AND pg_get_constraintdef(oid) LIKE '%status%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.posts DROP CONSTRAINT ' || quote_ident(constraint_name);
  END IF;
END $$;

ALTER TABLE public.posts ADD CONSTRAINT posts_status_check CHECK (status IN ('draft', 'published', 'failed', 'deleted'));

-- 3. Criar índice na coluna status para acelerar as listagens que a excluem
CREATE INDEX IF NOT EXISTS posts_status_idx ON public.posts(status);
