# PMAV5-010 — Remoção Controlada do Legado

> Plano de implementação M-08 executado exclusivamente na branch `codex/pmav5-architecture-unification` e no worktree PMAV5 oficial.

## Identificação

| Campo | Valor |
|---|---|
| Modo | `IMPLEMENTATION` |
| Entrega | M-08 — Legado Arquivado e Removido |
| Checkpoint | CP-010 |
| Status | `COMPLETED` |
| Data | 2026-07-14 |
| SHA inicial | `0099c01c74ea883c011caf267a7729230b367c7c` |

## Objetivo e escopo

Reduzir a superfície executável removendo somente runtimes, gateways, funções, rotas, scripts, flags, imports, testes e helpers legados já desconectados e certificados sem caller ativo. A remoção não altera o comportamento do fluxo oficial nem executa Discovery, IA, publicação, banco, deploy ou produção.

## Substitutos oficiais

| Legado | Substituto |
|---|---|
| Discovery/Oracle V3/V4, EPIC09, Selection Engine e Candidate Queue | Oracle Worker Discovery-Only + Candidate/Ingestion V1 |
| Escritores diretos | State Service + Supabase State Adapter oficial |
| IA, prompt builders e providers antigos | Official AI Service + AIProviderPort + providers oficiais |
| Publicadores e transportes paralelos | Official Publication Service + PublicationTransportPort + Receipt Contract |
| Extensão/Inngest/GitHub autônomos | clientes dos serviços oficiais |
| Scripts administrativos sem interface oficial | preservar fail-closed ou remover somente quando sem valor de recuperação |

## Estratégia e critérios de prova

1. Inventariar símbolos e arquivos marcados Legacy, Orphan, Experimental, Parallel bloqueado, Deprecated, V3/V4, fallback, backup, old, temp, unused ou dead code.
2. Para cada candidato, buscar imports, requires, exports, chamadas, rotas, eventos, package scripts, PM2, workflows, Inngest, configuração e carregamento dinâmico.
3. Classificar como `ZERO CALLERS CERTIFICADO`, `CALLER SOMENTE EM TESTE`, `CALLER SOMENTE DOCUMENTAL`, `CALLER EXTERNO NÃO CERTIFICADO`, `CALLER ATIVO` ou `CALLER DINÂMICO`.
4. Remover apenas os três primeiros grupos, com substituto oficial ou capacidade formalmente descontinuada.
5. Criar teste arquitetural antes das remoções, observar falha pelos artefatos ainda presentes e obter GREEN após cada lote.
6. Executar testes direcionados, análise arquitetural e `git diff --check` após cada lote; preservar ou restaurar somente o item que falhar.

## Lotes TDD

- [x] Lote 1: imports e exports órfãos.
- [x] Lote 2: funções órfãs internas.
- [x] Lote 3: gateways fail-closed sem callers.
- [x] Lote 4: scripts legados sem entrypoint.
- [x] Lote 5: rotas avaliadas; nenhuma removida por caller externo/configurado.
- [x] Lote 6: Inngest avaliado; funções externas não certificadas preservadas fail-closed.
- [x] Lote 7: helpers de IA antigos.
- [x] Lote 8: helpers de publicação antigos.
- [x] Lote 9: fallbacks e flags sem consumidor.
- [x] Lote 10: testes e fixtures exclusivamente legados.

Cada lote segue: teste arquitetural RED → remoção mínima → testes direcionados GREEN → análise de imports → `git diff --check` → registro na auditoria.

## Arquivos e componentes protegidos

- `scripts/oracle-worker-discovery-only.cjs`, orquestrador oficial e módulos Native V5 de Shopee, Mercado Livre e Amazon;
- `src/core/state/`, `src/core/ai/`, `src/core/publication/` e respectivas composições/adapters oficiais;
- contratos Candidate, Ingestion, State, AI, Posts, Publication e Receipt;
- Curadoria, rotas oficiais já migradas, Scheduler, Capacity Hunter, PM2 e transportes oficiais;
- banco, schema, migrations, RLS, `.env`, secrets, infraestrutura e produção.

Correções estritamente mecânicas de import/export são permitidas quando causadas pela remoção e não mudam comportamento.

## Candidatos iniciais

O inventário parte das certificações PMAV5-002 a PMAV5-009: legado interno do `oracle-scraper.cjs`; `ai-processor`; gateways LLM fail-closed; providers `src/core/llm`; Publish Express/Generic Publisher/automação; scrapers Next/local; rotas 410; funções Inngest bloqueadas; scripts experimentais e administrativos; aliases/flags vencidos; testes exclusivamente ligados a esses artefatos. A inclusão na lista não autoriza remoção sem prova individual.

## Componentes que permanecerão

Permanecem todos os componentes oficiais e qualquer item com caller ativo, dinâmico ou externo não certificado. Scripts administrativos úteis à recuperação permanecem bloqueados quando não houver substituto operacional seguro. Código cujo risco ou uso não possa ser provado será classificado como adiado.

## Riscos e controles

- caller externo desconhecido: preservar fail-closed e documentar;
- import dinâmico/evento por string: buscar configuração, workflows, PM2, Inngest e package scripts;
- regressão de import/barrel: testes arquiteturais, typecheck e análise de imports;
- remoção indevida de capacidade de recuperação: preservar scripts administrativos bloqueados;
- reintrodução de autoridade: testar writers, providers, transportes, estados e entrypoints após cada lote.

## Rollback

O Git é a única fonte histórica. Reverter somente o commit `refactor(pmav5): remove disconnected legacy runtimes` por novo commit, sem reset, stash ou backup manual. A reversão não autoriza deploy, banco, IA, Discovery, publicação nem reativação simultânea de autoridades. Reexecutar toda a validação antes de qualquer promoção futura.

## Validação final

Executar testes arquiteturais, Oracle/marketplaces, State, Curadoria, Official AI/providers, Official Publication/transportes, rotas e regressão completa serial quando viável; ESLint e typecheck direcionados; parser Node dos CJS alterados; análise de imports; `git diff --check`; revisão integral de `git diff --name-status` e `git diff --stat`. Somente então atualizar CP-010 para `COMPLETED`, documentar métricas, fazer o commit exato e push para a branch oficial.

## Resultado

Os lotes removeram o legado certificado e preservaram callers ativos/externos não certificados. A regressão serial aprovou 332 testes; ESLint e typecheck direcionados passaram; o typecheck global conservou somente dívida preexistente fora do diff. Nenhum runtime externo foi executado.
