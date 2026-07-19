# PMAV5-006 — Auditoria de Curadoria e Ingestão Oficial

## Identificação

| Campo | Valor |
|---|---|
| Modo | `IMPLEMENTATION` |
| Implementação | M-04 — Curadoria e Ingestão Oficial |
| Checkpoint | CP-006 |
| Status | `COMPLETED` |
| Data | 2026-07-13 |
| Branch | `codex/pmav5-architecture-unification` |
| SHA inicial | `1abba0f381ecc13e5e0f4a7cba0ca1568cf6d421` |

## Veredito executivo

O runtime oficial Next.js usa o State Service para `pending_manual_review → selected`, rejeição, `selected → approved`, `draft → published` e `approved → posted`. O único writer concreto autorizado está encapsulado em `SupabaseStateAdapter.compareAndSet()`, com tenant, estado esperado e versão lógica na condição CAS. `integration_logs` materializa AuditPort e `app_settings` preserva reservas/resultados idempotentes sem alteração de schema.

## Inventário dos writers

| Arquivo | Função/caller | Consumidor | Estado anterior | Ação |
|---|---|---|---|---|
| `src/lib/offers/actions.ts` | seis actions de Shopee/ML/Amazon | Painel de ofertas | `selected`/`rejected` direto | migrado para `transitionOfficialOfferState()` |
| `src/app/api/ai/generate/route.ts` | `POST` após geração de drafts | Painel/IA Next.js | `approved` direto | migrado; aprovação ocorre após posts draft |
| `src/app/api/ai/generate/route.ts` | limpeza de drafts | Painel/IA Next.js | post `deleted` direto | removido do fluxo oficial |
| `src/app/api/{whatsapp,telegram,instagram}/publish/route.ts` | `POST` | Painéis de canais | auto-seleção direta | removido; publicação exige `approved` |
| `src/app/api/{whatsapp,telegram,instagram,facebook}/publish/route.ts` | `POST` após recibo | Painéis de canais | `published`/`posted` direto | migrado para `completeOfficialPublication()` |
| `src/lib/publish/actions.ts` | `generateQuickPostAction()` | Publish Express | criação direta em `approved` | substituída por ingestão em `pending_manual_review` |
| `src/lib/publish/actions.ts` | actions rápidas de canal | Publish Express/Extension | publicação sem State Service | desconectadas, fail-closed |
| `src/app/api/posts/{reject,bulk-reject}/route.ts` | `POST` | Painéis de posts | post `deleted` direto | desconectado; transição não existe na máquina oficial |
| `scripts/oracle-scraper.cjs` | `processTopOffers()` legado | nenhum caller do Worker oficial | `approved` direto | preservado desconectado pela PMAV5-005; arquivo proibido |
| `scripts/ai-processor.cjs` | script standalone | execução manual legada | `approved` direto | preservado fora do runtime oficial |
| `scripts/github-publish.ts` | workflow legado | GitHub Actions | `published`/`posted` direto | desconectado da rota oficial; GitHub Actions proibido |
| `src/lib/inngest/functions.ts` | função assíncrona legada | Inngest | `approved`/`deleted` direto | preservado fora do fluxo oficial; Inngest proibido |
| `src/app/api/publish/extension/route.ts` | rota legada | Extension | criação direta em `approved` | preservada fora do fluxo oficial; Extension proibida |
| `src/lib/affiliates/scraper.ts`, `scripts/local-scraper.cjs` | Discovery legado | scrapers | reset para `draft` | preservado fora do fluxo oficial; Discovery/marketplaces proibidos |
| `scripts/sanitize-posts-integrity.cjs` | manutenção manual | operador | `deleted`/`rejected` direto | preservado como manutenção não oficial |

Criações canônicas em `pending_manual_review` e `posts:draft` não são promoções e permanecem permitidas nos produtores autorizados.

## Fluxos oficiais

```text
Ingestão Next.js → offers:pending_manual_review
Curadoria autenticada → transitionOfferState() → selected | rejected
Geração/validação + posts:draft → transitionOfferState() → approved
Recibo de canal + approved + draft
  → transitionPostState() → published
  → transitionOfferState() → posted
```

## CAS, idempotência e auditoria

- CAS filtra `id`, `user_id` e `status` esperado; a versão é derivada da progressão monotônica oficial.
- a chave idempotente é persistida em `app_settings`; mesmo fingerprint retorna o resultado original e fingerprint divergente conflita.
- eventos `applied`, `rejected` e `idempotent_replay` usam AuditPort e são persistidos em `integration_logs`.
- nenhuma tabela, coluna, constraint, migration ou política foi criada/alterada.

## Evidências

- testes TDD novos: wrapper oficial, seleção, rejeição, aprovação, publicação, precondições, adapter CAS, AuditPort, idempotência e auditoria estática de writers;
- regressão completa: 152 aprovados, 2 ignorados, 0 falhas;
- ESLint direcionado: PASS;
- typecheck direcionado: nenhum erro nos arquivos PMAV5-006; o typecheck global conserva somente dívida preexistente fora do escopo;
- nenhum Discovery real, IA real, publicação real, deploy ou acesso à produção foi executado.

## Certificação negativa

Nenhum arquivo do Oracle Worker, Discovery, marketplaces, Scheduler, PM2, Inngest, Extension, GitHub Actions, Capacity Hunter, feature flags, banco, schema ou migrations foi alterado. Nenhum update direto de `offers.status` ou `posts.status` permanece nos callers oficiais listados no teste arquitetural.
