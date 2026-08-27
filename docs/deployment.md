# Deploy e operação atuais

<!-- docs-status: current -->
<!-- verified-against: 7f35e0d2c0ca22e118b8163a73d18a1c7d995439 -->
<!-- verified-on: 2026-08-27 -->

## Pré-deploy

```bash
npm ci
npm run docs:audit
npm run verify
```

Confirme migrations, variáveis por ambiente, overlays Oracle e compatibilidade dos contratos. Não transporte `.env` pelo repositório.

## Vercel

A `main` contém:

- `f68512c56617680247f73d7cc3523f1e9de92892` — correção da Publicação Expressa após Copy V5;
- `7f35e0d2c0ca22e118b8163a73d18a1c7d995439` — First Discovery Quality V1.

Validar build, `/api/health` e `/api/readiness` após deploy.

## Oracle

Estado confirmado em 27/08/2026:

```text
branch=main
HEAD=7f35e0d2c0ca22e118b8163a73d18a1c7d995439
working-tree=clean
FIRST_DISCOVERY_QUALITY_V1_MODE=active
oracle-scraper=online
crash-loop=false
startup-errors=none
```

A ativação foi feita com um único restart do `oracle-scraper`. Nenhum outro processo precisou ser reiniciado.

Antes de qualquer nova alteração:

1. comparar SHA da VPS com `origin/main`;
2. confirmar working tree limpa;
3. validar PM2 e flags efetivas;
4. preservar logs;
5. evitar ciclos manuais concorrentes.

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

### Lacuna atual de operação

A proteção de qualidade já está ativa, mas o aprofundamento automático de discovery ainda não está ligado ao executor. Em cenários de cobertura insuficiente, ML/Shopee podem terminar zerados antes de esgotar alternativas reais do marketplace.

Essa condição deve ser observada como falha de cobertura/discovery, não como evidência de ausência de produtos.

## Radar

- `TRENDS_RADAR_DEDICATED_RUNTIME=true`;
- `TREND_EXECUTIVE_MODE=off`;
- `oracle-trends-radar` dedicado;
- `oracle-scraper` sem consumo de Radar.

## Rollback geral

Para regressão relacionada à First Discovery, a contenção inicial é retornar a flag a `off` e reiniciar somente `oracle-scraper`. Rollback de código deve ser decidido separadamente após diagnóstico.