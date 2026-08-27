# Runbook de scripts da Oracle

<!-- docs-status: current -->
<!-- verified-against: 2447c01c25871c76c96242cd4dfda35d7b1a7873 -->
<!-- verified-on: 2026-08-27 -->

Guia operacional da VPS Oracle. Não coloque tokens, chaves ou valores de `.env` neste arquivo.

## 1. Acesso e estado

Projeto remoto:

```text
/home/ubuntu/Caca_OfertaOficial
```

Projeto local auditado:

```text
C:\Projetos_GitHub\Projeto_Oficial\Caca_OfertaOficial
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

## 2. Processos PM2 auditados

Esperados no baseline de 25/08/2026:

- `oracle-scraper`
- `oracle-api`
- `whatsapp-bot`
- `oracle-trends-radar`
- `authorized-reel-verifier`
- `video-worker`

`shopee-feed-sync` estava parado.

Logs read-only:

```bash
pm2 logs oracle-scraper --raw --lines 100 --nostream
pm2 logs oracle-api --raw --lines 100 --nostream
pm2 logs whatsapp-bot --raw --lines 100 --nostream
pm2 logs oracle-trends-radar --raw --lines 100 --nostream
```

## 3. Scheduler e cenários válidos

Cron esperado:

```text
0 6,8,10,12,14,16,18 * * *
```

Timezone: `America/Sao_Paulo`. `noOverlap=true`.

Cenários automáticos válidos:

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

Não usar em comandos novos:

```text
organizacao_editorial
celulares_editorial
esporte_editorial
tv_audio_editorial
moveis_editorial
grandes_ofertas_editorial
eletros_cozinha
enxoval_casamento
```

Exemplo de diagnóstico dry-run somente quando autorizado:

```bash
cd /home/ubuntu/Caca_OfertaOficial
node scripts/oracle-scraper.cjs --mercadolivre-official-intents-dry-run --scenario beleza_editorial
```

Não executar variantes `record`, execução sem flag ou `--run-now` como teste exploratório.

## 4. Radar dedicado

Baseline auditado:

- PM2 `oracle-trends-radar` online
- `TRENDS_RADAR_DEDICATED_RUNTIME=true`
- `TREND_EXECUTIVE_MODE=off`
- polling 30s
- lock `/tmp/caca-oferta-trends-radar.lock`
- `oracle-scraper` não consome Radar no ciclo editorial

Não iniciar segundo worker e não remover lock sem confirmar ausência de processo concorrente.

## 5. WhatsApp e Oracle API

- `whatsapp-bot` → `scripts/whatsapp-engine.cjs`, porta 3001
- `oracle-api` → `scripts/oracle-api.cjs`, porta 3002

Restart, limpeza de sessão, QR e qualquer ação que possa afetar produção exigem autorização operacional específica.

## 6. Capacity Hunter

```bash
systemctl status oracle-capacity-hunter.service
systemctl status oracle-capacity-hunter.timer
```

Baseline de 25/08/2026:

- timer ativo a cada 30 minutos
- service falhou por ausência de `apps/oracle-capacity-hunter/.env`
- monitoramento passivo/read-only, sem restart automático

## 7. Checklist antes/depois de intervenção

1. SHA da VPS comparado com `main`.
2. Working tree limpo.
3. Quantidade correta de processos PM2.
4. Cron/timezone confirmados.
5. Nenhum cenário legado ativado.
6. Cupons permanece manual.
7. Radar com autoridade única.
8. Nenhum Discovery manual ou write no Supabase durante diagnóstico read-only.
9. Preservar logs antes de restart/rollback.

## 8. Rollback

Não seguir instruções antigas que presumam Radar acoplado ao scraper. Antes de rollback do Radar, confirmar qual consumidor ficará autorizado e garantir exatamente uma autoridade de execução.
