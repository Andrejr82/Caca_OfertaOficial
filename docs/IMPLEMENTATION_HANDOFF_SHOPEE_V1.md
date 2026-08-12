# IMPLEMENTATION HANDOFF — Motor Oficial de Busca e Ranking Shopee V1

<!-- branch: feat/shopee-search-engine-v1-v2 -->
<!-- commit-base: d0969de (origin/main) -->
<!-- gerado em: 2026-08-12 -->
<!-- plano-fonte: origin/docs/shopee-ranking-v1:docs/IMPLANTACAO_MOTOR_BUSCA_SHOPEE_V1.md -->

---

## 1. Baseline Git

| Campo | Valor |
|---|---|
| Branch | `feat/shopee-search-engine-v1-v2` |
| Commit-base | `d0969de` - Merge pull request #62 |
| Referencia oficial | `origin/main` |
| Ancestralidade | CONFIRMADA: origin/main e ancestral direto |
| Main alterada | NAO |
| Producao alterada | NAO |

ATENCAO: Branch anterior `feat/shopee-search-engine-v1` preservada com stash. Nao fazer merge, rebase ou cherry-pick sem revisao explicita.

---

## 2. Plano-fonte

`origin/docs/shopee-ranking-v1:docs/IMPLANTACAO_MOTOR_BUSCA_SHOPEE_V1.md`
Secoes lidas integralmente: 1-23.

---

## 3. Arquitetura proposta (sec. 3)

```
[Categoria / intencao]
  -> Plano de consultas (scenarioId + categoryKey + queries)
  -> Shopee productOfferV2 (HMAC-SHA256, 30s timeout, 2 tentativas)
  -> Normalizacao (tipos, %, URLs, identidade)
  -> Identidade e dedup (shopee:{shopId}:{itemId})
  -> Validacao semantica (confianca 0-1, codigos de rejeicao estaveis)
  -> Filtros comerciais (eliminatorios configuráveis)
  -> Score explicavel (0-100, breakdown, razoes, desempate)
  -> Top candidatos (Top 2 por categoria)
  -> WhatsApp / Telegram
```

### Camadas (sec. 3.1)

| Camada | Responsabilidade |
|---|---|
| Contrato Open API | Operacao, variaveis e campos oficiais |
| Cliente Shopee | Assinar, executar, timeout, paginacao, erros |
| Normalizador | Converter tipos, %, URLs, identidade |
| Politica de categoria | Confirmar produto principal, bloquear incompatibilidades |
| Filtros comerciais | Limites eliminatorios configuráveis |
| Ranking | Score, desempates, justificativas |
| Orquestrador | Consultas por cenario, dedupe, Top N |
| Consumidores | Radar, Oracle, matching, publicacao |

### Nucleo compartilhado (sec. 22.4)

```
shopee-search-core/
  contract          # candidato normalizado e resultado de decisao
  taxonomy          # categorias, intencao, bloqueios e acessorios
  metrics           # preco, desconto, rating, vendas, confianca
  policy            # aceita/rejeita com codigos explicaveis
  ranking           # score e desempate estavel
  strategy-version  # shopee-ranking-v1
```

Regra absoluta: o nucleo nao acessa rede, Supabase, Vercel, PM2 ou canais.
- Oracle adapter: Open API -> normalizacao -> nucleo -> persistencia/checkpoint
- Vercel adapter: requisicao manual -> adapter -> nucleo -> resposta/fila

---

## 4. Contrato de dados do candidato (sec. 4)

```typescript
export interface ShopeeRankedCandidate {
  marketplace: "Shopee";
  strategyVersion: "shopee-ranking-v1";
  itemId: string;
  shopId: string;
  productName: string;
  categoryId: string | null;
  categoryKey: string;
  queryTerm: string;
  productUrl: string | null;
  affiliateUrl: string;
  imageUrl: string | null;
  currentPrice: number;
  maximumPrice: number | null;
  rating: number;
  sales: number;
  discountPercent: number;
  commissionPercent: number;
  shopeeCommissionPercent: number | null;
  sellerCommissionPercent: number | null;
  shopTypes: number[];
  semanticConfidence: number;
  score: number;
  scoreBreakdown: Record<string, number>;
  determiningReasons: string[];
  capturedAt: string;
}
```

Regras de normalizacao (sec. 4.1):
- Precos em reais como number
- Comissao/desconto em percentual 0-100 (fracoes 0-1 convertidas)
- Nao somar componentes de comissao sem confirmacao contratual
- Titulo normalizado apenas para matching; original preservado para publicacao
- affiliateUrl obrigatorio para selecao automatica
- Identidade unica: shopee:{shopId}:{itemId}
- Data de captura em UTC ISO 8601

---

## 5. Plano de busca (sec. 5)

### Entrada (sec. 5.1)
```typescript
interface ShopeeSearchRequest {
  scenarioId: string;
  categoryKey: string;
  limitPerQuery?: number;    // padrao 20
  maximumPages?: number;     // padrao 1
  maximumResults?: number;   // padrao 2 por categoria
  strategyVersion?: string;
}
```

### Chamada oficial (sec. 5.3)
Operacao: productOfferV2, sortType: 2, isAMSOffer: true
Campos obrigatorios: itemId, shopId, productName, productLink, offerLink, imageUrl, priceMin, priceMax, ratingStar, sales, priceDiscountRate, commissionRate, shopeeCommissionRate, sellerCommissionRate, shopType, productCatIds, pageInfo

### Resiliencia (sec. 5.4)
- Timeout por chamada: 30 segundos
- Maximo 2 tentativas para erros transitorios (429, 5xx, timeout), com backoff + jitter
- Nao repetir erros de autenticacao ou contrato
- Respeitar limite de 8000 req/h
- Limitar concorrencia por execucao
- Registrar: recebidos, aceitos, rejeitados, motivo predominante
- Falha de uma consulta nao invalida categorias independentes

---

## 6. Protecao semantica (sec. 6)

### Confianca semantica (sec. 6.4)
| Pontuacao | Condicao |
|---|---|
| 1.0 | Correspondencia exata com classe principal |
| 0.9 | Alias reconhecido + categoria nativa compativel |
| 0.5-0.8 | Correspondencia parcial suficiente |
| Rejeicao imediata | Termo bloqueado ou padrao de acessorio |
| Rejeicao | Abaixo de 0.5 |

### 10 codigos de rejeicao estaveis
missing_native_identity, missing_affiliate_url, invalid_price, semantic_mismatch, accessory_mismatch, native_category_mismatch, rating_below_threshold, sales_below_threshold, commission_below_threshold, duplicate_product

### Politicas iniciais (sec. 6.3)
| Categoria | Classes aceitas | Exemplos bloqueados |
|---|---|---|
| Celulares | smartphone, iPhone, Galaxy, Redmi, Poco, Motorola | capa, pelicula, suporte, fone, kit de reparo |
| Eletrodomesticos | liquidificador, cafeteira, air fryer, batedeira, chaleira | copo, lamina avulsa, escova, refil, peca |
| Moveis | cadeira, sofa, mesa, armario, rack, comoda | capa, almofada, protetor, tecido |
| TV e Audio | Smart TV, soundbar, caixa de som | controle remoto, suporte, cabo, monitor |
| Moda | camisa, blusa, tenis, calca | pet, bebe quando fora da intencao |
| Casa e Cozinha | cama, faqueiro, utensilio, panela | reposicao ou peca incompativel |

NOTA: politica e contextual, nao uma blacklist global.

---

## 7. Filtros comerciais (sec. 7)

| Criterio | Regra | Comportamento |
|---|---|---|
| Identidade | itemId e shopId validos | Eliminatorio |
| Link | offerLink HTTPS valido | Eliminatorio para publicacao automatica |
| Preco | priceMin > 0 | Eliminatorio |
| Relevancia semantica | >= 0.50 | Eliminatorio |
| Avaliacao | >= 4.5 | Eliminatorio |
| Vendas | >= 10 | Eliminatorio |
| Comissao | >= 3% | Eliminatorio |
| Loja | tipos 1, 2 ou 4 | Bonificacao; configuravel como filtro |
| Desconto | sem minimo global | Usado no ranking |

Regra de cobertura: >=2 aprovados -> Top 2; 1 aprovado -> retornar 1 + registrar; 0 aprovados -> no_qualified_candidate. Nunca completar com item reprovado.

IMPORTANTE: Todos os limites em configuracao versionada, sem numeros magicos no adaptador.

---

## 8. Ranking oficial V1 (sec. 8)

### Pesos (sec. 8.1)
| Metrica | Peso |
|---|---:|
| Relevancia semantica | 25 |
| Demanda/vendas | 20 |
| Desconto | 15 |
| Avaliacao | 10 |
| Qualidade/tipo da loja | 10 |
| Comissao | 10 |
| Competitividade de preco | 5 |
| Atualidade | 5 |
| Total | 100 |

### Formula V1 (sec. 8.2)
```
score =
  25 x semantic_relevance
+ 20 x min(1, log10(sales+1)/4)
+ 15 x min(1, discountPercent/50)
+ 10 x (rating/5)
+ 10 x shop_quality (1 para tipo 1,2,4)
+ 10 x min(1, commission/15)
+  5 x price_competitiveness (vs mediana da intencao)
+  5 x freshness (1=captura atual)
```

### Desempate deterministico (sec. 8.3)
1. maior score (sem arredondamento)
2. maior confianca semantica
3. maior volume de vendas
4. maior avaliacao
5. maior desconto
6. menor preco
7. shopId:itemId crescente

### Explicabilidade (sec. 8.4)
```json
{
  "score": 94.6,
  "score_breakdown": {
    "semantic_relevance": 25, "sales": 18.9, "discount": 15,
    "rating": 9.6, "shop_quality": 10, "commission": 8.7,
    "price": 5, "freshness": 2.4
  },
  "determining_reasons": [
    "Produto principal confirmado", "Mais de 5 mil vendas",
    "60% de desconto", "Comissao de 13%"
  ]
}
```

---

## 9. Arquivos por fase (sec. 9)

### 9.1 Novos arquivos
| Arquivo | Conteudo |
|---|---|
| src/lib/shopee/ranking/types.ts | Tipos: candidato, politica, score, rejeicao |
| src/lib/shopee/ranking/normalization.ts | Normalizacao: numeros, %, textos, URLs |
| src/lib/shopee/ranking/category-policies.ts | Politicas semanticas versionadas |
| src/lib/shopee/ranking/semantic-validator.ts | Validacao produto principal/acessorio |
| src/lib/shopee/ranking/commercial-filters.ts | Filtros eliminatorios configuráveis |
| src/lib/shopee/ranking/score.ts | Formula V1, breakdown, desempates |
| src/lib/shopee/ranking/search-service.ts | Orquestracao, dedupe, Top N |
| src/lib/shopee/ranking/__tests__/* | Testes unitarios e snapshots sanitizados |

### 9.2 Arquivos existentes a modificar
| Arquivo | Alteracao |
|---|---|
| src/lib/trends/shopee-search-adapter.ts | Delegar busca/ranking ao novo servico |
| scripts/contracts/shopee-openapi-v1/productOfferV2.cjs | Adicionar teste de compatibilidade |
| scripts/shopee-openapi-shadow-engine-v1.cjs | Referenciar politicas sem duplicar ranking |
| scripts/shopee-scenario-config.cjs | Migrar listas para politica estruturada |
| src/core/trends/offer-matching.ts | Substituir lista global por regras contextuais |
| src/lib/trends/shopee-evidence-collector.ts | Incluir comissao, shop type, score/rejeicao |
| src/app/api/trends/match/route.ts | Usar servico ranqueado + registrar strategy_version |

---

## 10. Banco de dados e persistencia (sec. 10)

### 10.1 Estrutura existente aproveitada
offers ja possui: produto, categoria, URL, imagem, preco, avaliacao, comissao, score, shopee_item_id, shopee_shop_id, marketplace_metrics, explainability, posicoes.

### 10.2 Sem nova tabela para V1
- offers.score ou new_score -> score final
- offers.marketplace_metrics -> metricas normalizadas
- offers.explainability -> breakdown, razoes, codigos de rejeicao

### 10.3 Colunas recomendadas
| Coluna | Tipo | Motivo |
|---|---|---|
| captured_at | timestamptz | Diferenciar captura da criacao |
| search_term | text | Auditoria da consulta originadora |
| strategy_version | text | Reproduzir e comparar rankings |
| semantic_confidence | numeric | Qualidade da classificacao |
| stock_status | text | Evitar publicacao de item indisponivel |

Alternativa sem migracao imediata: guardar 5 campos em marketplace_metrics.

### 10.4 Indices recomendados
```sql
create unique index concurrently if not exists offers_shopee_identity_uq
on public.offers (user_id, shopee_shop_id, shopee_item_id)
where platform = 'Shopee' and shopee_shop_id is not null and shopee_item_id is not null;

create index concurrently if not exists offers_shopee_strategy_score_idx
on public.offers (user_id, strategy_version, score desc, captured_at desc)
where platform = 'Shopee';
```

ATENCAO: qualquer migration deve preservar RLS e ser validada antes de aplicar em producao.

---

## 11. Integracoes consumidoras (sec. 11)

| Consumer | Comportamento esperado |
|---|---|
| Radar de tendencias | Candidatos aprovados apenas; registrar strategyVersion e scoreBreakdown |
| Oracle | Fonte de consulta direta; Data Feeds passam pelo mesmo validador |
| Publicacao Expressa | Aceitar link manual; enriquecer via itemId; bloquear se semanticamente incompativel |
| WhatsApp e Telegram | Titulo curto, preco, desconto, prova social, link afiliado; revalidar antes de publicar |

---

## 12. Seguranca (sec. 12)

- Credenciais somente no servidor
- SHOPEE_APP_SECRET nunca exposto em cliente, logs ou respostas
- Sanitizar erros GraphQL antes de responder ao cliente
- Redigir cabecalhos de autorizacao e payloads assinados nos logs
- Timeout e limite de concorrencia obrigatorios
- Autenticacao e autorizacao nas rotas internas
- Nunca persistir resposta bruta com dados desnecessarios

---

## 13. Observabilidade (sec. 13)

### Metricas por execucao
chamadas Open API, duracao total e p95, candidatos recebidos, aprovados e rejeitados, taxa de rejeicao por codigo, cobertura por categoria, score medio e distribuicao, duplicidades removidas, erros de auth/contrato/timeout/limite, publicacoes originadas e conversao

### Log estruturado obrigatorio
```json
{
  "event": "shopee_search_completed",
  "strategy_version": "shopee-ranking-v1",
  "scenario_id": "eletrodomesticos_cozinha",
  "category_key": "eletrodomesticos",
  "received": 40,
  "approved": 8,
  "rejected": 32,
  "top_rejection_codes": ["accessory_mismatch", "rating_below_threshold"],
  "duration_ms": 1840
}
```

---

## 14. Estrategia de testes (sec. 14)

### 14.1 Testes unitarios obrigatorios
normalizacao de taxa fracionaria e percentual, precos invalidos e ausentes, acentos e espacos, identidade shopId:itemId, confianca semantica, bloqueio contextual de acessorios, excecao valida quando acessorio e a intencao, filtros de nota/vendas/comissao, calculo exato de cada componente do score, desempate deterministico, deduplicacao

### 14.2 Casos de regressao (10 casos obrigatorios)
| Consulta | Produto | Esperado |
|---|---|---|
| smartphone | capa para smartphone | Rejeitar |
| smartphone | kit para troca de tela | Rejeitar |
| smartphone | aparelho Galaxy | Aceitar |
| liquidificador | escova para garrafa/liquidificador | Rejeitar |
| liquidificador | liquidificador Mondial | Aceitar |
| cadeira de escritorio | capa de cadeira | Rejeitar |
| cadeira de escritorio | cadeira ergonomica | Aceitar |
| Smart TV | controle remoto | Rejeitar |
| Smart TV | televisao 4K | Aceitar |
| controle remoto | controle remoto compativel | Aceitar (intencao explicita) |

### 14.3 Testes de contrato
assinatura HMAC com relogio controlado, operacao e variaveis corretas, campos de productOfferV2, resposta com errors GraphQL, timeout e 429, paginacao e hasNextPage, ausencia de campos opcionais

### 14.4 Testes de integracao
Open API simulada -> motor -> Top 2, rota de matching -> candidato ranqueado, persistencia opcional -> leitura de score/explainability, revalidacao antes da publicacao, nenhuma consulta a tabela de ofertas durante a descoberta

### 14.5 Teste ao vivo controlado
- Executar categorias com credenciais de ambiente protegido
- NAO persistir na primeira execucao
- Confirmar links, preco e identidade manualmente em amostra
- Guardar apenas fixtures sanitizadas (sem credenciais)

---

## 15. Matriz completa de tasks

### Fase 0 - Preparacao
| ID | Task | Status |
|---|---|---|
| T00 | Criar branch de trabalho a partir de origin/main | CONCLUIDA (esta branch) |
| T01 | Inventariar consumidores do adaptador | Pendente |
| T02 | Congelar fixtures sanitizadas da simulacao | Pendente |
| T03 | Registrar baseline atual | Pendente |

### Fase 1 - Nucleo
| ID | Task | Arquivo | Status |
|---|---|---|---|
| T10 | Criar tipos do dominio | src/lib/shopee/ranking/types.ts | Pendente |
| T11 | Criar normalizadores + testes | src/lib/shopee/ranking/normalization.ts | Pendente |
| T12 | Criar politicas semanticas | src/lib/shopee/ranking/category-policies.ts | Pendente |
| T13 | Criar validador contextual | src/lib/shopee/ranking/semantic-validator.ts | Pendente |
| T14 | Criar filtros comerciais | src/lib/shopee/ranking/commercial-filters.ts | Pendente |
| T15 | Criar formula e desempates | src/lib/shopee/ranking/score.ts | Pendente |
| T16 | Criar orquestrador | src/lib/shopee/ranking/search-service.ts | Pendente |

### Fase 2 - Integracao
| ID | Task | Arquivo | Status |
|---|---|---|---|
| T20 | Atualizar adaptador Shopee | src/lib/trends/shopee-search-adapter.ts | Pendente |
| T21 | Integrar evidence collector | src/lib/trends/shopee-evidence-collector.ts | Pendente |
| T22 | Atualizar matching | src/core/trends/offer-matching.ts | Pendente |
| T23 | Integrar Oracle | oracle-scraper.cjs + oracle-worker-discovery-only.cjs | Bloqueada (T10-T16) |
| T24 | Integrar publicacao | src/app/api/trends/match/route.ts | Bloqueada (T20-T22) |

### Fase 3 - Dados e observabilidade
| ID | Task | Status |
|---|---|---|
| T30 | Definir persistencia V1 (JSONB ou migration minima) | Pendente |
| T31 | Revisar consultas e indices (sec. 10.4) | Pendente |
| T32 | Validar RLS/advisors | Pendente |
| T33 | Instrumentar eventos e logs estruturados (sec. 13) | Pendente |
| T34 | Criar alertas operacionais | Pendente |

### Fase 4 - Qualidade
| ID | Task | Status |
|---|---|---|
| T40 | Testes unitarios (sec. 14.1) | Pendente |
| T41 | Testes de contrato (sec. 14.3) | Pendente |
| T42 | Testes de integracao (sec. 14.4) | Pendente |
| T43 | Teste visual do consumidor | Pendente |
| T44 | Revisao de seguranca (sec. 12) | Pendente |

### Fase 5 - Implantacao Vercel
| ID | Task | Status |
|---|---|---|
| T50 | Adicionar feature flag SHOPEE_RANKING_V1_ENABLED | Bloqueada (aprovacao) |
| T51 | Deploy Preview | Bloqueada (T40-T44) |
| T52 | Shadow mode (comparacao antigo x novo, >= 1 ciclo) | Bloqueada (T51) |
| T53 | Ativacao gradual 10% -> 50% -> 100% | Bloqueada (T52 estavel) |
| T54 | Verificacao pos-deploy | Bloqueada (T53) |
| T55 | Documentar operacao (runbook e rollback) | Pendente |

### Tasks Oracle (sec. 22.8)
| ID | Task | Status |
|---|---|---|
| TO01 | Inventariar PM2/runtime sem expor segredos | Pendente |
| TO02 | Consolidar schedule do worker | Pendente |
| TO03 | Extrair nucleo compartilhado | Bloqueada (T10-T16) |
| TO04 | Integrar nucleo ao oracle-scraper | Bloqueada (TO03) |
| TO05 | Atualizar DEPLOY_FILES | Pendente |
| TO06 | Fortalecer manifesto e hashes | Pendente |
| TO07 | Validar overlay fail-closed | Pendente |
| TO08 | Remover defaults sensiveis do deploy | Pendente |
| TO09 | Criar testes de contrato Oracle | Pendente |
| TO10 | Criar dry-run/shadow verificavel | Bloqueada (TO03, TO04) |
| TO11 | Validar idempotencia/checkpoints | Pendente |
| TO12 | Validar integracao Oracle->Vercel | Pendente |
| TO13 | Executar canario por categoria | Bloqueada (TO10 + aprovacao) |
| TO14 | Documentar runbook PM2 | Pendente |
| TO15 | Observar dois ciclos completos | Bloqueada (TO13) |

### TOTAL: 39 tasks (T00-T55 = 24 Vercel + TO01-TO15 = 15 Oracle)

---

## 16. Dependencias criticas (sec. 16)

T12 -> T13 -> T14 -> T15 -> T16 -> T20 -> T42 -> T52 -> T53
TO03 -> TO04 -> TO10 -> TO13 -> TO15

---

## 17. Criterios de aceite (sec. 17)

### Funcionais
- Busca direta via productOfferV2; zero leitura de offers durante descoberta
- Produto sem itemId/shopId validos nunca selecionado
- Acessorios incompativeis rejeitados contextualmente
- Filtros minimos configuráveis e versionados
- Top N ordenado pelo score oficial com breakdown e razoes
- Deduplicacao por shopee:{shopId}:{itemId}
- Cobertura insuficiente nao preenchida com item reprovado

### Qualidade
- 100% dos 10 casos de regressao aprovados
- Formula e desempates deterministicos
- Sem regressao no contrato GraphQL
- Sem novo alerta critico de seguranca ou banco
- Logs sem credenciais

### Operacionais
- Feature flag e rollback testados
- Shadow mode comparado por >= 1 ciclo editorial completo
- Taxa de falso positivo menor que baseline
- Revalidacao executada antes da publicacao

---

## 18. Rollout e rollback (sec. 18)

### Rollout
1. Deploy Preview com API simulada
2. Teste ao vivo protegido, sem persistencia
3. Shadow mode: motor novo executa, nao decide
4. Comparar Top N, rejeicoes e cobertura
5. Ativar 10% das execucoes
6. Avancar para 50% apos estabilidade
7. Ativar 100%
8. Manter codigo anterior durante janela de seguranca

### Rollback
- Desativar SHOPEE_RANKING_V1_ENABLED
- Retornar ao adaptador anterior sem migracao reversa
- Colunas novas permanecem inertes; nao remover durante incidente

### Gatilhos de rollback
aumento relevante de erros Open API, queda de cobertura, falso positivo critico, link afiliado invalido, aumento de latencia, erro de publicacao do novo contrato

---

## 19. Auditoria Vercel (sec. 21)

| Item | Estado | Impacto |
|---|---|---|
| Runtime | Node.js 24.x | Compativel com fetch, crypto, AbortSignal |
| Build | Next.js 16.2.2 + Turbopack | Testes devem cobrir bundle server-side CJS |
| Regiao | iad1 | Distante do Supabase SP; medir antes de gru1 |
| Deploy recente | READY, Preview | Rollout deve comecar em Preview |
| Deploy automatico | Apenas main e staging | Branch exige Preview manual |
| Cron existente | /api/instagram/poll-comments diariamente | Nenhum cron Shopee configurado |
| Projeto live | false no snapshot | Confirmar alias producao antes de rollout |

---

## 20. Oracle - flags e implantacao (sec. 22)

### Flags minimas (sec. 22.6)
| Controle | Funcao | Default |
|---|---|---|
| engine V1 | habilita consulta e avaliacao | false ate shadow |
| persistencia V1 | permite gravar aprovados | false ate aceite |
| strategy version | identifica politica aplicada | shopee-ranking-v1 |
| limites por ciclo/categoria | impede explosao de volume | valores certificados |
| atraso e jitter | respeita limites Open API | valores conservadores |
| timeout do ciclo | encerra execucao presa | abaixo do proximo ciclo |
| write lock | bloqueio emergencial | true no preflight/shadow |

### Fronteira de responsabilidade (sec. 22.10)
| Runtime | Deve fazer | Nao deve fazer |
|---|---|---|
| Oracle | Descoberta, normalizacao, politica/ranking, persistencia, checkpoint | Publicar automaticamente ou manter regra paralela |
| Vercel | Busca manual, Official AI, painel, revisao, rotas de publicacao | Duplicar scheduler autoritativo sem ADR |
| Supabase | Estado, idempotencia, filas, auditoria, metricas | Decidir categoria ou score sozinho |
| PM2/systemd | Supervisao e monitoramento operacional | Alterar regras de negocio |

---

## 21. Credenciais (somente status)

| Credencial | Status |
|---|---|
| SHOPEE_APP_ID | NAO VERIFICADA |
| SHOPEE_APP_SECRET | NAO VERIFICADA |
| SUPABASE_SERVICE_ROLE_KEY | NAO VERIFICADA |
| NEXT_PUBLIC_SUPABASE_URL | NAO VERIFICADA |
| ORACLE_API_KEY | NAO VERIFICADA |
| OFFICIAL_AI_TRIGGER_URL | NAO VERIFICADA |
| GROQ_API_KEY | NAO VERIFICADA |

ATENCAO CRITICA: Nenhuma credencial deve aparecer em codigo, logs, manifesto ou Git.

---

## 22. Protecoes de producao

PROIBIDO:
- Alterar ou sincronizar main local
- Modificar origin/main
- Executar merge automatico
- Aplicar migrations no Supabase produtivo
- Reiniciar PM2 na Oracle VPS
- Promover deployment Vercel para producao
- Publicar em Telegram, WhatsApp, Instagram ou Facebook
- Reutilizar codigo da branch antiga sem revisao
- Versionar credenciais

---

## 23. Proximo passo exato

Pre-condicoes:
1. git branch --show-current -> feat/shopee-search-engine-v1-v2
2. git log --oneline -1 -> d0969de (= origin/main HEAD)
3. npm run test -> baseline verde

Sequencia de implementacao (Prompt 2):
```
feat(shopee-core): add domain types (T10)
feat(shopee-core): add normalization module (T11)
feat(shopee-core): add category policies (T12)
feat(shopee-core): add semantic validator (T13)
feat(shopee-core): add commercial filters (T14)
feat(shopee-core): add score formula and tiebreakers (T15)
feat(shopee-core): add search service orchestrator (T16)
test(shopee-core): add unit and regression tests (T40-T41)
feat(shopee): update search adapter (T20)
feat(shopee): update evidence collector (T21)
feat(shopee): update offer matching (T22)
[AWAIT APPROVAL] Oracle integration (TO03-TO04)
[AWAIT APPROVAL] Deploy Preview + Shadow mode (T51-T52)
```

---

Handoff recriado em: 2026-08-12
Branch: feat/shopee-search-engine-v1-v2
Commit-base: d0969de (origin/main)
Tasks mapeadas: 39 (T00-T55 + TO01-TO15)
