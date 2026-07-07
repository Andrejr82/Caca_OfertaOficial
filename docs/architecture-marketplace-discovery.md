# Arquitetura Marketplace Discovery — EPIC 09

## Visão Geral

O pipeline de descoberta da Shopee foi implementado na EPIC 09 como uma arquitetura modular e desacoplada, executada inteiramente no servidor sem chamar IA, publicar ou alterar o banco de dados para o fluxo de curadoria manual.

---

## Pipeline Completo

```
Marketplace Discovery (Sprint 09.1)
    ↓
Marketplace History (Sprint 09.3)
    ↓
Discovery Score (Sprint 09.2)
    ↓
Marketplace Selection Engine (Sprint 09.4)
    ↓
Marketplace Candidate Queue (Sprint 09.5)
    ↓
Pipeline Integration (Sprint 09.6)
    ↓
Buscar Tendências / API (Sprint 09.7)
    ↓
Marketplace Presenter (Sprint 09.8)
    ↓
Manual Review Queue (Sprint 09.9)
```

---

## Responsabilidades por Camada

| Camada | Responsabilidade | Localização |
|---|---|---|
| **Marketplace Discovery** | Busca produtos na Shopee via API Oficial | `oracle-scraper.cjs` → `fetchShopeeOfficialDiscovery()` |
| **Marketplace History** | Filtra produtos já vistos (anti-repetição) | `oracle-scraper.cjs` → `shouldProcessProduct()`, `registerSeenProduct()` |
| **Discovery Score** | Pontua produtos por desconto, avaliação, vendas, comissão | `oracle-scraper.cjs` → `calculateShopeeDiscoveryScore()` |
| **Selection Engine** | Aplica limites inteligentes por categoria/loja/marca | `oracle-scraper.cjs` → `runMarketplaceSelectionEngine()` |
| **Candidate Queue** | Valida, ordena e empacota os produtos selecionados | `oracle-scraper.cjs` → `createMarketplaceCandidateQueue()`, `validateMarketplaceCandidate()` |
| **Pipeline Integration** | Orquestra todas as camadas em uma só chamada | `oracle-scraper.cjs` → `runShopeeOfficialPipeline()` |
| **Buscar Tendências (API)** | Endpoint que aciona o pipeline e retorna os Candidates | `src/app/api/scraper/trends/route.ts` |
| **Marketplace Presenter** | Adapta MarketplaceCandidate para o formato do Frontend | `src/lib/presenters/marketplace-candidate.ts` → `presentMarketplaceCandidate()` |
| **Manual Review Queue** | Fila de curadoria manual com status e ordenação por score | `oracle-scraper.cjs` → `MarketplaceManualReviewQueue` |
| **Frontend (Dashboard)** | Renderiza os candidates retornados e exibe badges | `src/components/dashboard/trends-action.tsx` |

---

## Componentes

### `oracle-scraper.cjs`
Motor principal. Contém todas as camadas do pipeline até a Manual Review Queue.

### `src/lib/presenters/marketplace-candidate.ts`
Função `presentMarketplaceCandidate(candidate)` — converte `MarketplaceCandidate` para o formato esperado pelo frontend, incluindo badges objetivos.

### `src/app/api/scraper/trends/route.ts`
Ponto de entrada HTTP. Intercepta requisições para a Shopee e aciona `runShopeeOfficialPipeline()`. Preserva o fluxo legado para os demais marketplaces.

### `src/components/dashboard/trends-action.tsx`
Componente React que dispara o "Buscar Tendências" e renderiza os resultados retornados diretamente sem precisar salvar no banco de dados.

---

## Status da Manual Review Queue

```js
MANUAL_REVIEW_STATUS = {
  PENDING, APPROVED, REJECTED, EXPIRED, POSTED, ERROR
}
```

Sem strings hardcoded. A fila é persistida em `reports/manual_review_queue.json`.

---

## Dependências

- **Shopee API Oficial**: Necessária para o Discovery (chave via `.env`).
- **Crawlee + Playwright**: Apenas no script Node.js, marcados como `serverExternalPackages` no Next.js para evitar bundling.
- **Sem banco de dados**: O pipeline de curadoria manual opera localmente.
- **Sem IA**: Nenhuma chamada LLM no fluxo da Shopee.

---

## Próximas Integrações (EPIC 10+)

- Tela de aprovação manual no Dashboard (listagem da `ManualReviewQueue`)
- Ação de `APPROVE` → aciona Ranking → IA → Draft → Publicação
- Persistência da fila no Supabase (substituindo o JSON local)
