# Caça Oferta Oficial

Plataforma web para automação de ofertas de afiliados, com foco inicial em Shopee, Telegram, Instagram e WhatsApp.

## Canais Oficiais

- Instagram: caca.ofertaoficial
- Telegram: Caça Oferta Oficial
- Telegram URL: https://t.me/caca_ofertaoficial

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase Free: Auth, Postgres, Storage e RLS
- Vercel Hobby
- Telegram Bot API
- Instagram e WhatsApp semiautomáticos no MVP

O projeto Python/Streamlit anterior foi preservado como legado de referência. A stack principal agora é a aplicação Next.js na raiz.

## Rodar Local

```bash
npm install
cp .env.example .env.local
npm run dev
```

Configure no `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHANNEL_ID=@caca_ofertaoficial
```

Não versionar `.env.local`.

## Supabase

1. Crie um projeto no plano Free.
2. Execute `supabase/schema.sql` no SQL Editor.
3. Ative Auth por e-mail/senha.
4. Crie o bucket privado `offer-images`.
5. Confirme que RLS está ativo nas tabelas.

Detalhes em `docs/SUPABASE_SETUP.md`.

## Telegram

1. Crie um bot no BotFather.
2. Adicione o bot ao canal Caça Oferta Oficial.
3. Promova o bot a administrador.
4. Configure `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHANNEL_ID`.
5. Use a página Telegram para testar conexão e publicar ofertas aprovadas.

Detalhes em `docs/TELEGRAM_SETUP.md`.

## Testes e Verificação

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run security:check
npm run verify
```

`npm run verify` executa lint, typecheck, testes, build e security check.

## Deploy Vercel

Use Vercel Hobby e configure as variáveis de ambiente no painel do projeto. Veja `docs/VERCEL_DEPLOY.md`.

## Segurança

- Nunca coloque secrets no código.
- Use apenas anon key no frontend.
- Não use `SUPABASE_SERVICE_ROLE_KEY` no client.
- Telegram token é somente server-side.
- Instagram e WhatsApp não usam automação não oficial no MVP.

Veja `docs/SECURITY.md`.
