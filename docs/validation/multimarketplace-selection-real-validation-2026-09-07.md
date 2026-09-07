# Relatório de Validação Real Controlada — Seleção Multimarketplace

- **Data:** 2026-09-07
- **Base SHA:** `ea44c615`
- **Branch:** `feature/multimarketplace-selection-v2`
- **Plano:** `docs/superpowers/plans/2026-09-07-selecao-multimarketplace-sprints.md`
- **Ambiente:** Testes locais isolados (Node Test Runner / Vitest) sem conexão de escrita em produção.

---

## 1. Resultados da Validação do Golden Set (60 Casos Reais)

| Marketplace | Total Casos | MUST_ACCEPT | MUST_REJECT | Taxa de Acerto | Descarte Explicado |
|---|---|---|---|---|---|
| **Amazon** | 20 | 10 | 10 | 100% (20/20) | 100% (10/10 com motivo `ACCESSORY_ONLY_PRODUCT`) |
| **Mercado Livre** | 20 | 10 | 10 | 100% (20/20) | 100% (10/10 com motivo `ACCESSORY_ONLY_PRODUCT`) |
| **Shopee** | 20 | 10 | 10 | 100% (20/20) | 100% (10/10 com motivo `ACCESSORY_ONLY_PRODUCT`) |
| **Total Consolidado** | **60** | **30** | **30** | **100% (60/60)** | **100% (30/30 explicados)** |

---

## 2. Contabilidade do Funil de Descoberta e Seleção

- **Candidatos Brutos Extraídos:** 60
- **Após Parse:** 60
- **Após Relevância & Semântica:** 60
- **Após Deduplicação de Identidade:** 60
- **Após Quality Gate (Produto Principal):** 30 (30 descartados com motivo `ACCESSORY_ONLY_PRODUCT`)
- **Após Freshness:** 30 (todos elegíveis como novos ou revalidados)
- **Após Classificação de Domínio:** 30 (100% classificados)
- **Selecionados para Fila:** 30
- **Enviados para RPC (Simulação):** 30
- **Inseridos/Persistidos:** 30
- **Perdas Não Contabilizadas (`unaccounted`):** **0** (saldo fechado em 100%)

---

## 3. Comportamento dos Novos Contratos e Motores

1. **`CandidateDecisionV2`**:
   - Proveniência mapeada em 100% das evidências.
   - Preço de referência implausível (menor/igual que atual ou desconto > 85% sem histórico) neutralizado sem perda do produto.
   - Identidade nativa validada (ASIN para Amazon, MLB para Mercado Livre, ItemId para Shopee).

2. **Identidade e Deduplicação Cross-Marketplace**:
   - `exactKey`, `familyKey` e `crossMarketplaceKey` determinísticos.
   - Produtos de especificações diferentes (ex.: monitores de 24 vs 27 polegadas) mantidos independentes.
   - Produtos idênticos deduplicados selecionando a menor oferta válida.

3. **Freshness & Ciclo de Vida**:
   - 4 estados explícitos (`new`, `known_unpublished`, `published_cooldown`, `material_change`).
   - Bloqueio de repetição sem melhoria material comprovada.
   - Revalidação permitida para itens conhecidos não publicados.

4. **Motor Canônico de Qualidade**:
   - Decomposição em 5 pilares: semântica (25), evidência (25), valor (25), logística (15), freshness (10).
   - Ausência de dados tratada como neutra (sem NaN ou erros de tipo).

5. **Seleção de Portfólio**:
   - Limites de cotas respeitados (`maxTotal`, `maxPerMarketplace`, `maxPerCategory`, `maxPerFamily`, `maxPerSeller`).
   - Zero padding artificial com produtos fracos.
