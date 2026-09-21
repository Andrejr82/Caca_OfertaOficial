# Deploy e operação atuais

<!-- docs-status: current -->
<!-- verified-against: 5df6fe73 -->
<!-- verified-on: 2026-09-21 -->

## Pré-deploy

```bash
npm ci
npm run docs:audit
npm test
npm run build
npm run verify
```

Confirme migrations, variáveis por ambiente, overlays Oracle e compatibilidade dos contratos. Não transporte `.env` pelo repositório.

## Vercel

A branch `main` é a fonte canônica de produção.

- Build Next.js 15 App Router com verificação rigorosa de TypeScript (0 erros).
- `vercel.json` configurado com `ignoreCommand` para focar na `main`.
- 51 variáveis ativas no painel da Vercel (25 obsoletas excluídas).
- Deployment de produção verificado: `dpl_EqbJs2EYFdjZd1f1mLVVMtKnCYwa` em status `READY`.

Validar build, `/api/health` e `/api/readiness` após deploy.

Na Publicação Expressa, valide a identidade nativa do produto antes de aceitar metadados retornados por adaptadores externos.

## Oracle Cloud VPS (`193.122.242.178`)

Estado confirmado em 21/09/2026:

```text
branch=main
HEAD=5df6fe73
working-tree=clean
FIRST_DISCOVERY_QUALITY_V1_MODE=active
pm2-processes=6 online
storage-free=29 GB (+1.0 GB liberado)
```

Processos operacionais no PM2:
1. `oracle-api` (Porta `:3002`) — Gateway REST para automações e Vercel.
2. `whatsapp-bot` (Porta `:3001`) — Motor Baileys estável.
3. `oracle-scraper` — Scheduler de discovery dos 7 nichos canônicos.
4. `oracle-trends-radar` — Radar autônomo de tendências.
5. `video-worker` — Worker de renderização/dublagem.
6. `authorized-reel-verifier` — Verificador de autorização.

Procedimento de atualização:

```bash
cd /home/ubuntu/Caca_OfertaOficial
git pull origin main
git log -n 1 --oneline
pm2 restart oracle-scraper oracle-api oracle-trends-radar video-worker
```

## Scheduler

```text
0 6,8,10,12,14,16,18 * * *
```

Timezone: `America/Sao_Paulo`; `noOverlap=true`.

## Rollout First Discovery

O rollout está atualmente em `active` na Oracle.

Guardrails:

- ineligible não persiste;
- strong tem prioridade;
- zero strong não faz backfill artificial;
- readiness insuficiente não dispara adaptive discovery automaticamente.

## Radar

- `TRENDS_RADAR_DEDICATED_RUNTIME=true`;
- `TREND_EXECUTIVE_MODE=off`;
- `oracle-trends-radar` dedicado;
- `oracle-scraper` sem consumo de Radar.

## Rollback geral

Para regressão relacionada à First Discovery, a contenção inicial é retornar a flag a `off` e reiniciar somente `oracle-scraper`. Rollback de código deve ser decidido separadamente após diagnóstico. Snapshot de segurança da VPS salvo em `/home/ubuntu/backup_caca_oferta_pre_sync_20260921.tar.gz`.
