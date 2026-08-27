# Runbook de scripts da Oracle

<!-- docs-status: current -->
<!-- verified-against: 7f35e0d2c0ca22e118b8163a73d18a1c7d995439 -->
<!-- verified-on: 2026-08-27 -->

Guia operacional da VPS Oracle. Não coloque tokens, chaves ou valores de `.env` neste arquivo.

## 1. Estado esperado

Projeto remoto:

```text
/home/ubuntu/Caca_OfertaOficial
```

Estado produtivo confirmado em 27/08/2026:

```text
branch=main
HEAD=7f35e0d2c0ca22e118b8163a73d18a1c7d995439
FIRST_DISCOVERY_QUALITY_V1_MODE=active
oracle-scraper=online
working-tree=clean
```

Antes de qualquer ação:

```bash
pwd
git branch --show-current
git rev-parse HEAD
git status --short
pm2 status
pm2 jlist
```

## 2. Processos PM2

Esperados:

- `oracle-scraper`
- `oracle-api`
- `whatsapp-bot`
- `oracle-trends-radar`
- `authorized-reel-verifier`
- `video-worker`

`shopee-feed-sync` está parado no estado auditado.

Logs read-only:

```bash
pm2 logs oracle-scraper --raw --lines 100 --nostream
pm2 logs oracle-api --raw --lines 100 --nostream
pm2 logs whatsapp-bot --raw --lines 100 --nostream
pm2 logs oracle-trends-radar --raw --lines 100 --nostream
```

## 3. Scheduler e cenários válidos

Cron:

```text
0 6,8,10,12,14,16,18 * * *
```

Timezone: `America/Sao_Paulo`. `noOverlap=true`.

Cenários automáticos:

```text
casa_cozinha_editorial
beleza_editorial
informatica_editorial
moda_editorial
ferramentas_editorial
pet_editorial
eletrodomesticos_editorial
```

`cupons_aprovados_editorial` é `manual_only`.

## 4. First Discovery Quality V1

Produção Oracle:

```text
FIRST_DISCOVERY_QUALITY_V1_MODE=active
```

O default do código continua `off`; o ambiente produtivo sobrescreve para `active`.

No modo ativo:

- intents refinadas são consumidas;
- candidatos inelegíveis não persistem;
- strong tem prioridade;
- zero strong não deve gerar backfill artificial com weak;
- `readiness=false` não dispara adaptive discovery automaticamente.

### Limitação operacional atual

Resultado zero em ML/Shopee não deve ser interpretado como catálogo vazio. A auditoria de Moda em 27/08/2026 mostrou:

- ML pode terminar vazio quando a resolução de domínios não forma cobertura suficiente;
- Shopee pode bloquear a extração quando categorias amplas causam `coverageInsufficient`;
- ainda não existe aprofundamento automático de rede conectado ao adaptive fallback.

## 5. Execução manual

Na Oracle, somente quando explicitamente autorizado e sem outro ciclo em execução:

```bash
cd /home/ubuntu/Caca_OfertaOficial
node scripts/oracle-scraper.cjs --run-now --scenario moda_editorial
```

Em PowerShell local, dentro do repositório:

```powershell
node .\scripts\oracle-scraper.cjs --run-now --scenario moda_editorial
```

A execução local só é comparável à produção se `git rev-parse HEAD` e as flags relevantes forem equivalentes à Oracle.

## 6. Radar dedicado

- PM2 `oracle-trends-radar` online;
- `TRENDS_RADAR_DEDICATED_RUNTIME=true`;
- `TREND_EXECUTIVE_MODE=off`;
- polling 30s;
- lock `/tmp/caca-oferta-trends-radar.lock`;
- `oracle-scraper` não consome Radar no ciclo editorial.

## 7. WhatsApp e Oracle API

- `whatsapp-bot` → porta 3001;
- `oracle-api` → porta 3002.

## 8. Checklist antes/depois de intervenção

1. SHA da VPS comparado com `origin/main`.
2. Working tree limpa.
3. PM2 saudável.
4. Cron/timezone confirmados.
5. Flag First Discovery confirmada.
6. Nenhum cenário legado ativado.
7. Radar com autoridade única.
8. Sem write manual no Supabase durante diagnóstico read-only.
9. Preservar logs antes de restart/rollback.

## 9. Rollback

Se uma mudança de First Discovery causar crash ou erro estrutural de startup, a primeira contenção é retornar somente a flag a `off` e reiniciar somente `oracle-scraper`; rollback de código exige análise separada.