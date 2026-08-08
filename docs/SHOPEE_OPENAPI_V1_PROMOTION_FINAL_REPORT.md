# Promoção Shopee OpenAPI V1

## Decisão

**SHOPEE OPENAPI V1 PROMOVIDA.**

**V1 = ÚNICA FONTE OFICIAL SHOPEE.**

**NENHUM LEGADO/FALLBACK COMPETE NO FLUXO OFICIAL.**

**GRANDES OFERTAS = FORA DA AUTOMAÇÃO V1 ATÉ V2.**

## Roteamento oficial

O entrypoint PM2 `oracle-scraper` inicia `runScrapingCycle`. O ciclo chama `runScrapingCycleCore`, que registra `createShopeeOpenApiV1OfficialDiscovery` e `createShopeeOpenApiV1OfficialPersistRunner` no `runDiscoveryOnlyCycle`. Para Shopee, `scrapeStore` retorna uma lista vazia: `executeShopeeNativeDiscoveryV5` não é chamado pelo ciclo oficial.

V1 só executa para os 13 cenários de `APPROVED_SHOPEE_OPENAPI_V1_SCENARIOS`. Se a flag V1 estiver desligada ou o cenário for desconhecido, a decisão é `next: disabled`; não existe transição automática para legado. A persistência continua opt-in, limitada a cinco candidatos e exige `SHOPEE_OPENAPI_ENGINE_V1_PERSIST_ENABLED=true`, `NO_POSTS=1` e `NO_PUBLISH=1`.

## Caminhos auditados

| Caminho | Classificação | Resultado |
|---|---|---|
| `scripts/oracle-scraper.cjs` → `scrapeStore('Shopee')` | ativo em runtime | Alterado: não retorna candidatos V5; V1 é executada pelo callback oficial do ciclo. |
| `scripts/oracle-scraper.cjs` → `runScrapingCycleCore` | ativo em runtime/PM2 | Alterado: registra discovery e persistência controlada V1. |
| `scripts/oracle-worker-discovery-only.cjs` | ativo em runtime | Mantido: aceita decisão `official` e só chama o persistor V1 correspondente. |
| `scripts/shopee-openapi-v1-adapter.cjs` | ativo em runtime | Alterado: flag falsa/cenário desconhecido desabilita Shopee, sem fallback legado; 13 cenários retornam `mode: official`. |
| `scripts/shopee-openapi-v1-discovery-shadow.cjs` | ativo em runtime, nome histórico | Mantido por compatibilidade de nome; agora emite `mode`/`decision: official`. |
| `scripts/shopee-native-discovery-v5.cjs` / `executeShopeeNativeDiscoveryV5` | teste/tooling | Mantido. Não é alcançado pelo ciclo, manual recording ou multi-marketplace recording oficiais. O CLI `--shopee-native-top20-dry-run` continua somente diagnóstico, sem persistência. |
| `runShopeeScenarioRecording` | alcançável manualmente | Alterado: delega ao caminho V1 controlado. |
| `runManualMarketplaceScenarioRecording` / `runMultiMarketplaceScenarioRecording` | alcançável manualmente | Alterados: Shopee não chama V5; usam callbacks V1 oficiais. |
| `scripts/shopee-scenario-config.cjs` | histórico/inativo para ciclo editorial | Mantido: contratos legados são preservados para leitura/tooling; routing editorial ativo vem de `editorial-scenario-config.cjs`. |
| `grandes_ofertas_editorial` | bloqueio explícito | Mantido bloqueado com `blocked_v1_scenario`, `next: manual_or_v2`; não seleciona V1 nem legado automaticamente. |

## Rastreabilidade e publicação

O persistor V1 continua usando `engine=shopee_openapi_v1`, `mode=controlled-persist`, `scenarioId` real, `correlation_id` V1 e `payload_v1`. O caminho não chama publicadores: `NO_POSTS=1` e `NO_PUBLISH=1` são pré-requisitos do guard, e o write audit mantém `postsWrites`, `publishCalls` e `oracleCalls` em zero.

Nenhuma alteração foi feita em Vercel, Telegram, publicadores, PM2 ou Supabase. Rollback operacional é Git/deploy anterior; não existe fallback legado automático.

## Verificação

- Suíte V1/discovery focada: 5 arquivos, 19 testes aprovados.
- `node --check` aprovado para os quatro CJS alterados.
- ESLint aprovado para código e testes alterados.
- `git diff --check` aprovado.

## Risco residual

O V5 ainda existe como diagnóstico explícito via CLI dry-run e como código de compatibilidade, portanto deve continuar fora de qualquer novo entrypoint produtivo. A flag `SHOPEE_OPENAPI_ENGINE_V1_ENABLED` precisa permanecer `true` no ambiente que executar a automação; se estiver falsa, Shopee fica desabilitada em vez de retornar ao V5.
