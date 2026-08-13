# Shopee V1 — T53

- `SHOPEE_OPENAPI_ENGINE_V1_ENABLED`: habilita a descoberta Shopee OpenAPI V1. `false` é fail-closed.
- `SHOPEE_RANKING_V1_ENABLED`: habilita o consumo do ranking V1 nas rotas Vercel. Não habilita descoberta nem persistência.
- `--shopee-ranking-v1-shadow`: calcula e registra a decisão V1 para comparação, sem substituir o gate legado, persistir ou publicar.
- `SHOPEE_OPENAPI_ENGINE_V1_PERSIST_ENABLED`: permite persistência controlada somente quando engine, cenário allowlisted, `NO_DB_WRITE=0`, `DRY_RUN=0` e `NO_PUBLISH=1`.
- Oracle é executor autoritativo de descoberta contínua e persistência controlada; Vercel atende busca manual, revisão e publicação; Supabase mantém estado e auditoria.
- `10 → 50 → 100` é progressão operacional de escopo/volume por ambiente ou cenário, com alteração explícita das flags e rollback por `false`. Não há rollout percentual por hash, `Math.random`, Vercel Flags ou Edge Config.
