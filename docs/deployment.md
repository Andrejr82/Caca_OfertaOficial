# Deploy e operação atuais

<!-- docs-status: current -->
<!-- verified-against: 61ce6d2 -->
<!-- verified-on: 2026-08-11 -->

## Pré-deploy

```bash
npm ci
npm run docs:audit
npm run verify
```

Confirme migrations, variáveis por ambiente, overlays Oracle e compatibilidade dos contratos. Não transporte `.env` pelo repositório.

## Vercel

- Executa o painel Next.js, APIs e integrações server-side.
- Validar build, variáveis, cron declarado em `vercel.json`, `/api/health` e `/api/readiness`.
- Confirmar que rotas de publicação exigem autenticação e entidades oficiais.

## Supabase

- Aplicar migrations em ordem e registrar o SHA implantado.
- Verificar tabelas, funções/RPCs, constraints, RLS e buckets públicos/privados.
- Executar validações read-only antes de liberar ingestão.

## Oracle

- Validar overlay allowlisted e flags fail-closed antes de reiniciar PM2.
- Processos esperados incluem worker/scraper, API técnica e WhatsApp quando habilitado.
- Confirmar scheduler único, `noOverlap`, reachability, logs e SHA do checkout.

## Liberação gradual

1. Deploy com publicação bloqueada.
2. Saúde, readiness e migrations.
3. Discovery controlada e persistência observada.
4. Geração limitada de drafts.
5. Aprovação manual e smoke test por canal.
6. Expansão somente com recibos e métricas saudáveis.

## Rollback

Reverter o artefato/commit e as flags primeiro. Migrations destrutivas exigem plano próprio; não presumir rollback automático do banco. Preservar logs, correlation IDs e recibos para investigação.

## Trend Executive

A implementação de Trends não autoriza ativação produtiva. Antes de qualquer mudança futura de `TREND_EXECUTIVE_MODE`, exigir evidência shadow suficiente, readiness gate aprovado, coorte limitada, revisão técnica e autorização explícita. O rollback definido restaura `off` e `legacy_scenario`; nenhuma migration de Trends deve ser aplicada fora do procedimento operacional aprovado.
