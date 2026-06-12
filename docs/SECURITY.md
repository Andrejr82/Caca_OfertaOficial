# Security

## Env Local

Use `.env.local`. Nunca versionar `.env.local`, `.env` ou arquivos de produção.

## Vercel Environment Variables

Configure secrets no painel da Vercel. Não coloque tokens em código, README com valores reais ou logs.

## Supabase Auth

Use e-mail/senha no MVP. Configure URLs permitidas para localhost e produção.

## Supabase RLS

Execute `supabase/schema.sql`. Todas as tabelas privadas têm RLS e policies por `auth.uid()`.

## Service Role

`SUPABASE_SERVICE_ROLE_KEY` é server-side only. Não usar no frontend. No MVP, preferir não usar.

## Telegram Bot Token

`TELEGRAM_BOT_TOKEN` fica apenas em env server-side. Se vazar, revogue no BotFather e gere outro.

## Futuras APIs

- Shopee, Instagram e WhatsApp devem usar APIs oficiais.
- Não automatizar login.
- Não usar WhatsApp Web automatizado.
- Não contratar plano pago sem aprovação.

## Rotação

1. Revogue o token antigo.
2. Configure o novo token em `.env.local` e na Vercel.
3. Rode `npm run security:check`.
4. Faça novo deploy.
