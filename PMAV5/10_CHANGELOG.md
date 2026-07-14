# Changelog do PMAV5

## PMAV5-012A — 2026-07-14

- **Modo:** IMPLEMENTATION.
- **Branch:** `codex/pmav5-architecture-unification`.
- **Documentos criados:** `AUDITORIAS/PMAV5-012A_HOMOLOGACAO_END_TO_END.md`, `SPRINTS/PMAV5-012A_HOMOLOGACAO_END_TO_END.md`, `ROLLBACKS/PMAV5-012A_ROLLBACK.md`.
- **Documentos atualizados:** `07_CHECKPOINTS.md` e este changelog.
- **Resultado:** CP-012A `COMPLETED`; Arquitetura certificada End-to-End em ambiente controlado. Testes unitários, de arquitetura, integridade e observabilidade validados e aprovados.
- **Alteração funcional/operacional/produção:** Nenhuma; sem deploy, sem manipulação de banco em produção.
- **Conclusão:** O sistema encontra-se oficialmente apto para Cutover (PMAV5-012B).

## PMAV5-000 — 2026-07-13

- **Branch:** `codex/pmav5-architecture-unification`
- **SHA inicial:** `82f4a05f64800baa297aa8433920fc3295b4bc1b`
- **Arquivos criados:** estrutura documental completa `PMAV5/`, incluindo governança, arquiteturas atual/alvo, autoridades, contratos, máquina de estados, princípios, checkpoints, dependências, ADRs, critérios, protocolo LLM e ficha da Sprint.
- **Alteração funcional:** nenhuma.
- **Alteração operacional/produção:** nenhuma.
- **Verificação autorizada:** inspeção Git e documental; nenhum build, teste funcional, migration, deploy ou chamada de runtime.
- **Resultado:** CP-000 `IMPLEMENTED`.
- **Bloqueio:** CP-001 e PMAV5-001 não podem iniciar até homologação humana de CP-000.

## PMAV5-GOV-1.0 — 2026-07-13

Governança PMAV5 congelada.
- **Versão:** 1.0
- **Estado:** ESTÁVEL

## PMAV5-001 — 2026-07-13

- **Modo:** AUDIT.
- **Branch:** `codex/pmav5-architecture-unification`.
- **SHA inicial:** `c55bee1b7f32774e52f2d68d1d5feaf79f06d17b`.
- **Documentos criados:** `AUDITORIAS/PMAV5-001_ESTADO_OPERACIONAL_CERTIFICADO.md` e `SPRINTS/PMAV5-001_CERTIFICACAO_ESTADO_OPERACIONAL.md`.
- **Documentos atualizados:** `07_CHECKPOINTS.md` e este changelog.
- **Resultado:** CP-001 `COMPLETED`; componentes classificados com evidências, matrizes e grafo operacional.
- **Não certificados:** ativação produtiva de runtimes externos, configuração integral PM2/cron, schema produtivo, flags não observadas e protocolo operacional 13 ausente.
- **Alteração funcional/operacional/produção:** nenhuma.
- **Verificação autorizada:** inspeção Git e documental; nenhum build, teste funcional, migration, deploy ou runtime proibido.

## PMAV5-002 — 2026-07-13

- **Modo:** AUDIT.
- **Branch:** `codex/pmav5-architecture-unification`.
- **SHA inicial:** `43976b70a7e10d9e3a0475a14dc948b5bcc622e6`.
- **Documentos criados:** `AUDITORIAS/PMAV5-002_PIPELINE_COMPARTILHADO.md` e `SPRINTS/PMAV5-002_PIPELINE_COMPARTILHADO.md`.
- **Documentos atualizados:** `07_CHECKPOINTS.md` e este changelog.
- **Resultado:** CP-002 `COMPLETED`; pipeline Discovery → estados finais reconstruído, escritores e orquestradores classificados, arquitetura final consolidada e Plano Oficial de Implementação M-01–M-10 documentado.
- **Conflitos críticos certificados:** autoridades paralelas, escritas diretas, curadoria implícita, bypass para `approved`, finalização não transacional, estado `processing` incompatível e riscos de tenant/concorrência.
- **Não certificados:** ativação produtiva de runtimes externos, schema produtivo e `PMAV5/13_PROTOCOLO_OPERACIONAL.md` ausente.
- **Alteração funcional/operacional/produção:** nenhuma.
- **Verificação autorizada:** inspeção Git, documental e estática; nenhum build, teste funcional, migration, deploy, scraping, IA, publicação ou runtime proibido.

## PMAV5-003 — 2026-07-13

- **Modo:** IMPLEMENTATION, restrito à implementação normativa documental de M-01.
- **Branch:** `codex/pmav5-architecture-unification`.
- **SHA inicial:** `74a8e1a53775097fb717475ded6523372f6e6f43`.
- **Documentos criados:** auditoria/fonte canônica, ficha da Sprint e contratos Candidate, State, AI, Posts, Publication, Receipt e Ingestion.
- **Documentos atualizados:** `07_CHECKPOINTS.md` e este changelog.
- **Resultado:** CP-003 `COMPLETED`; ambientes, variáveis, stores, flags, owners, contratos e dependências possuem definição normativa única e versionada.
- **Legado governado:** aliases, fontes alternativas e flags arquiteturais foram classificados com owner e prazo; nenhuma remoção foi executada.
- **Segredos:** nenhum valor lido, exibido, criado ou modificado.
- **Alteração funcional/operacional/produção:** nenhuma.
- **Verificação autorizada:** inspeção documental/estática e Git; nenhum build, teste funcional, migration, schema, deploy, restart ou runtime.

## PMAV5-004 — 2026-07-13

- **Modo:** IMPLEMENTATION, restrito à fundação M-02 do Serviço Oficial de Estados.
- **Branch:** `codex/pmav5-architecture-unification`.
- **SHA inicial:** `e8b08d171411072196e23796443d75fa28132181`.
- **Código criado:** `src/core/state/` com contratos State v1, máquina oficial, validações, resultados, erros, cinco Ports, State Service e três adapters opt-in.
- **Testes criados:** `src/tests/core/state/` para transições, CAS, conflitos, idempotência, auditoria, concorrência, entidade inexistente, comando inválido e adapters.
- **Documentos criados:** `AUDITORIAS/PMAV5-004_STATE_SERVICE.md` e `SPRINTS/PMAV5-004_STATE_SERVICE.md`.
- **Documentos atualizados:** `07_CHECKPOINTS.md` e este changelog.
- **Resultado:** CP-004 `COMPLETED`; 122 testes globais aprovados, 2 ignorados e 0 falhas; cobertura direcionada de 89,31% statements e 90,4% linhas.
- **Desacoplamento:** núcleo sem Supabase, Next.js, Oracle, Inngest, relógio/UUID concretos, variáveis de ambiente ou side effects de infraestrutura.
- **Alteração funcional/operacional/produção:** nenhuma; nenhum caller foi migrado e nenhum adapter foi conectado automaticamente.
- **Typecheck:** núcleo strict aprovado; verificação global permanece bloqueada exclusivamente por dívida preexistente fora do escopo.

## PMAV5-ALIGN-001 — 2026-07-13

- **Modo:** DOCUMENTATION.
- **Objetivo:** reconciliar definitivamente a sequência PMAV5, checkpoints, dependências e protocolo operacional.
- **Resultado:** ADR-013 criado; dependências alinhadas; checkpoints alinhados; protocolo operacional criado; PMAV5-005 autorizada.
- **Alteração funcional:** nenhuma.
- **Alteração operacional/produção:** nenhuma.
- **Verificação autorizada:** histórico Git, inspeção documental, buscas de consistência, revisão de diff e validação de escopo; nenhum build, teste funcional, runtime, migration, banco, scraping, IA, publicação ou deploy.

## PMAV5-005 — 2026-07-13

- **Modo:** IMPLEMENTATION, M-03 Oracle Worker Discovery-Only.
- **Branch:** `codex/pmav5-architecture-unification`.
- **SHA inicial:** `5fdb734f52ebd7bcf56f33c282a9d1ca40ccc2fb`.
- **Código:** núcleo Candidate V1 → Ingestion V1, adapters nativos Shopee/Mercado Livre/Amazon e persistência exclusiva em `pending_manual_review`.
- **Desconexão:** IA, Groq, Cerebras, posts, publicação, drafts, `processTopOffers`, EPIC09, Selection Engine, Candidate Queue e fallbacks V3/V4 não possuem caminho a partir do Worker executável.
- **Legado:** módulos com consumidores externos preservados fisicamente em funções não exportadas/não chamadas pelo Worker.
- **Testes:** 132 Vitest aprovados e 2 ignorados; 19 regressões Node e 6 cenários Shopee aprovados; validação final registrada na auditoria da Sprint.
- **Resultado:** CP-005 `COMPLETED`; os três marketplaces encerram em `pending_manual_review`.
- **Produção:** nenhum Discovery real, IA, publicação, deploy, PM2, Oracle VPS, banco/schema/migration, `.env` ou segredo foi executado/alterado.

## PMAV5-006 — 2026-07-13

- **Modo:** IMPLEMENTATION, M-04 Curadoria e Ingestão Oficial.
- **Branch:** `codex/pmav5-architecture-unification`.
- **SHA inicial:** `1abba0f381ecc13e5e0f4a7cba0ca1568cf6d421`.
- **Código:** adapter Supabase do State Service, serviço oficial de publicação e migração dos callers oficiais de Curadoria, Aprovação, Rejeição e Publicação.
- **Garantias:** CAS por tenant/estado/versão lógica, idempotência persistida em `app_settings` e AuditPort em `integration_logs`, sem schema/migration.
- **Desconexão:** auto-seleção na publicação, Publish Express com IA/publicação direta, rejeição de posts fora da máquina e dispatch Instagram/GitHub sem reconciliação oficial.
- **Testes:** 152 Vitest aprovados e 2 ignorados; ESLint direcionado e typecheck direcionado sem erros da Sprint.
- **Resultado:** CP-006 `COMPLETED`; nenhum update direto de `offers.status` ou `posts.status` permanece nos fluxos oficiais.
- **Escopo negativo:** Oracle Worker, Discovery, marketplaces, Scheduler, PM2, Inngest, Extension, GitHub Actions, Capacity Hunter, feature flags, banco, schema, migrations e produção não foram alterados.

## PMAV5-007 — 2026-07-13

- **Modo:** IMPLEMENTATION, M-05 Serviço Oficial de IA e Posts.
- **Branch:** `codex/pmav5-architecture-unification`.
- **SHA inicial:** `746abb2b7967315c55cf0070ae8a753ed8d02573`.
- **Código:** núcleo `src/core/ai/`, providers puros Groq/Cerebras, adapter Supabase oficial, composição server-side e rota `/api/ai/generate` subordinada ao serviço.
- **Garantias:** IA apenas após `selected`; Candidate/AI/State contracts antes do provider; links/posts idempotentes; posts somente `draft`; aprovação somente por `transitionOfficialOfferState()` com CAS.
- **Desconexão:** `callLLM`, `generateOfferAnalysis` e `analyzeConversionPotential` compartilhados falham fechados sem rede; callers proibidos permanecem inalterados e sem acesso aos providers oficiais.
- **Testes:** 177 Vitest aprovados em 34 arquivos; ESLint e typecheck direcionados aprovados; cobertura não emitida porque o provider V8 não está instalado.
- **Resultado:** CP-007 `COMPLETED`; o commit final é `refactor(pmav5): centralize ai and draft posts in official service`.
- **Escopo negativo:** Oracle Worker, Discovery, marketplaces, Inngest, Extension, Scheduler, PM2, publicação, banco/schema/migrations, produção e deploy não foram alterados/executados.

## PMAV5-008 — 2026-07-14

- **Modo:** IMPLEMENTATION, M-06 Serviço Oficial de Publicação.
- **Branch:** `codex/pmav5-architecture-unification`.
- **SHA inicial:** `70448a6a38eef363b8e6611095a0b5e7221431b8`.
- **Código:** núcleo hexagonal `src/core/publication/`, composição server-side, persistência operacional e transportes puros Telegram, WhatsApp, Instagram e Facebook.
- **Rotas:** as quatro rotas oficiais chamam exclusivamente `publishOfficialPost()` e não recebem conteúdo governante nem acessam banco ou SDK de canal.
- **Garantias:** receipt persistido antes das transições; `draft → published` e `approved → posted` exclusivamente pelo State Service; regra A; replay sem reenvio; concorrência de envio unitária; reconciliação segura; Instagram assíncrono fail-closed.
- **Testes:** 236 Vitest aprovados em 39 arquivos; ESLint e typecheck direcionados aprovados; cobertura não emitida porque o provider V8 não está instalado.
- **Resultado:** CP-008 `COMPLETED`; o commit final é `refactor(pmav5): centralize publication in official service`.
- **Escopo negativo:** Oracle Worker, Discovery, marketplaces, Official AI Service, Curadoria, Inngest, Extensão, GitHub Actions, Scheduler, PM2, banco/schema/migrations, `.env`, segredos, produção e deploy não foram alterados/executados.

## PMAV5-009 — 2026-07-14

- **Modo:** IMPLEMENTATION, M-07 Subordinação dos Componentes Paralelos.
- **Branch:** `codex/pmav5-architecture-unification`.
- **SHA inicial:** `8f282d61ca38b4ba120797d24811c18bdc58d471`.
- **Clientes:** Inngest e Extension consomem Official AI/Publication Services; GitHub Actions e scripts de publicação consomem `publishOfficialPost()`.
- **Fail-closed:** Publish Express, Generic Publisher, automação, Next.js Discovery, jobs auxiliares, scripts administrativos, LLM legado e experimentos não alcançam estado, posts, providers ou transportes.
- **Órfãos:** scrapers Next/local, publish scraper e comment polling foram removidos dos entrypoints oficiais e preservados sem caller por restrição de escopo.
- **Provas:** 96 testes arquiteturais PMAV5-009; regressão completa com 333 testes em 40 arquivos, zero falhas.
- **Qualidade:** ESLint direcionado aprovado; typecheck direcionado com 19 arquivos e zero diagnósticos; typecheck global mantém somente dívida preexistente fora do diff.
- **Resultado:** CP-009 `COMPLETED`; Discovery, Estado, IA e Publicação possuem uma única autoridade executável.
- **Escopo negativo:** nenhum deploy, publicação real, IA real, Discovery real, banco/schema/migration, secret, `.env`, produção, PM2 ou Scheduler foi alterado/executado.

## PMAV5-010 — 2026-07-14

- **Modo:** IMPLEMENTATION, M-08 Legado Arquivado e Removido.
- **Branch:** `codex/pmav5-architecture-unification`.
- **SHA inicial:** `0099c01c74ea883c011caf267a7729230b367c7c`.
- **Remoção:** 95 arquivos e 15.950 linhas legadas; Oracle V3/V4, providers/gateways IA paralelos, Generic Publisher, scrapers Next/local, flags e testes/diagnósticos órfãos.
- **Oracle:** `oracle-scraper.cjs` reduzido ao Discovery-Only Native V5 de Shopee, Mercado Livre e Amazon; endpoints externos antigos preservados em 410.
- **Preservação:** serviços oficiais, contratos, transportes, clientes Inngest/Extension/GitHub e itens com caller externo não certificado.
- **Testes:** regressão serial com 332 testes; suites arquiteturais e marketplaces aprovadas; ESLint, typecheck direcionado, parser CJS e `git diff --check` aprovados.
- **Typecheck global:** mantém somente dívida preexistente fora do diff.
- **Resultado:** CP-010 `COMPLETED`; zero autoridade paralela executável certificada.
- **Escopo negativo:** nenhum deploy, publicação real, IA real, Discovery real, banco/schema/migration, `.env` real, segredo, produção, PM2, Oracle VPS ou Vercel foi alterado/executado.

## PMAV5-011 — 2026-07-14

- **Modo:** IMPLEMENTATION, M-09 Observabilidade, Recuperação e Rastreabilidade End-to-End.
- **Branch:** `codex/pmav5-architecture-unification`.
- **SHA inicial:** `75bb21c3b71063eae25487007d85726bdd020b64`.
- **Código:** núcleo `src/core/observability/` contendo catálogo, eventos, métricas, health, recovery e reconciliação. Adapters `integration_logs` atualizados.
- **Instrumentação:** instrumentação mínima nos módulos oficiais de State, AI, Publication, e Oracle Worker, preservando `audit_port` end-to-end.
- **Testes:** 22 testes Vitest aprovados em 4 arquivos da camada, provando isolamento da camada. ESLint e typecheck direcionados aprovados.
- **Resultado:** CP-011 `COMPLETED`; implementados endpoints `health` e `readiness`. Observabilidade 100% read-only garantida. Replay delegado aos serviços oficiais, rastreável e idempotente.
- **Escopo negativo:** nenhum provider paralelo criado, nenhum writer paralelo criado. Nenhuma IA nova. Nenhuma mudança na base de dados ou regras de acesso. Nenhum deploy real executado.
