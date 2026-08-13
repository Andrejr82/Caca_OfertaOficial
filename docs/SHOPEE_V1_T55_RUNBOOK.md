# Shopee V1 — Runbook T55

## Estado seguro padrão

- `SHOPEE_OPENAPI_ENGINE_V1_ENABLED=false`
- `SHOPEE_RANKING_V1_ENABLED=false`
- `SHOPEE_OPENAPI_ENGINE_V1_PERSIST_ENABLED=false`
- `--shopee-ranking-v1-shadow` somente para comparação, sem decisão, persistência ou publicação
- `NO_DB_WRITE=1`, `DRY_RUN=1` e `NO_PUBLISH=1` em shadow/preflight

Vercel atende busca manual, revisão e publicação. Oracle executa descoberta contínua e persistência controlada. Supabase mantém estado, idempotência e auditoria.

`10 → 50 → 100` significa progressão explícita de escopo/volume por ambiente ou cenário. Não é rollout percentual por usuário, hash ou aleatoriedade.

## Ativação controlada

1. Confirmar Preview `READY`, commit correto e build sem erros.
2. Executar shadow por ao menos um ciclo editorial.
3. Comparar cobertura, rejeições, ranking, explainability, latência, erros, persistência e publicação.
4. Alterar explicitamente a flag do estágio aprovado; nunca usar `Math.random`, hashing, Vercel Flags ou Edge Config.
5. Avançar somente com o gate anterior verde.

## Rollback

1. Desativar `SHOPEE_RANKING_V1_ENABLED` e `SHOPEE_OPENAPI_ENGINE_V1_ENABLED`.
2. Manter `SHOPEE_OPENAPI_ENGINE_V1_PERSIST_ENABLED=false` e `NO_PUBLISH=1`.
3. Interromper o ciclo Oracle em andamento de forma não destrutiva e preservar checkpoints/logs.
4. Confirmar que o adaptador legado retomou a decisão e que não houve publicação indevida.
5. Investigar causa raiz antes de nova ativação.

Não remover colunas ou executar migration reversa durante incidente. Não promover Preview para Production como parte do rollback.

## Gates mínimos

- autenticação/contrato OpenAPI sem erro;
- preço, identidade, link afiliado e filtros comerciais válidos;
- ranking determinístico e explainability presente;
- persistência somente com todos os gates de escrita aprovados;
- publicação somente após revisão e revalidação;
- Amazon/ML sem regressão;
- logs sem credenciais e sem resposta bruta desnecessária.

## Evidência T54/T55

- Branch: `fix/shopee-v1-reconcile-main`
- Commit validado: `fd361f4`
- Preview: `https://caca-oferta-oficial-d09l258tc-andre-mauricios-projects.vercel.app`
- Deployment: `dpl_85xT9XUwqYVGgtUmfCpMjePfaLYw`
- Estado: `READY`
- Production: não alterada
