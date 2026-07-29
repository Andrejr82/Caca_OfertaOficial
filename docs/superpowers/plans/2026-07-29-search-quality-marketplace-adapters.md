# Search Quality Marketplace Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Aplicar validação de preço, equivalência, frescor, diversidade e métricas por marketplace sem alterar publicação ou persistência fora da fila.

**Architecture:** Cada marketplace fornece identidade e validação próprias; uma camada comum decide frescor, desconto material e diversidade antes da fila. A execução começa em modo observação/flag desligada.

**Tech Stack:** Node.js CommonJS, testes `node:test`, Supabase history já existente.

## Global Constraints

- Não apagar ofertas ou histórico.
- Não inferir Pix, parcelamento ou cupom.
- Não atualizar a Oracle antes do merge e da verificação.
- Cooldown padrão de 7 dias; queda mínima material de 10%.

### Task 1: Contrato de qualidade por marketplace

**Files:** Create `scripts/marketplace-search-quality.cjs`; Test `scripts/tests/marketplace-search-quality.test.cjs`.

- [x] Definir identidade ML por item/catalog, Shopee por shop+item e Amazon por ASIN.
- [x] Validar preço positivo e desconto somente com preço anterior oficial.
- [x] Comparar família apenas quando houver identidade confiável.
- [x] Expor métricas de aceitação/rejeição sem persistência.

### Task 2: Integração segura

**Files:** Modify `scripts/oracle-worker-discovery-only.cjs`; Modify `scripts/update-oracle.js`.

- [ ] Aplicar o avaliador somente antes da fila.
- [ ] Manter a flag desligada por padrão.
- [ ] Preservar fallback seguro para candidatos sem identidade.

### Task 3: Verificação

- [ ] Rodar testes direcionados e type/syntax checks da PR.
- [ ] Abrir PR e aguardar Vercel.
- [ ] Atualizar Oracle somente após aprovação.
