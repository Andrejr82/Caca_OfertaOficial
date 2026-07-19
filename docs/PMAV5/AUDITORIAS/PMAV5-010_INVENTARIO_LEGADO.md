# PMAV5-010 — Inventário Certificado do Legado

## Identificação e método

| Campo | Valor |
|---|---|
| Modo | IMPLEMENTATION |
| Baseline imutável | 0099c01c74ea883c011caf267a7729230b367c7c |
| Branch | codex/pmav5-architecture-unification |
| Data | 2026-07-14 |
| Fontes | Git, imports/requires/exports, chamadas, rotas, eventos, package scripts, Vercel, GitHub Actions, Inngest, configuração, PMAV5-002 a PMAV5-009 |

A certificação usa o baseline Git para reconstruir cada item anterior e o diff para provar sua remoção. A busca cobriu referências estáticas, imports dinâmicos, nomes de evento, rotas HTTP, package.json, vercel.json, workflows, scripts, testes e documentação. Referência exclusivamente documental não é caller executável.

## Critério

| Classe | Decisão |
|---|---|
| ZERO CALLERS CERTIFICADO | removível quando há substituto oficial ou capacidade descontinuada |
| CALLER SOMENTE EM TESTE | remover o artefato e o teste exclusivamente legado |
| CALLER SOMENTE DOCUMENTAL | remover o runtime; preservar a documentação histórica |
| CALLER EXTERNO NÃO CERTIFICADO | preservar fail-closed |
| CALLER ATIVO | preservar |
| CALLER DINÂMICO | preservar até certificação adicional |

## Inventário por domínio

| ID | Arquivo/símbolo | Tipo e classificação | Callers/imports/configuração | Substituto/cobertura | Ação, risco e rollback |
|---|---|---|---|---|---|
| ORA-01 | oracle-scraper: processTopOffers, pendingDrafts, cleanupOldDrafts, IA, posts e writers | Legacy V3/V4 | ciclo legado interno, testes e docs após PMAV5-005; Oracle API deixou de importá-los | Worker Discovery-Only; testes direcionados e marketplaces | remover; rollback Git |
| ORA-02 | runShopeeOfficialPipeline, fetchShopeeOfficialDiscovery, Selection Engine, Candidate Queue, EPIC09 | Legacy/Parallel | Oracle API e testes no baseline; endpoints convertidos para 410 | Shopee Native V5; 6 cenários | remover; cascas HTTP ficam fail-closed |
| ORA-03 | Amazon V3 e Shopee V4 dry-runs/fallbacks | Legacy V3/V4 | somente testes/flags antigas | Amazon Native Top20 e Shopee Native V5 | remover |
| ORA-04 | scripts/local-scraper.cjs | Legacy writer | nenhum entrypoint/caller/package script; docs somente | Oracle Worker | remover writer draft |
| AI-01 | scripts/ai-processor.cjs | Legacy fail-closed | teste arquitetural/docs | Official AI Service | remover |
| AI-02 | src/core/llm e tests/cerebras | providers paralelos/benchmarks | testes manuais/docs | AIProviderPort e providers oficiais | remover |
| AI-03 | src/lib/ai/groq: callLLM, generateOfferAnalysis, analyzeConversionPotential | gateway fail-closed | somente testes após remover scraper/curation | generateOfficialAI | remover |
| AI-04 | crawlee_groq_test, diagnose-cerebras-fallback, test-extract, test-amazon-groq | Experimental | zero caller; CLI manual | providers/testes oficiais | remover |
| PUB-01 | src/lib/publisher/index.ts | generic publisher fail-closed | testes/docs | Official Publication Service | remover |
| PUB-02 | publish/automated, publish/router, test-router | Experimental/Orphan | teste do router | publishOfficialPost | remover |
| PUB-03 | Publish Express actions | Legacy fail-closed | caller ativo em /publish | telas/rotas oficiais | preservar; adiar UI |
| PUB-04 | testes diretos Instagram/WhatsApp/polling | Experimental/manual | zero entrypoint oficial | transportes oficiais | remover |
| DSC-01 | affiliates/scraper e publish/scraper | Discovery Next orphan | testes e import dinâmico mútuo; type movido | Oracle Worker e LinkMetadata no quality gate | remover |
| DSC-02 | curation-engine, score-v2, flags | Parallel/flag-driven | scraper removido e testes | score Native V5 + Curadoria oficial | remover |
| ING-01 | publishPostBackground, processOfferBackground | clientes oficiais | registrados em /api/inngest | serviços oficiais | preservar |
| ING-02 | syncAnalytics, runUserScraping, instagramPolling | Legacy fail-closed | registrados; produtor externo não certificável | nenhum efeito | preservar fail-closed |
| EXT-01 | rota Extension | cliente oficial | extensão ativa | Official AI/Ingestion | preservar |
| GIT-01 | workflow e github-publish | cliente oficial | workflow ativo | Official Publication | preservar |
| ROT-01 | /api/scraper/cron,trends,coupons,import | rotas 410 | URL externa não certificável | Oracle Worker | preservar fail-closed |
| ROT-02 | /api/instagram/poll-comments | rota 410 | caller em vercel.json | nenhum transporte alcançável | preservar |
| ROT-03 | Oracle API Shopee/Netshoes | endpoints externos | caller externo não certificado | Oracle Worker V5 | preservar casca 410; remover código |
| ADM-01 | backfill/sanitize/panel cleanup | scripts sem capacidade útil | zero caller/entrypoint | futura interface administrativa | remover |
| ADM-02 | clear-whatsapp-session, webhook setup/fix, promote-admin, update-oracle, security check | recuperação/administração | possível uso manual externo; sem Scheduler/PM2 | não substituído | preservar |
| FLG-01 | ML_PROVIDER, ML_DISCOVERY_MODE, ML_SIGNAL_URLS, ML_MAX_SCRAPEDO_REQUESTS | órfãs | somente .env.example | ownership Native V5 | remover |
| FLG-02 | flags de curation/score e LLM fallback | arquiteturais vencidas | leitores removidos | autoridades fixas | remover leitores |
| FLG-03 | aliases WhatsApp CHANNEL_ID/DEFAULT | rollback/externo | leitores ativos | WHATSAPP_TARGET_ID | preservar |

## Arquivos removidos — inventário exaustivo

### Oracle, IA, publicação e Discovery

- oracle-scraper.cjs: reduzido de 7.389 para 455 linhas, preservando o orquestrador Discovery-Only;
- ai-processor, local-scraper, backfill-approved-posts, sanitize-posts-integrity e panel-cleanup-apply;
- src/core/llm: provider, groq e cerebras JS/TS, além de factory.js;
- src/lib/ai/groq, affiliates/scraper e publish/scraper;
- src/lib/publisher/index, publish/automated e publish/router;
- offers/curation-engine, offers/score-v2 e offers/flags.

### Arquivos e testes históricos

- todo scripts/archive (3 arquivos) e scripts/legacy_tests (18 arquivos);
- tests/cerebras benchmark e stresstest;
- testes Vitest exclusivamente legados: groq, scraper, publish-scraper e score-v2;
- testes/scripts de Amazon V3, contrato Marketplace antigo, router, Shopee identity antigo e cleanup ML antigo.

### Diagnósticos e CLIs órfãos

Foram removidos check-images, clear.ts, query.ts, fetch-posts, fix_prompts, scraper-adapter, validate-token-optimization, crawlee_test, diagnósticos Amazon/Cerebras/final e os CLIs test-* que acessavam banco, providers, Discovery ou transportes sem integração ao runner oficial. A lista exata é reproduzível por git diff --name-status --diff-filter=D no commit PMAV5-010.

## Itens preservados e adiados

- Publish Express UI/actions: CALLER ATIVO, fail-closed.
- Funções Inngest bloqueadas: CALLER EXTERNO NÃO CERTIFICADO, registradas e fail-closed.
- Rotas Next 410 e polling Vercel: caller externo/configurado; fail-closed.
- Aliases WhatsApp: leitores ativos e compatibilidade de rollback.
- Scripts de administração/recuperação: possível uso externo; sem entrypoint automático localizado.
- Documentação histórica e certificações JSON: CALLER SOMENTE DOCUMENTAL, não runtime.

## Provas de ausência de callers

- package.json: nenhum script removido era entrypoint;
- vercel.json: nenhum removido era cron; polling preservado;
- GitHub Actions: somente github-publish, preservado como cliente oficial;
- PM2/ecosystem: nenhuma referência versionada aos removidos;
- Inngest: clientes oficiais e funções fail-closed preservados;
- imports dinâmicos: únicos imports entre scrapers removidos em conjunto;
- Oracle API: imports do pipeline Shopee eliminados; endpoints em 410;
- buscas finais: nomes antigos aparecem somente em provas negativas, testes oficiais de ausência e documentação histórica.

## Conclusão

Todos os itens removidos possuem zero caller executável certificado ou caller somente em teste/documentação. Itens com caller ativo, dinâmico ou externo não certificado permaneceram intactos ou em casca fail-closed. O Git é a única fonte de restauração; nenhuma cópia de código foi arquivada em PMAV5.
