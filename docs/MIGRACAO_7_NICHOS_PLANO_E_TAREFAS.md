# Plano de Migração e Tarefas — Nova Arquitetura dos 7 Nichos Comerciais

Este documento registra o plano diretor, a matriz de rastreabilidade de tarefas e o progresso da migração da matriz legada de 14 cenários para a nova arquitetura dos **7 Nichos Comerciais** do Caça Oferta Oficial.

---

## 1. Visão Geral dos 7 Nichos Comerciais

A nova arquitetura comercial substitui as antigas buscas genéricas por 7 verticais de alta densidade e relevância, organizadas em três camadas de catálogo (**Core**, **Expansion**, **Opportunity**) com pesos de **Afinidade por Marketplace (1–3)** e guardrails rígidos anti-peças/acessórios:

1. **Casa, Cozinha e Organização** (`casa_cozinha_organizacao`) — Volume + recorrência.
2. **Beleza e Cuidados Pessoais** (`beleza_cuidados_pessoais`) — Conversão + recorrência.
3. **Moda e Calçados** (`moda_calcados`) — Grande volume.
4. **Eletrodomésticos** (`eletrodomesticos`) — Ticket alto (somente aparelho final).
5. **Informática** (`informatica`) — Ticket médio/alto (dispositivos acabados).
6. **Ferramentas** (`ferramentas`) — Demanda consistente / ticket médio.
7. **Pet** (`pet`) — Forte recorrência de recompra.

---

## 2. Matriz de Tarefas e Status de Implementação

### Fase 1: Fundação, Contratos e Testes Locais de Shadow (Branch `feat/nichos-comerciais-v1`)
- [x] Criar `scripts/commercial-niche-config.cjs` com a definição canônica dos 7 nichos, listas Core/Expansion, pesos de afinidade (1–3), guardrails e mapeamento de cenários legados.
- [x] Criar `scripts/commercial-niche-contracts.cjs` integrando nós de navegação Amazon (fusão de Casa+Organização), categorias certificadas Shopee e domínios do Mercado Livre.
- [x] Criar `scripts/commercial-niche-runtime-adapter.cjs` implementando o escalonamento de termos de busca por nível de afinidade e inclusão de sinais de oportunidade.
- [x] Criar `scripts/commercial-niche-shadow-runner.cjs` para execução paralela de ciclos shadow com comparador de métricas (`legacyCount`, `nicheCount`, `overlapCount`, etc.) e garantia de `persisted = false`.
- [x] Atualizar `scripts/scenario-runtime-contract.cjs` para suportar metadados opcionais shadow (`commercialNicheId`, `commercialNicheAffinity`, `commercialNicheTier`, `commercialShadow = true`) sem quebrar runtime legado.
- [x] Integrar invocação do shadow runner em `scripts/oracle-scraper.cjs` sob flag `COMMERCIAL_NICHE_SHADOW=1` ou CLI `--commercial-niche-shadow` com zero efeitos colaterais de persistência.
- [x] Criar suíte de testes unitários e de integração:
  - [x] `scripts/tests/commercial-niche-config.test.cjs`
  - [x] `scripts/tests/commercial-niche-contracts.test.cjs`
  - [x] `scripts/tests/commercial-niche-runtime-adapter.test.cjs`
  - [x] `scripts/tests/commercial-niche-affinity.test.cjs`
  - [x] `scripts/tests/commercial-niche-shadow.test.cjs`
- [x] Validar taxonomia Shopee contra o catálogo oficial `scripts/shopee-native-categories.json`.
- [x] Executar simulação e dry-run das 21 combinações (7 nichos x 3 marketplaces).

### Fase 2: Testes Controlados na Oracle VPS em Shadow (Pendente)
- [ ] Executar teste controlado na VPS Oracle com flag `--commercial-niche-shadow --dry-run` para coleta de latência real.
- [ ] Avaliar overlap e diversidade com chamadas reais Scrape.do, Shopee GraphQL e Mercado Livre REST.
- [ ] Validar tempo de execução do ciclo shadow e ausência de HTTP 429 no Mercado Livre.

### Fase 3: Transição Ativa e Alinhamento de Grade / UI (Pendente)
- [ ] Atualizar grade de horários de discovery e cron no `oracle-scraper.cjs` quando aprovada a transição para modo ativo.
- [ ] Atualizar mensagens de introdução de ciclo em `src/config/cycle-intros.ts`.
- [ ] Atualizar grade visual de estratégia em `src/app/(dashboard)/strategy/page.tsx`.
- [ ] Promover para `main` e aplicar na Oracle em produção.

---

## 3. Taxonomia e Categorias Certificadas Shopee

Validado e comprovado contra `scripts/shopee-native-categories.json` e `scripts/shopee-openapi-shadow-engine-v1.cjs`:

| Nicho Comercial | IDs de Categoria Shopee | Descrição Oficial na API |
|---|---|---|
| `casa_cozinha_organizacao` | `100010, 100636` | `New BAU Comm - Home Appliances`, `New BAU Comm - Home & Construction` |
| `beleza_cuidados_pessoais` | `100630, 100001` | `New BAU Comm - Beauty`, `New BAU Comm - Health` |
| `moda_calcados` | `100009, 100011, 100012, 100017, 100532, 100534` | `Fashion Accessories`, `Men Clothes`, `Men Shoes`, `Women Clothes`, `Women Shoes`, `Watches` |
| `eletrodomesticos` | `100010` | `New BAU Comm - Home Appliances` |
| `informatica` | `100644, 100013` | `New BAU Comm - Computers & Accessories`, `New BAU Comm - Mobile & Gadgets` |
| `ferramentas` | `100636` | `New BAU Comm - Home & Construction` |
| `pet` | `100631` | `New BAU Comm - Pets` |

---

## 4. Evidência do Dry-Run (21 Combinações: 7 Nichos x 3 Marketplaces)

| # | Niche ID | Marketplace | Termos Usados | Nós / Categorias / Domínios | Affinity | Limit | Retornados | Aceitos | Rejeitados | Persisted | Erro |
|---|---|---|---|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 | `casa_cozinha_organizacao` | Amazon | air fryer, cafeteira (+21) | 17100532011, 17124722011, 17124716011, 17100533011, 17100522011, 17124717011 | 3 | 10 | 92 | 10 | 82 | **false** | null |
| 2 | `casa_cozinha_organizacao` | Shopee | air fryer, cafeteira (+21) | 100010, 100636 | 3 | 10 | 92 | 10 | 82 | **false** | null |
| 3 | `casa_cozinha_organizacao` | Mercado Livre | air fryer, cafeteira (+21) | MLB-AIR_FRYERS, MLB-COFFEE_MAKERS (+8) | 3 | 10 | 92 | 10 | 82 | **false** | null |
| 4 | `beleza_cuidados_pessoais` | Amazon | protetor solar facial (+15) | 16754345011, 16754346011, 16754347011 | 3 | 10 | 64 | 9 | 55 | **false** | null |
| 5 | `beleza_cuidados_pessoais` | Shopee | protetor solar facial (+15) | 100630, 100001 | 3 | 10 | 64 | 9 | 55 | **false** | null |
| 6 | `beleza_cuidados_pessoais` | Mercado Livre | protetor solar facial (+11) | MLB-FACIAL_SUNSCREENS, MLB-FACIAL_MOISTURIZERS (+6) | 2 | 7 | 36 | 7 | 29 | **false** | null |
| 7 | `moda_calcados` | Amazon | tênis masculino (+12) | 17681970011, 17681966011, 23577004011 | 2 | 7 | 39 | 7 | 32 | **false** | null |
| 8 | `moda_calcados` | Shopee | tênis masculino (+16) | 100009, 100011, 100012, 100017, 100532, 100534 | 3 | 10 | 68 | 10 | 58 | **false** | null |
| 9 | `moda_calcados` | Mercado Livre | tênis masculino (+12) | MLB-SNEAKERS, MLB-MENS_T_SHIRTS (+5) | 2 | 7 | 39 | 7 | 32 | **false** | null |
| 10 | `eletrodomesticos` | Amazon | geladeira, lavadora (+13) | 16745371011, 17124786011, 16745366011 | 3 | 10 | 60 | 9 | 51 | **false** | null |
| 11 | `eletrodomesticos` | Shopee | geladeira, lavadora (+10) | 100010 | 2 | 7 | 36 | 7 | 29 | **false** | null |
| 12 | `eletrodomesticos` | Mercado Livre | geladeira, lavadora (+13) | MLB-REFRIGERATORS, MLB-WASHING_MACHINES (+5) | 3 | 10 | 60 | 9 | 51 | **false** | null |
| 13 | `informatica` | Amazon | notebook, monitor (+11) | 16243803011, 16243794011, 24035344011 | 3 | 10 | 52 | 7 | 45 | **false** | null |
| 14 | `informatica` | Shopee | notebook, monitor (+8) | 100644, 100013 | 2 | 7 | 30 | 6 | 24 | **false** | null |
| 15 | `informatica` | Mercado Livre | notebook, monitor (+11) | MLB-NOTEBOOKS, MLB-MONITORS (+4) | 3 | 10 | 52 | 7 | 45 | **false** | null |
| 16 | `ferramentas` | Amazon | furadeira, parafusadeira (+11) | 165793011, 165796011 | 3 | 10 | 52 | 7 | 45 | **false** | null |
| 17 | `ferramentas` | Shopee | furadeira, parafusadeira (+11) | 100636 | 3 | 10 | 52 | 7 | 45 | **false** | null |
| 18 | `ferramentas` | Mercado Livre | furadeira, parafusadeira (+11) | MLB-DRILLS, MLB-SCREWDRIVERS (+4) | 3 | 10 | 52 | 7 | 45 | **false** | null |
| 19 | `pet` | Amazon | ração cachorro, areia gato (+9) | 19653951011, 19653950011, 19653948011 | 3 | 10 | 44 | 6 | 38 | **false** | null |
| 20 | `pet` | Shopee | ração cachorro, areia gato (+9) | 100631 | 3 | 10 | 44 | 6 | 38 | **false** | null |
| 21 | `pet` | Mercado Livre | ração cachorro, areia gato (+9) | MLB-DOG_FOODS, MLB-CAT_FOODS (+2) | 3 | 10 | 44 | 6 | 38 | **false** | null |

---

## 5. STATUS DA ETAPA SHADOW — 2026-08-24

### Concluído
- Construção de toda a camada de contratos, adapters e runners shadow dos 7 nichos comerciais.
- Mapeamento e testes automatizados de afinidade por marketplace (1–3), respeitando as cotas de Core, Expansion e limites de candidatos.
- Isolamento absoluto do runtime: `persisted = false` em 100% das rotinas shadow.
- 100% dos testes da suíte comercial e de contratos legados com status **PASS**:
  - `commercial-niche-config.test.cjs` (PASS)
  - `commercial-niche-contracts.test.cjs` (PASS)
  - `commercial-niche-runtime-adapter.test.cjs` (PASS)
  - `commercial-niche-affinity.test.cjs` (PASS)
  - `commercial-niche-shadow.test.cjs` (PASS)
  - `editorial-canonical-matrix-cleanup.test.cjs` (PASS)
  - `marketplace-scenario-contracts.test.cjs` (PASS)
  - `shopee-openapi-v1-contract.test.cjs` (PASS)
  - `ml-catalog-source-order.test.cjs` (PASS)
  - `apps/oracle-capacity-hunter` (PASS)
- Proteção estrita de integridade operacional:
  - `CRON_SCHEDULE = '0 6-20 * * *'` mantido intacto.
  - Zero escritas no Supabase (`offers`, `posts`, `affiliate_links` preservados).
  - Oracle em produção não alterada.
  - Vercel sem ações manuais ou deploys disparados.
  - Nenhum commit ou push realizado até a validação formal do usuário.

### Pendente
- Executar teste controlado read-only na Oracle via CLI `--commercial-niche-shadow --dry-run` para medição de latência real e telemetria de rede.
- Análise comparativa final das métricas de extração (overlap e novelty) antes da decisão de migração da grade ativa.

### Evidências
- 16 novos testes unitários e de integração criados e passando.
- Matriz de 21 combinações de dry-run cobrindo 100% dos nichos e marketplaces.
- Prova documental dos IDs de categoria Shopee extraídos diretamente de `shopee-native-categories.json`.

### Riscos Reais Identificados
1. **Densidade de Requisições na API do Mercado Livre**: Em nichos com até 23 termos (ex: `casa_cozinha_organizacao`), rajadas de busca podem incorrer em HTTP 429 se o intervalo de 300ms entre intents for violado ou o token OAuth estiver próximo da expiração.
2. **Classificação em Categorias Amplas da Shopee**: A categoria `100636` (Home & Construction) exige a manutenção rigorosa dos guardrails `blockedProductTerms` para evitar o vazamento de peças industriais ou materiais de construção no pool.
3. **Latência Acumulada em Múltiplos Browse Nodes Amazon**: A fusão de 6 nós de navegação para `casa_cozinha_organizacao` amplia o tempo de scraping no Scrape.do em ~8–12 segundos por ciclo.
4. **Volume de Catálogo em Intents Secundárias**: O gate `MIN_PRODUCTS_PER_INTENT = 10` no Mercado Livre pode demandar fallback para `/highlights/MLB/category/` em dias com baixa oferta ativa em termos específicos.

### Próximo Gate: Teste Controlado na Oracle
- Executar execução controlada na Oracle em modo shadow/dry-run pontual (sem agendamento automático e sem escrita em banco), coletando o log formatado da comparação.
