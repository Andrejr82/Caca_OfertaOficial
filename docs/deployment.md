# Deploy e operação atuais

<!-- docs-status: current -->
<!-- verified-against: e16ce0d1ae525b3f0f9fd95e6554cc62b5c6a0d7 -->
<!-- verified-on: 2026-08-25 -->

## Pré-deploy

```bash
npm ci
npm run docs:audit
npm run verify
```

Confirme migrations, variáveis por ambiente, overlays Oracle e compatibilidade dos contratos. Não transporte `.env` pelo repositório.

## Vercel

- Executa o painel Next.js, APIs e integrações server-side.
- Validar build, variáveis, `/api/health` e `/api/readiness`.
- Confirmar que rotas de publicação exigem autenticação e entidades oficiais.

## Supabase

- Aplicar migrations em ordem e registrar o SHA implantado.
- Verificar tabelas, RPCs, constraints, RLS e buckets.
- Executar validações read-only antes de liberar ingestão.

## Oracle

Antes de qualquer alteração:

1. comparar o SHA da VPS com a `main`;
2. confirmar `git status --short` limpo;
3. validar PM2 e flags efetivas;
4. não executar Discovery manual sem autorização explícita.

Estado auditado em 25/08/2026:

- `oracle-scraper`, `oracle-api`, `whatsapp-bot`, `oracle-trends-radar`, `authorized-reel-verifier` e `video-worker` online;
- scheduler `0 6,8,10,12,14,16,18 * * *` em `America/Sao_Paulo`, `noOverlap=true`;
- Cupons 22h `manual_only`;
- `TRENDS_RADAR_DEDICATED_RUNTIME=true`;
- `TREND_EXECUTIVE_MODE=off`;
- `oracle-scraper` não consome Radar no ciclo editorial;
- VPS auditada no SHA `febe66abb28bd47c738d925befc50ad365c59371`.

O processo dedicado do Radar **já está ativo**. Não use instruções antigas que tratem esse worker como futuro ou não implantado.

## Radar — rollback

Como o runtime dedicado está ativo, rollback não deve assumir automaticamente que o `oracle-scraper` voltará a consumir Radar apenas ao desligar a flag. Antes de qualquer rollback:

1. validar no código/ambiente qual consumidor ficará autorizado;
2. garantir autoridade única;
3. parar/reconfigurar somente o processo relacionado;
4. confirmar lock/processos e logs;
5. manter `TREND_EXECUTIVE_MODE=off` salvo autorização específica.

Não executar rollback de Radar apenas com base em documentação histórica.

## Capacity Hunter

Na auditoria, `oracle-capacity-hunter.timer` estava ativo a cada 30 minutos; o service estava `failed` por ausência de `apps/oracle-capacity-hunter/.env`. O mecanismo é passivo e não reinicia serviços automaticamente.

## Liberação gradual

1. Deploy com publicação bloqueada quando aplicável.
2. Saúde, readiness e migrations.
3. Discovery controlada e persistência observada.
4. Geração limitada de drafts.
5. Aprovação manual e smoke test por canal.
6. Expansão somente com recibos e métricas saudáveis.

## Rollback geral

Reverter artefato/commit e flags primeiro. Migrations destrutivas exigem plano próprio. Preservar logs, correlation IDs e recibos para investigação.
