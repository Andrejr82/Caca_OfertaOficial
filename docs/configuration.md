# Configuração

<!-- docs-status: current -->
<!-- verified-against: 2447c01c25871c76c96242cd4dfda35d7b1a7873 -->
<!-- verified-on: 2026-08-27 -->

## Princípios

- `.env.example` é o inventário seguro; valores reais ficam em `.env.local`, Vercel, Oracle/PM2 ou secret store.
- Flags novas entram desligadas ou fail-closed quando controlam descoberta, persistência, IA ou publicação.
- `FIRST_DISCOVERY_QUALITY_V1_MODE` controla o novo pipeline de primeira descoberta (`off` por padrão, `shadow` para observabilidade sem alteração, `active` para intenções refinadas).
- Arquivos de overlay Oracle aceitam apenas chaves permitidas e devem ser validados antes de reiniciar processos.
- URLs públicas, service-role keys e credenciais de canais não podem aparecer em logs ou documentação.

## Grupos de configuração

| Grupo | Uso |
|---|---|
| Supabase | URL, chaves pública/server-side, tabelas, RPCs e Storage |
| Aplicação | URLs pública/interna, autenticação e ambiente Next.js |
| Official AI | provider, modelo, limites e chaves Groq/Cerebras |
| Oracle | URL remota, chave da API, scheduler, limites e overlay |
| Marketplaces | credenciais, fontes, paginação e flags de admissão |
| Publicação | Telegram, Meta/Instagram/Facebook e WhatsApp |
| Vídeo | worker, TTS, FFmpeg, Storage, heartbeat e limites |

## Scheduler Oracle

O scheduler canônico usa `0 6,8,10,12,14,16,18 * * *` em `America/Sao_Paulo`, com `noOverlap: true`. O scraper agenda os ciclos no startup, mas não executa Discovery imediatamente sem `--run-now`. Cupons às 22h permanece `manual_only` e fora do cron.

## Instagram e Meta

- `INSTAGRAM_ACCESS_TOKEN` e a conta Business/Professional precisam estar válidos no ambiente de execução.
- Feed e Reels usam o transporte oficial e marcam conteúdo afiliado como parceria paga.
- O `Instagram Policy Guard` é uma barreira fail-closed da rota oficial de publicação.
- Se o contexto da oferta/post não puder ser carregado para análise, a publicação é bloqueada em vez de seguir para a Graph API.

## Shopee OpenAPI V1

O runtime possui controles separados para fonte, persistência, geração de drafts e publicação. A ativação deve ocorrer por janela controlada, com overlay validado, logs observados e publicação bloqueada até aprovação explícita.

## Trend Executive e Radar dedicado

`TREND_EXECUTIVE_MODE` aceita `off | shadow | active`. Na auditoria operacional de 25/08/2026, o ambiente Oracle estava com `TREND_EXECUTIVE_MODE=off`.

O Radar dedicado está ativo na Oracle com `TRENDS_RADAR_DEDICATED_RUNTIME=true` no processo PM2 `oracle-trends-radar`. O `oracle-scraper` não consome solicitações Radar no ciclo editorial. O worker dedicado usa polling de 30s e lock local `/tmp/caca-oferta-trends-radar.lock` para serialização no host auditado.

`TRENDS_RADAR_DEDICATED_RUNTIME=false` não deve mais ser documentado como estado produtivo atual. Qualquer mudança dessa flag exige confirmar que apenas uma autoridade de consumo permanece ativa.

## Validação

```bash
npm run typecheck
npm test
npm run build
npm run security:check
npm run docs:audit
```

Depois do deploy, valide `/api/health`, `/api/readiness`, logs Oracle/PM2 e um smoke test read-only das integrações necessárias.
