# Vercel Deploy

## Plano

Use Vercel Hobby.

## Deploy

1. Suba o repositório para GitHub Free.
2. Importe o projeto na Vercel.
3. Framework: Next.js.
4. Configure environment variables.
5. Execute deploy.

## Variáveis

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHANNEL_ID=@caca_ofertaoficial
NEXT_PUBLIC_APP_NAME=Caça Oferta Oficial
NEXT_PUBLIC_INSTAGRAM_USERNAME=caca.ofertaoficial
NEXT_PUBLIC_TELEGRAM_NAME=Caça Oferta Oficial
NEXT_PUBLIC_TELEGRAM_URL=https://t.me/caca_ofertaoficial
```

`SUPABASE_SERVICE_ROLE_KEY` deve ficar vazio no MVP, salvo necessidade server-side futura.

## Diagnóstico

- Build falhou por env: confirme Supabase URL e anon key.
- Login redireciona sempre: confirme Auth e URLs permitidas.
- Telegram falha: confirme bot como administrador do canal.
