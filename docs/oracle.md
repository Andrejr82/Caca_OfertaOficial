# Oracle Cloud — operação atual

<!-- docs-status: current -->
<!-- verified-against: 7f35e0d2c0ca22e118b8163a73d18a1c7d995439 -->
<!-- verified-on: 2026-08-27 -->

Fonte canônica de arquitetura: [architecture-current.md](architecture-current.md).

## Estado auditado em 27/08/2026

Checkout produtivo:

- caminho: `/home/ubuntu/Caca_OfertaOficial`;
- branch: `main`;
- HEAD: `7f35e0d2c0ca22e118b8163a73d18a1c7d995439`;
- working tree: limpa;
- `FIRST_DISCOVERY_QUALITY_V1_MODE=active`.

Processos PM2 observados:

| Processo | Estado |
|---|---|
| `oracle-scraper` | online |
| `oracle-api` | online |
| `whatsapp-bot` | online |
| `oracle-trends-radar` | online |
| `authorized-reel-verifier` | online |
| `video-worker` | online |
| `shopee-feed-sync` | stopped |

A ativação da First Discovery exigiu somente um restart do `oracle-scraper`; não houve crash loop nem erro de startup.

## Scheduler

Cron canônico:

```text
0 6,8,10,12,14,16,18 * * *
```

- timezone: `America/Sao_Paulo`;
- `noOverlap=true`;
- único scheduler: `oracle-scraper`;
- sem Discovery automático no startup, salvo `--run-now`;
- `cupons_aprovados_editorial` permanece `manual_only`.

Grade ativa:

- 06h Casa/Cozinha/Organização
- 08h Beleza
- 10h Informática
- 12h Moda
- 14h Ferramentas
- 16h Pet
- 18h Eletrodomésticos

## First Discovery Quality V1

Em produção, `FIRST_DISCOVERY_QUALITY_V1_MODE=active`.

O modo ativo:

- usa intenções refinadas por nicho/marketplace;
- rejeita candidatos inelegíveis;
- prioriza candidatos fortes;
- não faz backfill artificial com fracos quando não há fortes suficientes;
- não dispara adaptive discovery automaticamente quando readiness falha.

### Limitação conhecida

O runtime ainda pode terminar um marketplace sem candidatos quando a primeira cobertura falha. Em auditoria de `moda_editorial`:

- Mercado Livre encerrou vazio com cobertura de domínio insuficiente;
- Shopee foi bloqueada antes da extração por `coverageInsufficient` associado a categorias amplas.

Isso é tratado como lacuna de discovery, não como ausência de produtos no marketplace. O objetivo operacional futuro é aprofundar a busca automaticamente com segurança antes de aceitar resultado zero.

## Execução manual

`--run-now` executa um ciclo imediato. Antes de usá-lo em produção, confirmar que não existe outro ciclo ativo para evitar concorrência.

Execuções locais não representam a Oracle se SHA e flags forem diferentes. O ciclo local auditado em 27/08/2026 registrou release `e157df09f0d8deb53a65a8f48376c89d9cdcdef1`, diferente do HEAD produtivo `7f35e0d2...`.

## Radar

- processo PM2: `oracle-trends-radar`;
- `TRENDS_RADAR_DEDICATED_RUNTIME=true`;
- `TREND_EXECUTIVE_MODE=off`;
- `oracle-scraper` não consome Radar no ciclo editorial;
- polling 30s;
- lock `/tmp/caca-oferta-trends-radar.lock`.

## Oracle API e WhatsApp

- `oracle-api`: porta 3002;
- `whatsapp-bot`: porta 3001.

## Regra operacional

Antes de qualquer alteração na VPS:

1. comparar HEAD da Oracle com `origin/main`;
2. confirmar working tree limpa;
3. revisar PM2 e flags efetivas;
4. preservar logs antes de restart/rollback;
5. evitar Discovery manual ou write manual no Supabase durante diagnóstico read-only.