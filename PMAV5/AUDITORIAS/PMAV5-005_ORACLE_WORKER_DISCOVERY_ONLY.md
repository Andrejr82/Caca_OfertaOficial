# PMAV5-005 — Auditoria Oracle Worker Discovery-Only

## Identificação

| Campo | Valor |
|---|---|
| Modo | `IMPLEMENTATION` |
| Implementação | M-03 — Oracle Worker Discovery-Only |
| Checkpoint | CP-005 |
| Status | `COMPLETED` |
| Data | 2026-07-13 |
| Branch | `codex/pmav5-architecture-unification` |
| SHA inicial | `5fdb734f52ebd7bcf56f33c282a9d1ca40ccc2fb` |

## Veredito executivo

O entrypoint `scripts/oracle-scraper.cjs` executa somente os discoveries nativos de Shopee, Mercado Livre e Amazon. O Scheduler chama `runScrapingCycle()`, que delega ao núcleo puro `scripts/oracle-worker-discovery-only.cjs`; cada marketplace produz Candidate V1, Ingestion V1 e persiste exclusivamente `pending_manual_review` antes de encerrar.

O fluxo executável não consulta drafts, não chama IA/Groq/Cerebras, não cria posts, não publica, não promove estados e não alcança EPIC09, Selection Engine, Candidate Queue ou fallbacks V3/V4. Módulos legados com consumidores externos foram preservados fisicamente e desconectados do Worker.

## Mapa de corte

| Item | Arquivo | Caller anterior/preservado | Consumidor | Ação |
|---|---|---|---|---|
| `processTopOffers` | `scripts/oracle-scraper.cjs` | somente `runScrapingCycleLegacy()` após o corte | nenhum caller do Worker | preservar fisicamente; desconectar |
| `pendingDrafts` | `scripts/oracle-scraper.cjs` | variável local de `runScrapingCycleLegacy()` | `processTopOffers` no legado | preservar fisicamente; desconectar |
| `generateOfferAnalysis` | `scripts/oracle-scraper.cjs` | `processTopOffers`; `scripts/ai-processor.cjs`; diagnóstico Cerebras | scripts externos/diagnóstico | preservar para consumidores; desconectar do Worker |
| `callLLM` / fallback de provider | `scripts/oracle-scraper.cjs` | extrações e IA legadas | exports/diagnósticos externos | preservar; desconectar do Worker |
| Groq / Cerebras | `scripts/oracle-scraper.cjs`, `src/core/llm/*` | módulos legados e Next.js fora do escopo | IA externa ao Worker | preservar; bootstrap do Worker não exige LLM |
| Selection Engine | `scripts/oracle-scraper.cjs` | `runShopeeOfficialPipeline()` | Oracle API e testes legados | preservar; desconectar do Worker |
| Candidate Queue | `scripts/oracle-scraper.cjs` | `runShopeeOfficialPipeline()` | Oracle API e testes legados | preservar; desconectar do Worker |
| `runShopeeOfficialPipeline` | `scripts/oracle-scraper.cjs` | `scripts/oracle-api.cjs`, testes/diagnósticos legados | Oracle API | preservar; remover do entrypoint e de `scrapeStore()` |
| EPIC09 | `scripts/oracle-scraper.cjs` | ramo `scrapeStoreLegacy()` | pipeline Shopee legado | preservar como histórico; desconectar |
| `fetchShopeeOfficialDiscovery` | `scripts/oracle-scraper.cjs` | `runShopeeOfficialPipeline()` | Oracle API/testes legados | preservar; desconectar |
| fallback V3 | `scripts/oracle-scraper.cjs` | ramo `scrapeStoreLegacy()`/dry-run antigo | legado Amazon | desconectar; Amazon usa Native Top20 |
| fallback V4 | `scripts/oracle-scraper.cjs` | dry-run legado sem rota no bootstrap | diagnóstico Shopee antigo | preservar fisicamente; desconectar |

`scrapeStoreLegacy()` é exportado nominalmente apenas para compatibilidade explícita; `runScrapingCycleLegacy()` não é exportado. Nenhum dos dois é agendado ou chamado pelo entrypoint. Eles conservam o código histórico necessário para rastreabilidade e consumidores externos, sem caminho a partir do runtime oficial.

## Fluxo final do Worker

```text
Scheduler node-cron
  → runScrapingCycle
  → runDiscoveryOnlyCycle
  → Shopee | Mercado Livre | Amazon
  → categoria oficial + Top20 nativo
  → normalização + sanitização + deduplicação + novelty
  → score determinístico 0..10
  → pmav5.candidate/v1
  → pmav5.ingestion/v1
  → persistDiscoveryIngestionV1
  → pending_manual_review
  → PARAR
```

## Fluxos por marketplace

| Marketplace | Fonte/categorias | Top20 e qualificação | Novelty | Saída |
|---|---|---|---|---|
| Shopee | Affiliate Open API + catálogo oficial/certificado V5 | `executeShopeeNativeDiscoveryV5()`; Top20 por categoria | chaves item/shopItem/URL contra ofertas ativas | Candidate V1 → Ingestion V1 → `pending_manual_review` |
| Mercado Livre | SSR oficial `/ofertas` e filtro oficial de categorias | `executeMercadoLivreNativeTop20()`; primeiros 20 cards por categoria | item/product/URL contra ofertas ativas | Candidate V1 → Ingestion V1 → `pending_manual_review` |
| Amazon | árvore pública Best Sellers | `runAmazonNativeTop20()`; Top20 por subcategoria | ASIN contra ofertas ativas | Candidate V1 → Ingestion V1 → `pending_manual_review` |

## Contratos e persistência

- Candidate: `pmav5.candidate/v1`, sem estado, IA, copy, canal ou credencial.
- Ingestion: `pmav5.ingestion/v1`, `sourceType=oracle_candidate`, actor `oracle-worker`.
- Persistência: uma inserção em lote por marketplace, somente com `status=pending_manual_review`.
- Ponte transitória: como o Next Ingestion Service é entrega da PMAV5-006 e não existe neste SHA, o adapter interno materializa Ingestion V1 diretamente em `pending_manual_review`; ele não promove estado e deverá ser substituído pela fronteira oficial na PMAV5-006. Esta Sprint não altera Next.js nem o State Service.
- Fail-closed: retorno de persistência com qualquer outro estado encerra o ciclo com erro.
- Idempotência: `candidateId`, `ingestionId` e `idempotencyKey` derivam de tenant + marketplace + item de origem; novelty impede reingresso ativo antes da inserção.

## Evidências e testes

| Evidência | Resultado |
|---|---|
| Vitest direcionado Discovery-Only | 10 aprovados, 0 falhas |
| Vitest completo | 132 aprovados, 2 ignorados, 0 falhas |
| Amazon/Mercado Livre/flags via `node --test` | 19 aprovados, 0 falhas |
| Shopee Native V5 | 6 cenários aprovados, 0 falhas |
| Parser Node | ambos os CJS alterados válidos |
| Discovery real / IA / publicação / deploy | não executados |

Os testes verificam ausência de IA, Groq, Cerebras, posts, publicação, `pendingDrafts` e `processTopOffers` no ciclo; roteamento exclusivo dos três pipelines nativos; contratos V1; fail-closed de estado; rejeição de flags legadas no entrypoint; importação segura por consumidores externos; isolamento de Candidate inválido; deduplicação global por item de origem; Top20; sanitização; novelty e score determinístico. A cobertura comportamental da Sprint compreende 10 cenários Vitest do orquestrador/entrypoint, 19 regressões Node de Amazon/Mercado Livre e 6 cenários Shopee; o repositório não possui provider de instrumentação `@vitest/coverage-v8`, portanto nenhum percentual artificial foi declarado.

## Escopo negativo certificado

Nenhum arquivo Next.js, Curadoria, Painel, State Service, Inngest, Extension, GitHub Actions, Capacity Hunter, banco, schema, migration, PM2, Oracle VPS, `.env`, segredo ou produção foi alterado. Nenhum Discovery real, IA, publicação, deploy, restart ou acesso à Oracle VPS foi executado.
