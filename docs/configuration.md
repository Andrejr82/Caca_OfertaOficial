# Configuração

<!-- docs-status: current -->
<!-- verified-against: cffd8dd3e783538e78a28a0450475fe140414a78 -->
<!-- verified-on: 2026-08-27 -->

## Princípios

- `.env.example` é o inventário seguro; valores reais ficam em `.env.local`, Vercel, Oracle/PM2 ou secret store.
- Flags novas entram desligadas/fail-closed quando controlam discovery, persistência, IA ou publicação.
- O default do código não substitui o estado operacional do ambiente; documentação de produção deve registrar ambos.

## First Discovery Quality V1

`FIRST_DISCOVERY_QUALITY_V1_MODE` aceita:

- `off`: comportamento legado;
- `shadow`: calcula plano, candidate quality e readiness sem alterar fila/persistência;
- `active`: aplica intents refinadas, gate de elegibilidade e prioridade absoluta para candidatos fortes.

Estado atual:

```text
code_default=off
oracle_production=active
```

No modo `active`, zero candidatos fortes não deve gerar backfill artificial com candidatos weak. `readiness=false` não dispara automaticamente uma nova busca; o adaptive fallback continua desacoplado do executor.

## Marketplaces

Cada marketplace possui estratégia própria por nicho:

- Amazon: Browse Node + intenção forte;
- Mercado Livre: `official-domain-then-catalog`, Best Seller quando disponível;
- Shopee: categoria nativa + intenção forte, evitando categoria ampla isolada.

### Limitação conhecida

A política de qualidade está ativa, mas o mecanismo de aprofundamento automático ainda não está conectado. Quando a primeira cobertura falha, ML/Shopee podem encerrar sem candidatos em vez de expandir automaticamente a busca. Isso deve ser tratado como lacuna operacional de discovery.

## Scheduler Oracle

```text
0 6,8,10,12,14,16,18 * * *
```

Timezone: `America/Sao_Paulo`. `noOverlap=true`.

Grade:

- 06h Casa/Cozinha/Organização
- 08h Beleza
- 10h Informática
- 12h Moda
- 14h Ferramentas
- 16h Pet
- 18h Eletrodomésticos

Cupons 22h permanece `manual_only`.

## Shopee OpenAPI V1

A fonte Shopee possui controles próprios de fonte, persistência e fila. O modo First Discovery ativo também deve ser aplicado ao ramo especial OpenAPI antes da persistência.

## Trend Executive e Radar dedicado

- `TREND_EXECUTIVE_MODE=off`;
- `TRENDS_RADAR_DEDICATED_RUNTIME=true`;
- `oracle-trends-radar` é a autoridade dedicada;
- `oracle-scraper` não consome Radar no ciclo editorial.

## Validação

```bash
npm run typecheck
npm test
npm run build
npm run security:check
npm run docs:audit
```

Depois de deploy/alteração operacional, validar `/api/health`, `/api/readiness`, PM2, flags efetivas e logs.
