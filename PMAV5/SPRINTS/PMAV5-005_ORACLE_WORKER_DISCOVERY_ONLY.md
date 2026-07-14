# PMAV5-005 — Oracle Worker Discovery-Only

## Identificação

| Campo | Valor |
|---|---|
| Modo | `IMPLEMENTATION` |
| Implementação | M-03 |
| Checkpoint | CP-005 |
| Status | `COMPLETED` |
| Data | 2026-07-13 |
| Branch | `codex/pmav5-architecture-unification` |
| SHA inicial | `5fdb734f52ebd7bcf56f33c282a9d1ca40ccc2fb` |

## Resultado

O Oracle Worker foi reduzido ao fluxo canônico Discovery-Only. O ciclo agendado executa Shopee Discovery V5, Mercado Livre Native Top20 e Amazon Native Top20; converte os resultados em Candidate V1 e Ingestion V1; persiste somente `pending_manual_review`; e encerra.

## Implementação

- núcleo puro em `scripts/oracle-worker-discovery-only.cjs` com lista fechada dos três marketplaces, contratos V1, identidades determinísticas e fail-closed de estado;
- `scrapeStore()` contém apenas adapters nativos dos três marketplaces;
- `runScrapingCycle()` contém apenas orquestração Discovery-Only e scheduler de quatro horas;
- bootstrap não exige credenciais LLM e não oferece rotas para dry-runs V3/V4/EPIC09;
- persistência em lote por marketplace grava exclusivamente `pending_manual_review`;
- legado preservado em funções não exportadas/não chamadas quando possui consumidores externos.

## Critérios de aceite

| Critério | Resultado |
|---|---|
| Worker exclusivamente Discovery-Only | PASS |
| Shopee somente Discovery V5 | PASS |
| Mercado Livre Native Top20 | PASS |
| Amazon Native Top20 | PASS |
| três marketplaces terminam em `pending_manual_review` | PASS |
| nenhum caminho executável chama IA/Groq/Cerebras | PASS |
| nenhum caminho executável cria posts/publica | PASS |
| nenhum caminho executável consulta drafts/processa `processTopOffers` | PASS |
| Candidate V1 → Ingestion V1 → persistência | PASS |
| nenhum deploy ou alteração de produção | PASS |

## Arquivos

- Criado: `scripts/oracle-worker-discovery-only.cjs`.
- Alterado: `scripts/oracle-scraper.cjs`.
- Criado: `src/tests/oracle-worker-discovery-only.test.ts`.
- Alterado: `scripts/test-amazon-v5-flags.cjs`.
- Criados: auditoria, ficha da Sprint e rollback PMAV5-005.
- Atualizados: `PMAV5/07_CHECKPOINTS.md` e `PMAV5/10_CHANGELOG.md`.

## Validação autorizada

Vitest, ESLint direcionado, typecheck direcionado, parser Node e regressões locais com fixtures/mocks dos três marketplaces. Discovery real, IA, publicação, build, deploy e produção permaneceram proibidos e não foram executados.

## Encerramento

CP-005 registra `COMPLETED`. O commit único da Sprint é `refactor(pmav5): make oracle worker discovery only`; o SHA final é obtido do commit e do push, sem auto-referência impossível dentro do próprio commit.
