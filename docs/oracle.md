# Oracle Cloud — operação atual

<!-- docs-status: current -->
<!-- verified-against: e16ce0d1ae525b3f0f9fd95e6554cc62b5c6a0d7 -->
<!-- verified-on: 2026-08-25 -->

Fonte canônica de arquitetura: [architecture-current.md](architecture-current.md).

## Estado auditado em 25/08/2026

A auditoria read-only confirmou o checkout em `/home/ubuntu/Caca_OfertaOficial`, branch `main`, SHA `febe66abb28bd47c738d925befc50ad365c59371`, working tree limpo.

Processos PM2 online:

| Processo | Script | Função |
|---|---|---|
| `oracle-scraper` | `scripts/oracle-scraper.cjs` | Scheduler e Discovery |
| `oracle-api` | `scripts/oracle-api.cjs` | Gateway técnico na porta 3002 |
| `whatsapp-bot` | `scripts/whatsapp-engine.cjs` | Motor Baileys na porta 3001 |
| `oracle-trends-radar` | `scripts/oracle-trends-radar-worker.cjs` | Worker dedicado do Radar |
| `authorized-reel-verifier` | processo auxiliar | verificação de Reels autorizados |
| `video-worker` | worker de vídeo | processamento de vídeo |

`shopee-feed-sync` estava parado.

## Scheduler

Cron canônico:

```text
0 6,8,10,12,14,16,18 * * *
```

- timezone: `America/Sao_Paulo`
- `noOverlap`: `true`
- um único scheduler dentro de `oracle-scraper`
- sem Discovery automático no startup, salvo `--run-now`
- Cupons 22h permanece `manual_only`

Grade ativa:

- 06h Casa/Cozinha/Organização
- 08h Beleza
- 10h Informática
- 12h Moda
- 14h Ferramentas
- 16h Pet
- 18h Eletrodomésticos

## Radar

- processo PM2: `oracle-trends-radar`
- `TRENDS_RADAR_DEDICATED_RUNTIME=true`
- `TREND_EXECUTIVE_MODE=off`
- `oracle-scraper` não consome Radar no ciclo editorial
- polling de 30s
- lock local `/tmp/caca-oferta-trends-radar.lock`

O worker dedicado já é parte do runtime produtivo auditado; documentação que o trate como futuro está obsoleta.

## Oracle API e WhatsApp

`oracle-api` opera em `:3002`, com `GET /ping` e `POST /api/scrape` autenticado por `ORACLE_API_KEY`.

`whatsapp-bot` opera em `:3001`, supervisionado por PM2 e autenticado por `x-api-key`.

## Capacity Hunter

- `oracle-capacity-hunter.timer`: ativo, a cada 30 minutos, `America/Sao_Paulo`
- `oracle-capacity-hunter.service`: `failed` na auditoria por ausência de `apps/oracle-capacity-hunter/.env`
- comportamento: passivo/read-only; não reinicia serviços automaticamente

## Regra operacional

Antes de qualquer alteração na VPS, comparar o SHA do checkout com a `main`, confirmar working tree limpo e revisar PM2/flags. Não executar Discovery, restart, mudança de `.env` ou escrita no Supabase apenas para diagnóstico.
