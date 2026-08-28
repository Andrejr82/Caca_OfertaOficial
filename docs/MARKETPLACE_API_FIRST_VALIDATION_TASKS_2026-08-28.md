# Marketplace API-First — Tasks de Execução para Gemini

> Status: **runbook de implementação**.
>
> Documento mestre: [`MARKETPLACE_API_FIRST_VALIDATION_PLAN_2026-08-28.md`](MARKETPLACE_API_FIRST_VALIDATION_PLAN_2026-08-28.md).
>
> Base: `main` em `1bf08df46b7aafd897af2e88ed327b1a15937f2d`.
>
> Regra absoluta: **não fazer merge para `main`**. A branch só poderá ser mergeada depois que toda a execução for entregue para validação independente.

## Contrato geral para o Gemini

Antes de executar qualquer task:

- ler integralmente o plano mestre e este runbook;
- revisar `contexto_Chat.md` e documentação canônica atual;
- confirmar branch de trabalho separada da `main`;
- não criar arquitetura paralela, serviço novo ou motor novo quando um componente existente puder ser corrigido;
- não imprimir secrets;
- não alterar Supabase manualmente;
- não aplicar migration;
- não alterar scheduler;
- não fazer deploy;
- não alinhar/reiniciar Oracle até a task marcada como **ORACLE**;
- fazer commits pequenos e temáticos;
- registrar testes e evidências após cada task;
- se descobrir que uma premissa do plano está errada, parar a task específica, documentar a evidência e corrigir o plano antes de seguir;
- manter PR em draft, se um PR for aberto;
- nunca executar merge.

---

# Fase 0 — Isolamento e baseline

## Task 0.1 — Preparar a branch de implementação

**Prioridade:** P0.

### Objetivo

Garantir que toda alteração de código e documentação fique isolada até a validação final.

### Procedimento esperado

1. `git fetch origin`;
2. partir da branch documental que contém este plano;
3. criar/usar `fix/api-first-marketplace-validation-v1`;
4. confirmar que a base contém o SHA `1bf08df46b7aafd897af2e88ed327b1a15937f2d` no histórico;
5. confirmar `git status` limpo;
6. não tocar na `main`.

### Evidência obrigatória

```text
BRANCH=
HEAD=
BASE_MAIN=1bf08df46b7aafd897af2e88ed327b1a15937f2d
WORKTREE_CLEAN=YES
```

### Critério de aceite

Branch isolada e nenhum arquivo produtivo alterado antes do baseline.

---

## Task 0.2 — Capturar baseline do código atual

**Prioridade:** P0.

### Revisar obrigatoriamente

- `scripts/oracle-worker-discovery-only.cjs`;
- `scripts/curation-policy.cjs`;
- `scripts/product-title-quality.cjs`;
- `scripts/classification-coverage.cjs`;
- `scripts/marketplace-classification-catalog.json`;
- `scripts/mercadolivre-official-intents-v5.cjs`;
- `scripts/mercadolivre-domain-category-map-v1.cjs`;
- `scripts/commercial-niche-runtime-adapter.cjs`;
- `scripts/marketplace-scenario-contracts.cjs`;
- adapter/controlled persist Shopee V1 efetivamente chamado pelo runtime;
- coletor/adapter Amazon efetivamente chamado pelo runtime;
- testes existentes desses módulos.

### Entrega

Produzir uma tabela `componente -> responsabilidade -> entrada -> saída -> etapa do funil -> testes existentes`.

### Critério de aceite

Nenhuma mudança de código nesta task.

---

# Fase 1 — Inventário de fontes e credenciais

## Task 1.1 — Confirmar fonte real de Mercado Livre

**Prioridade:** P0.

### Objetivo

Provar qual fluxo oficial usa as credenciais reais do projeto.

### Fazer

- localizar refresh/autenticação existente;
- localizar função produtiva chamada no ciclo Oracle;
- confirmar que a busca oficial passa pelo V1 atual;
- confirmar `scenarioId`, keywords/families, aliases, domain/category e offsets efetivamente usados;
- listar variáveis de ambiente necessárias **apenas pelos nomes**, nunca valores;
- confirmar quais endpoints oficiais são chamados;
- confirmar quais campos comerciais realmente vêm da API.

### Não fazer

- não imprimir token;
- não copiar secret para report;
- não testar via site público como fonte principal.

### Evidência

Tabela com:

```text
source_name | function | endpoint_kind | auth_env_names | scenario_input | pagination | fields_observed
```

---

## Task 1.2 — Confirmar fonte real de Shopee

**Prioridade:** P0.

### Objetivo

Provar quais fontes OpenAPI V1 participam do ciclo oficial.

### Confirmar

- wrapper oficial chamado pela Oracle;
- `includeDelta` efetivo;
- `includeAuxiliary` efetivo;
- fontes como `productOffers`, `DELTA`, `shopOfferV2`, `shopeeOfferV2` ou seus nomes atuais;
- ProductCatIds/categorias utilizadas;
- identidade nativa (`shop_id`, `item_id` ou equivalente);
- campos de rating, vendas, desconto, comissão, preço e imagem realmente disponíveis.

### Evidência

Contagem por fonte e lista dos nomes de env necessários sem valores.

---

## Task 1.3 — Determinar fonte real da Amazon

**Prioridade:** P0.

### Objetivo

Não assumir API autenticada se ela não existir.

### Fazer

- identificar o coletor efetivamente chamado pelo `Amazon_Top20_extraction`;
- verificar se o projeto possui integração oficial autenticada utilizável;
- listar apenas nomes de credenciais/env, se existirem;
- se não houver API oficial ativa, declarar explicitamente `AMAZON_OFFICIAL_API_AVAILABLE=NO` e usar o retorno bruto do coletor existente para as tasks seguintes;
- não criar scraping/navegador alternativo.

### Critério de aceite

Fonte da Amazon tecnicamente comprovada, sem inferência.

---

# Fase 2 — Diagnóstico API/source-first

## Task 2.1 — Criar/estender relatório diagnóstico sem criar motor novo

**Prioridade:** P0.

### Objetivo

Fazer o runtime existente explicar todo o funil por marketplace e família.

### Regra arquitetural

Preferir estender telemetry/reports já existentes. Só criar um script de diagnóstico pequeno em `scripts/tests/` ou `scripts/` se não existir forma segura de executar os adapters diretamente. Esse script não pode ser chamado pelo runtime produtivo.

### Campos mínimos

```text
marketplace
scenarioId
family
searchIntent
source
page_or_offset
raw_received
after_parse
semantic_accepted
semantic_rejected
known_identity_rejected
scenario_mismatch_rejected
title_quality_rejected
quality_gate_rejected
after_identity_dedup
classified
unknown
review_required
ranking_eligible
queue_selected
inserted
updated
ignored
failed
rejection_reasons
```

### Invariante obrigatória

Para cada etapa:

```text
input = output + primary_rejections
```

### Testes

- reconciliação exata de contadores;
- item rejeitado tem uma razão primária;
- `not_applicable` não vira zero enganoso;
- secrets são redigidos/ignorados;
- relatório não contém headers de autenticação.

---

## Task 2.2 — Snapshot direto do Mercado Livre por família

**Prioridade:** P0.

### Objetivo

Consultar o fluxo oficial com as credenciais do runtime antes de alterar novos filtros.

### Primeiro cenário

`informatica_editorial`.

### Famílias mínimas a observar

- notebook;
- monitor;
- SSD;
- impressora/multifuncional;
- roteador;
- mini PC/desktop/computador;
- teclado;
- mouse;
- webcam;
- HD externo;
- scanner;
- nobreak;
- switch de rede;
- demais Core/Expansion efetivamente configuradas no nicho.

### Capturar por família/alias

- offsets tentados;
- tamanho bruto de cada página;
- resultado após semântica;
- domínio/categoria;
- motivo de parada da paginação;
- erros de fonte;
- candidatos finais.

### Critério crítico

Uma página bruta cheia não pode encerrar a busca apenas porque poucos itens passaram no filtro.

### Entrega

Matriz `família x offset x raw x accepted x rejected x stop_reason`.

---

## Task 2.3 — Snapshot direto da Shopee por fonte/categoria

**Prioridade:** P0.

### Objetivo

Separar problema de busca de problema de filtro.

### Capturar

- bruto por fonte;
- bruto por categoria/família;
- duplicados cross-source;
- semântica aceita/rejeitada;
- rejeições por domínio/classe/categoria;
- classificação;
- candidatos fortes disponíveis antes da seleção final.

### Verificações específicas

- garantir que `includeDelta/includeAuxiliary` não regrediu;
- localizar filamento 3D, 3D pen e kits de manutenção, se aparecerem;
- registrar em qual etapa cada um morre ou sobrevive.

---

## Task 2.4 — Snapshot Amazon antes dos filtros finais

**Prioridade:** P0.

### Objetivo

Provar a qualidade da busca e medir onde acessórios vencem.

### Capturar por intenção

- bruto;
- Browse Node/categoria;
- title-quality;
- relevance;
- classificação;
- quality score;
- posição antes/depois do ranking;
- fila.

### Procurar explicitamente

- organizador de cabos;
- kits de limpeza;
- suporte para laptop/roteador;
- suporte/adapter SSD;
- webcam com “notebook” no título;
- mini PC com “SSD” no título;
- teclado/computador classificados em Pet.

### Critério

Demonstrar quantitativamente se o defeito está em busca, filtro, classificação, score ou selector.

---

# Fase 3 — Golden set e testes antes de novas correções

## Task 3.1 — Consolidar fixtures reais

**Prioridade:** P0.

### Objetivo

Transformar os erros observados em regressões permanentes.

### Negativos mínimos

- organizador/enrolador de cabos;
- kit limpeza eletrônico;
- suporte laptop/roteador;
- suporte SSD;
- SSD adapter;
- filamento 3D;
- kit manutenção impressora 3D.

### Precedência/classificação mínima

- Mini PC + SSD -> mini PC/computador;
- Webcam + notebook -> webcam;
- teclado -> teclado, não Pet;
- computador -> computador, não Pet;
- scanner real -> scanner;
- detector RF/parede retornado por scanner -> rejeitado;
- switch ethernet/gigabit -> network switch;
- caneta 3D -> nunca printer por palavra secundária.

### Positivos

Manter produtos principais reais de todas as famílias Core/Expansion relevantes para provar que o gate não virou excessivamente restritivo.

### Critério de aceite

Teste falha quando qualquer regressão histórica volta a passar.

---

# Fase 4 — Correções Mercado Livre

## Task 4.1 — Fechar contabilidade de perdas ML

**Prioridade:** P0.

### Objetivo

Eliminar gaps como `13 -> 5` sem reason count.

### Fazer

- contabilizar identidade já conhecida antes do estágio de novelty;
- contabilizar scenario mismatch;
- contabilizar title/semantic/domain rejection;
- manter uma única razão primária por etapa;
- expor family/intent nos counters.

### Aceite

Nenhum item desaparece entre a saída do adapter e o próximo estágio sem motivo auditável.

---

## Task 4.2 — Validar e corrigir profundidade por família

**Prioridade:** P0.

### Objetivo

Usar todo o orçamento seguro já previsto pelo fluxo atual antes de declarar uma família esgotada.

### Fazer

- preservar certified-first;
- preservar exploração editorial estrita;
- validar offsets `0/30/60/90` ou o teto atual do código;
- parada baseada em página bruta curta, budget, erro ou condição canônica;
- não aumentar chamadas sem necessidade quando a família já produziu pool suficiente;
- manter forbidden domains, negative terms e classificação estrita.

### Testes

- página 30 bruta com poucos aceitos -> próxima página deve ser consultada;
- página bruta curta -> pode parar;
- domínio proibido nunca entra;
- acessório nunca entra para intenção de produto principal;
- erro de uma família não apaga telemetria das demais.

---

## Task 4.3 — Diversidade ML baseada em strong families

**Prioridade:** P1.

### Objetivo

Evitar 5 roteadores quando existem outras famílias fortes já aprovadas pelos gates.

### Implementação

Reutilizar o selector/fila existente. Não criar outro ranking.

- agrupar candidatos elegíveis por família;
- ordenar dentro da família pelo score atual;
- selecionar em rodadas por família;
- permitir repetição após a primeira rodada;
- se só existir uma família forte, não inventar diversidade;
- registrar `family_diversity_count` e motivo de eventual concentração.

### Testes

- 5 famílias fortes, 5 vagas -> preferência por 5 famílias;
- 2 famílias fortes, 5 vagas -> ambas aparecem antes de concentração máxima;
- 1 família forte -> não preencher com fracas;
- produto muito superior pode vencer exceção documentada sem quebrar o gate.

---

# Fase 5 — Correções Amazon

## Task 5.1 — Validar `product-title-quality` em dados reais

**Prioridade:** P0.

### Objetivo

Provar que os acessórios reais do ciclo são barrados sem bloquear produtos principais.

### Fazer

- rodar o golden set;
- rodar amostra bruta real da Task 2.4;
- ampliar padrões somente para falsos negativos comprovados;
- não bloquear palavras secundárias quando o produto principal é claro;
- preservar intenções explicitamente acessórias, se existirem no contrato.

### Aceite

Zero negativos do golden set chegam elegíveis à fila de Informática.

---

## Task 5.2 — Corrigir falsos positivos do classificador

**Prioridade:** P0.

### Fazer

- produto principal antes de menção secundária;
- catálogo de Informática não pode cair em Pet por regex amplo;
- `Mini PC ... SSD` mantém classe principal;
- `Webcam ... notebook` mantém classe principal;
- semântica `scanner` e `switch de rede` continua específica.

### Aceite

Golden set 100% correto e amostra real sem falsos positivos absurdos.

---

## Task 5.3 — Provar ranking e seleção Amazon

**Prioridade:** P1.

### Objetivo

Confirmar que preço/score legado não promove item pior que produto principal comercialmente superior.

### Capturar para Top candidatos

- score bruto legado;
- discount;
- savings;
- rating/reviews;
- official store;
- shipping;
- warnings/penalties;
- score final;
- reason de seleção/rejeição.

### Aceite

Nenhum acessório vence por score; produtos principais fortes dominam; diversidade entra após os gates sem padding.

---

# Fase 6 — Correções Shopee

## Task 6.1 — Fechar semântica de 3D/acessórios

**Prioridade:** P0.

### Fazer

- filamento 3D -> acessório/consumível para este nicho;
- kit de manutenção -> acessório;
- 3D pen -> nunca classificada como printer apenas por palavras secundárias;
- manter impressora 3D principal elegível apenas se o nicho/contrato realmente a permitir.

### Testes

Golden set + amostra real por todas as fontes V1.

---

## Task 6.2 — Deduplicação cross-source e diversidade

**Prioridade:** P1.

### Objetivo

Evitar que volume duplicado de uma mesma família domine o controlled persist.

### Fazer

- confirmar identidade canônica de item/loja;
- deduplicar equivalentes entre fontes antes da seleção final;
- aplicar diversidade após gates;
- reutilizar selector/controlled persist existente;
- registrar contagem por família antes/depois.

### Aceite

Quando houver várias famílias fortes, mouse/teclado não monopolizam a seleção apenas por terem mais ocorrências brutas.

---

# Fase 7 — Regressão cruzada e qualidade do funil

## Task 7.1 — Teste de reconciliação completo

**Prioridade:** P0.

### Fazer

Para cada marketplace, verificar programaticamente:

```text
raw -> parse -> relevance/semantic -> quality -> dedup -> classification -> ranking -> queue
```

### Aceite

Todos os deltas têm razão primária e os contadores fecham.

---

## Task 7.2 — Testes focados obrigatórios

Executar os testes existentes e os novos diretamente relacionados a:

- `product-title-quality`;
- curation policy;
- classification coverage;
- Mercado Livre domain/category/search V1;
- Mercado Livre canonical classifier;
- commercial niche runtime adapter;
- Shopee ProductCatIds/OpenAPI V1 e controlled persist;
- Amazon curation;
- selector/diversidade alterado.

Depois executar as validações gerais que o repositório suportar, incluindo:

```text
npm run docs:audit
npm run verify
```

Se `npm run verify` falhar por dependência externa não relacionada, registrar exatamente a falha; não escondê-la.

---

## Task 7.3 — Smoke dos sete nichos sem produção

**Prioridade:** P1.

### Objetivo

Garantir que regex/selector/classificação não ficaram específicos demais para Informática.

### Nichos

- casa_cozinha_editorial;
- beleza_editorial;
- informatica_editorial;
- moda_editorial;
- ferramentas_editorial;
- pet_editorial;
- eletrodomesticos_editorial.

### Fazer

Preferir fixtures/local adapters/mocks ou dry-run existente. Não rodar sete ciclos produtivos Oracle nesta task.

### Aceite

Nenhum bloqueio estrutural evidente e nenhuma classificação cruzada introduzida.

---

# Fase 8 — ORACLE: prova controlada real

## Task 8.1 — Preparar release candidato sem merge

**ORACLE: SIM — envolve VPS/runtime produtivo.**

**Prioridade:** P0 após todos os testes locais.

### Regra

Não fazer merge para `main`. A prova deve usar a branch/commit candidato somente se o procedimento operacional existente permitir isso com segurança e autorização do usuário. Caso o contrato operacional exija `main`, **parar aqui** e retornar para validação; não inventar deploy alternativo.

### Antes de qualquer execução

Entregar ao usuário:

- branch;
- HEAD SHA;
- `git status`;
- testes;
- diff summary;
- riscos;
- comando/prompt exato para Oracle.

### Proibido

- migrations;
- mudanças de env;
- scheduler;
- secrets;
- limpeza de banco;
- deploy Vercel;
- execução de outros cenários sem autorização.

---

## Task 8.2 — Ciclo controlado de `informatica_editorial`

**ORACLE: SIM.**

Quando autorizado, executar somente o procedimento canônico já suportado pelo projeto para esse cenário.

### Capturar

- release SHA;
- cycle/correlation id;
- tempo total;
- contadores completos por marketplace;
- family diversity;
- rejection reasons;
- source telemetry;
- inserted/updated/failed.

### Aceite Mercado Livre

- sem gap inexplicado;
- classificação correta;
- profundidade observável;
- diversidade quando a API realmente oferece várias famílias fortes.

### Aceite Amazon

- zero acessórios do golden set persistidos;
- classificação correta;
- ranking comercial coerente;
- diversidade quando há famílias fortes disponíveis.

### Aceite Shopee

- fontes V1 completas;
- acessórios 3D indevidos rejeitados;
- classificação correta;
- concentração controlada quando há alternativas fortes.

---

# Fase 9 — Supabase read-only e auditoria dos produtos finais

## Task 9.1 — Conferir persistência real

**Supabase: somente leitura.**

### Consultar pelo cycle/correlation id

Para cada marketplace:

- quantidade afetada;
- inserted vs updated;
- status final;
- título;
- preço;
- categoria/família;
- classificação;
- rejection/manual review quando aplicável;
- metadados de source/intent quando persistidos.

### Critério

Não basta `persisted=10`; os produtos precisam ser editorialmente corretos.

---

## Task 9.2 — Comparação antes/depois

Comparar com o ciclo baseline `969a9a99-5728-4632-b658-605f272fe657`.

### Métricas mínimas

- bruto por marketplace;
- classificados;
- unknown/review_required;
- acessórios rejeitados;
- family diversity;
- queue selected;
- inserted/updated;
- falsos positivos encontrados manualmente;
- gaps de contabilidade.

### Regra

Não declarar vitória apenas porque aumentou volume. Melhor resultado = melhor produto, funil explicável e diversidade real.

---

# Fase 10 — Handoff final para validação independente

## Task 10.1 — Atualizar documentação

**Prioridade:** P0.

Atualizar somente após o comportamento final estar comprovado:

- `docs/CURRENT_SYSTEM_STATUS.md`;
- `docs/architecture-current.md` quando arquitetura/comportamento estrutural realmente mudou;
- `docs/integracoes.md` para comportamento real das fontes;
- este plano/runbook com status final das tasks.

Não escrever como “ativo em produção” aquilo que ainda não foi mergeado/alinhado.

---

## Task 10.2 — Gerar pacote de evidências

Entregar em resposta única, sem segredos:

```text
IMPLEMENTATION_BRANCH=
HEAD_SHA=
BASE_MAIN_SHA=
WORKTREE_CLEAN=
PR_NUMBER= (se existir)
MERGED=NO
```

Depois incluir:

1. commits;
2. arquivos alterados;
3. resumo técnico por task;
4. testes focados completos;
5. `docs:audit`;
6. `verify`;
7. diagnóstico API/source-first ML;
8. diagnóstico API/source-first Shopee;
9. fonte Amazon comprovada e diagnóstico;
10. reconciliação do funil;
11. resultado do golden set;
12. logs Oracle autorizados;
13. cycle/correlation id;
14. persistência Supabase read-only;
15. comparação baseline vs candidato;
16. limitações conhecidas;
17. confirmação `MERGE_NOT_EXECUTED=YES`.

### Critério final

Parar. Não fazer merge. A validação independente decidirá se o PR pode ser mergeado.

---

# Prompt mestre para iniciar no Gemini

Use este prompt como instrução inicial, apontando para os dois documentos versionados:

```text
Você está trabalhando no projeto Caça Ofertas Oficial.

OBJETIVO:
Executar integralmente o plano API-first de validação/correção dos marketplaces, sem criar arquitetura paralela e sem fazer merge para main.

DOCUMENTOS OBRIGATÓRIOS:
- docs/MARKETPLACE_API_FIRST_VALIDATION_PLAN_2026-08-28.md
- docs/MARKETPLACE_API_FIRST_VALIDATION_TASKS_2026-08-28.md

REGRAS:
1. Leia integralmente os dois documentos antes de alterar código.
2. Execute as tasks na ordem e registre evidência de cada uma.
3. Use as fontes/API oficiais já integradas e as credenciais existentes sem expor secrets.
4. Site público não é fonte principal quando houver API/source oficial disponível.
5. Reutilize os componentes existentes; não crie motor/serviço/arquitetura paralela.
6. Não faça padding com produto fraco.
7. Faça o funil reconciliar entrada, saída e rejection reasons.
8. Não altere Supabase manualmente, não aplique migrations, não mude scheduler/env/secrets.
9. Tasks ORACLE só podem ser executadas quando explicitamente autorizadas e pelo procedimento canônico do projeto.
10. Commits pequenos são permitidos. PR draft é permitido. MERGE É PROIBIDO.
11. Ao final, entregue o pacote completo da Task 10.2 e pare.

BRANCH DE IMPLEMENTAÇÃO:
fix/api-first-marketplace-validation-v1

BASE:
A branch deve conter no histórico a main 1bf08df46b7aafd897af2e88ed327b1a15937f2d e estes documentos de planejamento.

IMPORTANTE:
Não declare uma task concluída sem teste/evidência correspondente. Se descobrir divergência entre o plano e o código real, documente e corrija a premissa antes de prosseguir.
```
