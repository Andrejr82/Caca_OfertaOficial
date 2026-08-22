# Radar VNext Benchmark First Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o ranking comercial V4 por um Radar VNext que prove competitividade contra peers reais antes de priorizar oportunidades.

**Architecture:** Reaproveitar descoberta, identidade, freshness, histórico, persistência e UI atuais. Promover a inteligência de peers/achadinho já existente para um scorer VNext compartilhado, executar em shadow mode contra V4 e só então trocar o caminho oficial.

**Tech Stack:** Next.js, TypeScript/Node.js, CommonJS runtime Oracle, Supabase/Postgres, Vitest, Shopee Affiliate OpenAPI, APIs oficiais Mercado Livre.

**Spec:** `docs/RADAR_VNEXT_DESIGN_2026-08-22.md`

## Global Constraints
- Nenhuma alteração em Trends durante a fase de auditoria inicial.
- Não tocar `video-worker`.
- Não alterar prompt Gemini.
- Não publicar ofertas automaticamente.
- Não inventar preço, comissão, vendas, rating, desconto ou velocity.
- Fail-closed em monetização e identidade.
- Reaproveitar código existente antes de criar módulos novos.
- Evitar vários deploys Vercel; consolidar em um único deploy final do bloco VNext.
- Auditoria da VPS Oracle somente via Gemini, com prompt fornecido ao usuário.

---

### Task 0: Auditoria factual do runtime Oracle

**Objetivo:** confirmar exatamente qual arquivo/processo está rodando e quais módulos são carregados antes de mudar código.

**Alterações:** nenhuma.

**Prompt Gemini para Oracle:**

```text
AUDITORIA SOMENTE LEITURA — NÃO ALTERE NADA NA VPS.
Projeto: /home/ubuntu/Caca_OfertaOficial
Processo esperado: oracle-trends-radar (PM2 ID 12).
NÃO toque/reinicie o processo video-worker (PM2 ID 5).

Quero evidência factual do runtime atual do Tendências IA.

1. Mostre `pm2 describe oracle-trends-radar` e identifique script path, cwd, env relevante e status.
2. Mostre o comando/script efetivamente iniciado pelo PM2.
3. A partir desse entrypoint, trace os `require/import` até o collector Shopee, collector Mercado Livre, scorer, selector e persistência final.
4. Confirme se `scripts/shopee-achadinho-v12.cjs` é carregado pelo runtime real. Mostre a cadeia exata de arquivos que prova SIM ou NÃO.
5. Confirme se o runtime efetivo passa por:
   - scripts/oracle-trends-radar-worker.cjs
   - scripts/oracle-trends-radar-runner-final.cjs
   - scripts/oracle-trends-radar-runner.cjs
   - scripts/oracle-trends-radar-engine.cjs
6. Informe o SHA atual do git em /home/ubuntu/Caca_OfertaOficial e se há arquivos modificados localmente.
7. Não reinicie PM2, não faça git pull, não edite arquivos, não rode migrations.

Retorne somente:
A) Runtime efetivo
B) Cadeia de imports
C) Achadinho V1.2 ativo: SIM/NÃO + prova
D) SHA e git status
E) Divergências encontradas
```

**Aceite:** cadeia de runtime comprovada sem alteração da VPS.

---

### Task 1: Congelar baseline V4 e criar fixtures de comparação

**Files:**
- Create: `src/tests/trends/fixtures/radar-vnext-baseline.ts`
- Create: `src/tests/trends/radar-vnext-baseline.test.ts`

**Produz:** conjunto fixo de candidatos representando: peer forte, solo com desconto alto, catálogo caro, achadinho barato, kit, produto ML sem comissão pública.

- [ ] Capturar exemplos factuais do último snapshot e transformar em fixtures sanitizadas.
- [ ] Escrever testes que reproduzam os comportamentos indesejados do V4 sem mudar produção.
- [ ] Confirmar que os testes descrevem o baseline atual.
- [ ] Commit destacado; não atualizar `main`.

---

### Task 2: Consolidar inteligência de peers do Achadinho

**Files:**
- Reuse: `scripts/shopee-achadinho-v12.cjs`
- Create: `src/core/trends/benchmark-peer-engine.cjs`
- Test: `src/tests/trends/benchmark-peer-engine.test.ts`

**Interfaces:**
- `classifyBenchmarkFamily(candidate)`
- `buildBenchmarkContext(candidate, pool)`
- retorno: `peerCount`, `peerConfidence`, `priceMin`, `priceMedian`, `priceMax`, `priceVsMedianPercent`, `benchmarkStatus`.

- [ ] Escrever testes primeiro para famílias equivalentes, kits e peers insuficientes.
- [ ] Extrair/reaproveitar lógica existente sem duplicar regex desnecessariamente.
- [ ] Garantir `MEDIUM/HIGH` somente com >=3 peers.
- [ ] Garantir que `LOW/NONE` não afirme preço competitivo.
- [ ] Commit destacado.

---

### Task 3: Implementar Commercial Opportunity Score VNext

**Files:**
- Create: `src/core/trends/commercial-opportunity-score-vnext.cjs`
- Test: `src/tests/trends/commercial-opportunity-score-vnext.test.ts`

**Produz:** `calculateCommercialOpportunityScoreVNext(candidate, context)`.

**Breakdown:**
- competitiveness: 30
- demandAcceleration: 20
- offerStrength: 15
- economicReturn: 10
- reputation: 10
- internalConversion: 10
- executionQuality: 5

- [ ] Teste: solo com 70% de desconto não ganha competitividade comprovada.
- [ ] Teste: melhor preço com >=3 peers ganha vantagem real.
- [ ] Teste: comissão alta não salva produto catálogo ruim sozinha.
- [ ] Teste: produto barato excepcional pode superar produto caro comum.
- [ ] Teste: ausência de histórico interno é neutra; histórico suficiente com zero venda não é positivo.
- [ ] Teste: ML sem comissão pública não é promovido automaticamente para TESTAR.
- [ ] Implementar score mínimo até todos os testes passarem.
- [ ] Commit destacado.

---

### Task 4: Remover quotas de ticket da seleção VNext

**Files:**
- Create: `src/core/trends/radar-vnext-selector.cjs`
- Test: `src/tests/trends/radar-vnext-selector.test.ts`

**Produz:** `selectRadarVNext(candidates, {maxProducts})`.

- [ ] Testar ordenação estrita por score VNext.
- [ ] Testar diversidade por família e loja.
- [ ] Testar que ticket não reserva vagas.
- [ ] Testar que podem sair menos de 20 produtos quando qualidade insuficiente.
- [ ] Testar que vários impulse podem entrar se forem melhores.
- [ ] Commit destacado.

---

### Task 5: Shadow mode V4 x VNext

**Files:**
- Modify: `scripts/oracle-trends-radar-runner.cjs`
- Create: `scripts/radar-vnext-shadow.cjs`
- Test: `scripts/__tests__/radar-vnext-shadow.test.js`

**Produz:** VNext calcula resultado em paralelo, sem substituir snapshot oficial.

- [ ] Adicionar flag explícita de shadow mode.
- [ ] Reusar exatamente o mesmo candidate pool do V4.
- [ ] Persistir apenas diagnóstico de comparação em `source_health` ou log estruturado aprovado; não criar publicação/oferta.
- [ ] Medir overlap Top20, delta de preço, peer confidence, scores e motivos.
- [ ] Commit destacado.

---

### Task 6: Comparar 3 runs reais

**Alterações:** nenhuma no algoritmo durante a coleta.

- [ ] Solicitar 3 Radars em janelas distintas.
- [ ] Comparar V4 x VNext.
- [ ] Critérios mínimos:
  - queda forte de produtos `solo` tratados como competitivos;
  - Top 20 com benchmark explícito;
  - nenhum ML de score baixo promovido só por fallback;
  - diversidade preservada;
  - melhores oportunidades baratas não bloqueadas por quota;
  - nenhum dado inventado.
- [ ] Registrar relatório em `docs/RADAR_VNEXT_SHADOW_VALIDATION_2026-08-XX.md`.

---

### Task 7: Tornar VNext o seletor oficial

**Files:**
- Modify: `scripts/oracle-trends-radar-runner.cjs`
- Modify/retire path: `scripts/oracle-trends-radar-runner-final.cjs`
- Reuse: collectors e freshness existentes.
- Test: `scripts/__tests__/oracle-trends-radar-runner.test.js`

- [ ] Criar teste que prova a cadeia oficial VNext.
- [ ] Retirar V4 da decisão final sem apagar fallback de rollback imediatamente.
- [ ] Remover promoção automática `IGNORAR -> TESTAR` por marketplace.
- [ ] Remover quotas fixas de ticket do caminho ativo.
- [ ] Preservar contratos de persistência existentes.
- [ ] Commit destacado.

---

### Task 8: Persistir benchmark e explicabilidade VNext

**Files:**
- Preferir `direct_evidence`/JSON existente.
- Migration somente se a auditoria provar que JSON não atende consultas necessárias.
- Modify: `scripts/oracle-trends-radar-engine.cjs` ou módulo VNext responsável pela persistência.
- Test: snapshot schema tests existentes.

- [ ] Persistir peer confidence/count/min/median/max.
- [ ] Persistir price-vs-median e benchmark status.
- [ ] Persistir score version e breakdown.
- [ ] Persistir razões de gate/exclusão.
- [ ] Evitar nova tabela se JSON atual for suficiente (YAGNI).
- [ ] Commit destacado.

---

### Task 9: Atualizar UI Tendências IA

**Files:**
- Modify: `src/lib/trends/radar-queries.ts`
- Modify: `src/components/trends/trends-commercial-selection-desk.tsx`
- Test: componentes/queries Trends existentes + novos testes focados.

- [ ] Mostrar benchmark preço vs mediana.
- [ ] Mostrar peer count/confidence.
- [ ] Mostrar `competitividade não comprovada` quando necessário.
- [ ] Mostrar score VNext e 3 razões principais.
- [ ] Não adicionar complexidade visual desnecessária.
- [ ] Commit destacado.

---

### Task 10: Regressão de handoff/aprovação

**Files:**
- Reuse/verify: `src/lib/trends/selection-actions.ts`
- Reuse tests de approval/handoff.

- [ ] Garantir que VNext não muda materialização segura de ofertas.
- [ ] Garantir imagem/link/monetização fail-closed.
- [ ] Garantir zero publicação automática.
- [ ] Garantir campanha e Vídeos continuam independentes.
- [ ] Commit apenas se correção for necessária.

---

### Task 11: Limpeza arquitetural mínima

**Objetivo:** só depois de VNext comprovado.

- [ ] Mapear funções V4 realmente sem chamadas.
- [ ] Remover somente código morto comprovado por busca/testes.
- [ ] Não refatorar por estética.
- [ ] Manter rollback simples até validação final.
- [ ] Commit destacado.

---

### Task 12: Gate final e único deploy

**Skills:** `superpowers:verification-before-completion` obrigatório.

- [ ] Rodar `npm run verify` no pacote consolidado.
- [ ] Rodar testes específicos do Radar VNext e arquitetura.
- [ ] Conferir migrations: nenhuma DDL desnecessária.
- [ ] Revisar diff consolidado contra a spec.
- [ ] Confirmar que `video-worker` não foi tocado.
- [ ] Confirmar que campanha/Gemini não foram alterados.
- [ ] Atualizar `main` uma única vez com o bloco aprovado.
- [ ] Aguardar um único deploy Vercel e validar `READY`.
- [ ] Depois do deploy, auditar Oracle via prompt Gemini antes de qualquer restart/sync.

## Ordem de execução amanhã
`Task 0 -> 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> decisão humana -> 7 -> 8 -> 9 -> 10 -> 11 -> 12`

Não pular Task 6. O VNext só substitui V4 depois da comparação factual em shadow mode.
