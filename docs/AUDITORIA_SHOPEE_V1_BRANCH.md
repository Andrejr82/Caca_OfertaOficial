# Auditoria — Motor Shopee V1 (feat/shopee-search-engine-v1-v2)

**Data:** 2026-08-12  
**Branch:** `feat/shopee-search-engine-v1-v2`  
**Commit final:** `482a566`  
**Commit-base (origin/main):** `d0969de`  
**Plano-fonte:** `docs/IMPLANTACAO_MOTOR_BUSCA_SHOPEE_V1.md`  
**PR Draft:** [#63](https://github.com/Andrejr82/Caca_OfertaOficial/pull/63)

---

## Legenda

| Símbolo | Significado |
|---|---|
| ✅ | Concluída |
| 🟡 | Parcialmente implementada |
| ❌ | Não iniciada |
| N/A | Não aplicável com justificativa |

---

## Fase 0 — Preparação

| ID | Task | Status | Evidência | Observações |
|---|---|---|---|---|
| **T00** | Criar branch de trabalho | ✅ Concluída | Branch `feat/shopee-search-engine-v1-v2`, commit-base `d0969de` = `origin/main` | — |
| **T01** | Inventariar consumidores do adaptador | ❌ Não iniciada | Nenhum artefato de mapa de chamadas ou análise de consumidores no diff | Mapa de risco de `shopee-search-adapter`, `offer-matching` e `match/route` não documentado formalmente |
| **T02** | Congelar fixtures sanitizadas | ❌ Não iniciada | Nenhum arquivo de fixture nos diretórios `__tests__/fixtures` ou similar | Casos de regressão foram escritos inline nos testes, sem fixtures versionadas separadas |
| **T03** | Registrar baseline atual | ❌ Não iniciada | Cobertura, erros e falsos positivos do Vercel Observability não foram registrados | Baseline de testes documentado no handoff, mas sem relatório de cobertura Vercel |

---

## Fase 1 — Núcleo

| ID | Task | Status | Evidência | Observações |
|---|---|---|---|---|
| **T10** | Criar tipos do domínio | ✅ Concluída | `src/lib/shopee/ranking/types.ts`: `ShopeeRankedCandidate`, `CategoryPolicy`, `RejectionCode`, `CommercialFiltersConfig`, `ShopeeSearchRequest` | Contrato 100% fiel ao §4 do plano |
| **T11** | Criar normalizadores + testes | ✅ Concluída | `src/lib/shopee/ranking/normalization.ts`: `normalizePrice`, `normalizePercent`, `normalizeText`, `buildIdentity`, `isValidHttpsUrl`. Cobertos em `shopee-ranking.test.ts` (grupo 1) | Normalização de fração 0-1 → 0-100 implementada |
| **T12** | Criar políticas semânticas | 🟡 Parcialmente implementada | `src/lib/shopee/ranking/category-policies.ts`: 6 categorias com `primaryClasses` e `blockedTerms` | `queryAliases`, `blockedCompatibilityPatterns`, `nativeCategoryIds` e `exceptions` do §6.2 não implementados. Interface `CategoryPolicy` não cobre `CategorySemanticPolicy` completo do plano |
| **T13** | Criar validador contextual | 🟡 Parcialmente implementada | `src/lib/shopee/ranking/semantic-validator.ts`: lógica de bloqueio contextual funcional; os 10 casos de regressão passam | `nativeCategoryIds` não é verificado; `exceptions` (quando a intenção é o acessório) é simulado via `customPolicy` no teste, mas não suportado na interface `CategoryPolicy` atual |
| **T14** | Criar filtros comerciais | ✅ Concluída | `src/lib/shopee/ranking/commercial-filters.ts`: todos os 7 filtros eliminatórios do §7.1 implementados; limites externalizados em `DEFAULT_COMMERCIAL_FILTERS` | Cobertura de testes indireta via `processRawOffers` |
| **T15** | Criar fórmula e desempates | ✅ Concluída | `src/lib/shopee/ranking/score.ts`: fórmula V1 com os 8 pesos, breakdown, razões e os 7 critérios de desempate do §8.3 implementados e testados | `price_competitiveness` usa fallback 0.5 quando não há mediana — comportamento aceitável |
| **T16** | Criar orquestrador | ✅ Concluída | `src/lib/shopee/ranking/search-service.ts`: `processRawOffers` e `rankAndSelectTop` com dedupe por identidade, validação semântica → filtros → score → Top N | Resiliência do §5.4 (retry, backoff, timeout, concorrência) ausente no núcleo; apenas timeout de 30s no adapter. Sem retry/backoff |

---

## Fase 2 — Integração

| ID | Task | Status | Evidência | Observações |
|---|---|---|---|---|
| **T20** | Atualizar adaptador Shopee | ✅ Concluída | `src/lib/trends/shopee-search-adapter.ts`: `searchShopeeOfficialV1` delega para `processRawOffers` + `rankAndSelectTop`; `mapRankedCandidatesToTrend` exportado | `mapShopeeProductsToTrendCandidates` preservada para retrocompatibilidade |
| **T21** | Integrar evidence collector | ❌ Não iniciada | `git diff` = 0 bytes para `shopee-evidence-collector.ts` — sem alterações | `scoreBreakdown`, `determiningReasons` e `strategyVersion` não integrados ao collector |
| **T22** | Atualizar matching | ❌ Não iniciada | `git diff` = 0 bytes para `offer-matching.ts` — sem alterações | Bloqueio global de acessórios não substituído por regras contextuais |
| **T23** | Integrar Oracle | ❌ Não iniciada | Nenhum script Oracle alterado | Desbloqueada: T10-T16 concluídas; requer aprovação explícita |
| **T24** | Integrar publicação (`match/route.ts`) | ❌ Não iniciada | `git diff` = 0 bytes para `match/route.ts` — sem alterações | `strategyVersion` não registrado na rota |

---

## Fase 3 — Dados e Observabilidade

| ID | Task | Status | Evidência | Observações |
|---|---|---|---|---|
| **T30** | Definir persistência V1 | ❌ Não iniciada | Sem alterações em Supabase migrations ou JSONB | — |
| **T31** | Revisar consultas e índices | ❌ Não iniciada | Sem alterações em migrations SQL | — |
| **T32** | Validar RLS/advisors | ❌ Não iniciada | — | — |
| **T33** | Instrumentar eventos e logs estruturados | ❌ Não iniciada | Nenhum evento `shopee_search_completed` ou similar implementado | — |
| **T34** | Criar alertas operacionais | ❌ Não iniciada | — | — |

---

## Fase 4 — Qualidade

| ID | Task | Status | Evidência | Observações |
|---|---|---|---|---|
| **T40** | Testes unitários | 🟡 Parcialmente implementada | `src/tests/shopee/shopee-ranking.test.ts`: cobre normalização, os 10 casos de regressão (§14.2), score e desempates. `shopee-search-adapter.test.ts` e `shopee-approval-queue.test.ts` cobrem o adapter | Ausentes: testes isolados de `commercial-filters.ts`, identidade `shopId:itemId` direta, deduplicação e `no_qualified_candidate` |
| **T41** | Testes de contrato Open API | ❌ Não iniciada | Nenhum teste HMAC com relógio controlado, timeout, 429 ou paginação (`hasNextPage`) do §14.3 | — |
| **T42** | Testes de integração ponta a ponta | ❌ Não iniciada | Sem teste de fluxo `Open API simulada → motor → Top 2` do §14.4 | — |
| **T43** | Teste visual do consumidor | ❌ Não iniciada | — | — |
| **T44** | Revisão de segurança | ❌ Não iniciada | Segredos não expostos no diff confirmado | Revisão formal não executada |

---

## Fase 5 — Implantação Vercel

| ID | Task | Status | Evidência | Observações |
|---|---|---|---|---|
| **T50** | Feature flag `SHOPEE_RANKING_V1_ENABLED` | ❌ Não iniciada | Nenhuma referência à variável no código alterado | — |
| **T51** | Deploy Preview | ❌ Não iniciada | PR Draft #63 criado, sem deploy acionado | — |
| **T52** | Shadow mode | ❌ Não iniciada | — | — |
| **T53** | Ativação gradual | ❌ Não iniciada | — | — |
| **T54** | Verificação pós-deploy | ❌ Não iniciada | — | — |
| **T55** | Documentar runbook e rollback | ❌ Não iniciada | Handoff cobre rollback em alto nível, sem runbook operacional executável | — |

---

## Tasks Vercel (TV01–TV17)

| ID | Task | Status | Observações |
|---|---|---|---|
| TV01 | Confirmar alias e deployment de produção | ❌ Não iniciada | Alias de produção não confirmado |
| TV02 | Auditar presença/escopo das variáveis | ❌ Não iniciada | Variáveis de ambiente não auditadas |
| TV03 | Remover `ignoreBuildErrors` | ❌ Não iniciada | `ignoreBuildErrors: true` ainda presente no `next.config` |
| TV04 | Criar pipeline `npm run verify` | ❌ Não iniciada | Pipeline de gate CI não criado |
| TV05 | Medir `iad1` versus `gru1` | ❌ Não iniciada | Medição de latência de região não realizada |
| TV06 | Definir orçamento e `maxDuration` | ❌ Não iniciada | `maxDuration` não definido |
| TV07 | Dividir aprovação por categoria | ❌ Não iniciada | Aprovação monolítica não dividida em unidades idempotentes |
| TV08 | Corrigir ou retirar dependência do Inngest | ❌ Não iniciada | Dependência do Inngest não resolvida |
| TV09 | Implementar flag server-only | ❌ Não iniciada | Flag server-only não implementada |
| TV10 | Avaliar Vercel Flags | ❌ Não iniciada | ADR sobre Vercel Flags não escrito |
| TV11 | Decidir Cron Shopee | ❌ Não iniciada | ADR sobre Cron Shopee não escrito |
| TV12 | Instrumentar logs estruturados | ❌ Não iniciada | Logs estruturados não instrumentados |
| TV13 | Verificar Drain/monitoramento | ❌ Não iniciada | Drain/monitoramento não verificado |
| TV14 | Executar Deploy Preview | ❌ Não iniciada | Deploy Preview não executado |
| TV15 | Verificação ponta a ponta | ❌ Não iniciada | Verificação ponta a ponta não realizada |
| TV16 | Promover artefato validado | ❌ Não iniciada | Promoção para produção não executada |
| TV17 | Escanear erros pós-deploy | ❌ Não iniciada | Varredura pós-deploy não realizada |

---

## Tasks Oracle (TO01–TO15)

| ID | Task | Status | Observações |
|---|---|---|---|
| TO01 | Inventariar PM2/runtime | ❌ Não iniciada | PM2/runtime não inventariado |
| TO02 | Consolidar schedule do worker | ❌ Não iniciada | Schedule do worker não consolidado |
| TO03 | Extrair núcleo compartilhado | 🟡 Parcialmente iniciada | Núcleo existe em `src/lib/shopee/ranking/`, mas nenhum script Oracle foi atualizado para consumi-lo |
| TO04 | Integrar núcleo ao `oracle-scraper` | ❌ Não iniciada | Bloqueada por TO03 |
| TO05 | Atualizar `DEPLOY_FILES` | ❌ Não iniciada | Bloqueada por TO03 |
| TO06 | Fortalecer manifesto e hashes | ❌ Não iniciada | — |
| TO07 | Validar overlay fail-closed | ❌ Não iniciada | — |
| TO08 | Remover defaults sensíveis do deploy | ❌ Não iniciada | — |
| TO09 | Criar testes de contrato Oracle | ❌ Não iniciada | — |
| TO10 | Criar dry-run/shadow verificável | ❌ Não iniciada | Bloqueada por TO03, TO04 |
| TO11 | Validar idempotência/checkpoints | ❌ Não iniciada | — |
| TO12 | Validar integração Oracle→Vercel | ❌ Não iniciada | — |
| TO13 | Executar canário por categoria | ❌ Não iniciada | Bloqueada por TO10 + aprovação |
| TO14 | Documentar runbook PM2 | ❌ Não iniciada | — |
| TO15 | Observar dois ciclos completos | ❌ Não iniciada | Bloqueada por TO13 |

---

## Resumo

| Métrica | Valor |
|---|---|
| **Total de tasks** | 56 (T00–T55 + TV01–TV17 + TO01–TO15) |
| **✅ Concluídas** | 7 (T00, T10, T11, T14, T15, T16, T20) |
| **🟡 Parcialmente implementadas** | 4 (T12, T13, T40, TO03) |
| **❌ Não iniciadas** | 45 |
| **N/A** | 0 |

---

## Próxima Task

**T21 — Integrar evidence collector** (`src/lib/trends/shopee-evidence-collector.ts`)

**Justificativa:**
É a primeira task pendente da Fase 2 sem bloqueadores. T20 está concluída e T10–T16 estão disponíveis. Sem ela, `scoreBreakdown`, `determiningReasons` e `strategyVersion` nunca chegam ao pipeline de evidências, tornando o motor V1 invisível para diagnóstico e observabilidade. Sua conclusão também habilita T22 (matching) e T33 (logs estruturados).

---

## Arquivos Alterados na Branch

| Arquivo | Tipo |
|---|---|
| `docs/IMPLEMENTATION_HANDOFF_SHOPEE_V1.md` | Novo (documentação) |
| `src/lib/shopee/ranking/types.ts` | Novo (T10) |
| `src/lib/shopee/ranking/normalization.ts` | Novo (T11) |
| `src/lib/shopee/ranking/category-policies.ts` | Novo (T12) |
| `src/lib/shopee/ranking/semantic-validator.ts` | Novo (T13) |
| `src/lib/shopee/ranking/commercial-filters.ts` | Novo (T14) |
| `src/lib/shopee/ranking/score.ts` | Novo (T15) |
| `src/lib/shopee/ranking/search-service.ts` | Novo (T16) |
| `src/lib/trends/shopee-search-adapter.ts` | Modificado (T20) |
| `src/tests/shopee/shopee-ranking.test.ts` | Novo (T40 parcial) |
| `src/tests/trends/shopee-approval-queue.test.ts` | Modificado (T40 parcial) |
| `src/tests/trends/shopee-search-adapter.test.ts` | Modificado (T40 parcial) |

---

## Proteções Confirmadas

- `origin/main`: não alterada
- Oracle/PM2/VPS: não tocados
- Supabase produtivo: não alterado
- Vercel produtivo: não alterado
- Credenciais: não expostas no diff
- Merge: não executado
- Implantação produtiva: não executada
