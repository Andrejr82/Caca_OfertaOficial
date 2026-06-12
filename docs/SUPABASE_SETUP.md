# Supabase Setup

## Plano

Use Supabase Free. Não configure add-ons pagos para o MVP.

## Projeto

1. Crie um projeto Supabase.
2. Copie `Project URL` para `NEXT_PUBLIC_SUPABASE_URL`.
3. Copie `anon public` para `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Não exponha `service_role`.

## Schema

Abra SQL Editor e execute:

```sql
-- conteúdo de supabase/schema.sql
```

Confirme:

- Tabelas criadas.
- RLS ativo.
- Policies por `auth.uid()`.
- Índices criados.

## Auth

1. Em Authentication, ative e-mail/senha.
2. Configure URL do site local: `http://localhost:3000`.
3. Em produção, adicione a URL da Vercel.

## Storage

Crie bucket privado:

```text
offer-images
```

Estrutura recomendada:

```text
{user_id}/{offer_id}/{filename}
```

No MVP, imagens podem ser URLs externas. Upload via Storage fica preparado para fase futura.
