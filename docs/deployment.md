# Deploy e operação atuais

<!-- docs-status: current -->
<!-- verified-against: 2cfa11f -->
<!-- verified-on: 2026-08-16 -->

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
- Builds Git automáticos prosseguem somente para `main`; branches deliberadas podem ser publicadas manualmente com `vercel --build-env VERCEL_FORCE_BUILD=1`.

## Supabase

- Aplicar migrations em ordem e registrar o SHA implantado.
- Verificar tabelas, funções/RPCs, constraints, RLS e buckets públicos/privados.
- Executar validações read-only antes de liberar ingestão.

## Oracle

- Validar overlay allowlisted e flags fail-closed antes de reiniciar PM2.
- Processos esperados incluem worker/scraper, API técnica e WhatsApp quando habilitado.
- Confirmar scheduler único, `noOverlap`, reachability, logs e SHA do checkout.
- O runtime dedicado do Radar está preparado no repositório, mas não deve ser iniciado até a task operacional correspondente. A ativação deve configurar `TRENDS_RADAR_DEDICATED_RUNTIME=true` no `oracle-scraper` e no novo processo de Radar na mesma janela, validar consumo exclusivo e manter rollback por flag.

## Liberação gradual

1. Deploy com publicação bloqueada.
2. Saúde, readiness e migrations.
3. Discovery controlada e persistência observada.
4. Geração limitada de drafts.
5. Aprovação manual e smoke test por canal.
6. Expansão somente com recibos e métricas saudáveis.

## Rollback

Reverter o artefato/commit e as flags primeiro. Migrations destrutivas exigem plano próprio; não presumir rollback automático do banco. Preservar logs, correlation IDs e recibos para investigação.

Para o Radar dedicado, o rollback operacional é parar o processo dedicado e remover/desabilitar `TRENDS_RADAR_DEDICATED_RUNTIME`; isso restaura o consumo pelo `oracle-scraper` sem alterar schema ou snapshots existentes.

## Trend Executive

A implementação de Trends não autoriza ativação produtiva. Antes de qualquer mudança futura de `TREND_EXECUTIVE_MODE`, exigir evidência shadow suficiente, readiness gate aprovado, coorte limitada, revisão técnica e autorização explícita. O rollback definido restaura `off` e `legacy_scenario`; nenhuma migration de Trends deve ser aplicada fora do procedimento operacional aprovado.
