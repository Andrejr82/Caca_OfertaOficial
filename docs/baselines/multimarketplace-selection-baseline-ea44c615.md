# Baseline Inicial — Seleção Multimarketplace

- **Data de Execução:** 2026-09-07
- **Base SHA:** `ea44c615`
- **Branch de Trabalho:** `feature/multimarketplace-selection-v2`
- **Branch do Plano:** `plan/multimarketplace-product-selection-sprints`
- **Plano de Referência:** `docs/superpowers/plans/2026-09-07-selecao-multimarketplace-sprints.md`
- **Arquivo Local Protegido:** `next-env.d.ts` (preservado sem inclusão em commits)

---

## 1. Inventário de Módulos e Componentes Analisados

| Responsabilidade | Módulo Atual | Destino no Plano V2 |
|---|---|---|
| **Fluxo Principal Oracle** | `scripts/oracle-worker-discovery-only.cjs` | Consome seletor canônico e fila unificada |
| **Quality Gate Legado** | `scripts/curation-policy.cjs` | Substituído por `src/core/offer-selection/` + `offer-quality` |
| **Quality V2** | `src/core/offer-quality/` | Motor único de score comercial canônico (0–100) |
| **Ranking Engine Legado** | `src/core/ranking/ranking-engine.ts` | Eliminado na Sprint 9 |
| **Políticas de Marketplace** | `src/core/intelligence/marketplace-policy.ts` | Eliminado na Sprint 9 |
| **Classificação** | `scripts/classification-coverage.cjs` & `src/core/classification/` | Gate de produto principal e intenção pré-score |
| **Freshness Gate** | `scripts/offer-freshness-gate.cjs` | Ciclo explícito de 4 estados com `isMateriallyBetter` |
| **Agrupamento de Famílias** | `scripts/family-key-engine.cjs` & `family-variant-selector.cjs` | Agrupamento por item, família e cross-marketplace |
| **Persistência de Metadados** | `persistDiscoveryV2Metadata()` em `scripts/oracle-scraper.cjs` | Gravação de audit trace, explainability e grupos |
| **Geração de Copy IA** | `src/app/api/ai/generate/route.ts` | Recebe apenas ofertas já aprovadas |
| **Publicação Social** | `src/core/publication/` | Bloqueia publicação sem aprovação explícita |

---

## 2. Estado dos Testes na Base `ea44c615`

### 2.1 Suite de Testes Completa (`npm run test`)
- **Total de Testes:** 2099
- **Aprovados:** 2040 testes (281 arquivos)
- **Falhas Conhecidas Pré-existentes:** 56 testes (44 arquivos) — predominantemente em copy V3/V5, reels e vídeos.
- **Ignorados (Skipped):** 3 testes

### 2.2 Typecheck (`npm run typecheck`)
- **Erros Conhecidos Pré-existentes:** 5 erros em `.next/types/` associados a `PageProps` e `RouteContext` no Next.js (parâmetros assíncronos de rotas).

### 2.3 Auditoria de Documentação (`npm run docs:audit`)
- **Status:** Aprovado (sem divergências de runtime registradas).

---

## 3. Garantias de Governança
- Nenhuma chave, credencial ou segredo gravado no repositório.
- Nenhuma alteração destrutiva ou reset de working tree.
- `next-env.d.ts` preservado localmente e isolado de commits.
