# Estado operacional do release — 28/07/2026

## Fonte verificada

Esta fotografia foi reconciliada com o código da `main` no commit `0ce37140e4ca014c0ca8c569288e9db8a1524c99` (`fix(publish): redirect express links to monetized destination`). Em qualquer deploy posterior, o SHA do checkout, o manifesto `.runtime-release.json` e os hashes dos arquivos Oracle devem ser conferidos novamente.

## Runtime atual

- **Vercel/Next.js:** painel, APIs, Official AI, curadoria, Publicação Expressa e transportes oficiais.
- **Supabase:** ofertas, links afiliados, posts, logs, estados e configurações.
- **Oracle/PM2:** `oracle-scraper`, `oracle-api` e `whatsapp-bot`.
- **Discovery-Only:** Shopee, Mercado Livre e Amazon.
- **Capacidades separadas:** Shein, Magalu e Netshoes possuem integrações, mas não fazem parte do ciclo Discovery-Only homologado.
- **Scheduler:** seis execuções diárias em `America/Sao_Paulo`: 00:00, 04:00, 08:00, 12:00, 16:00 e 20:00. O `noOverlap` impede ciclos simultâneos no mesmo processo.

## Regras operacionais atuais

1. Candidatos devem passar por identidade nativa, monetização, URL, qualidade e deduplicação antes da persistência oficial.
2. Links de afiliado são persistidos por canal; UUIDs não podem ser truncados nem ter prefixos trocados por fallback.
3. A Publicação Expressa confirma o produto e a monetização antes de gerar copy.
4. O Instagram usa “link na bio” na copy; Telegram, WhatsApp e Facebook usam seus próprios links rastreados persistidos.
5. Nenhuma limpeza histórica ou migração destrutiva faz parte deste release.

## Limites da fotografia

- Status online de Vercel, Oracle, PM2 e Supabase não é inferido apenas pelo checkout; deve ser confirmado no ambiente correspondente.
- Os documentos `docs/PMAV5/` registram auditorias, decisões e snapshots históricos. Eles continuam válidos como evidência da época, mas não substituem este estado operacional nem o código homologado mais recente.
- `.env.example` documenta nomes e defaults seguros. Os valores reais permanecem apenas no ambiente de execução.

## Procedimento de release

Antes de qualquer atualização da Oracle:

```powershell
git fetch origin
git rev-parse HEAD
git rev-parse origin/main
node scripts/update-oracle.js
```

Depois, validar o manifesto, os SHA-256 dos scripts, imports Node e `pm2 status`. Não reiniciar ou manter o scraper online quando os hashes divergirem.
