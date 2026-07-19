# PMAV5-010 — Auditoria da Remoção do Legado

## Resumo executivo

A superfície paralela foi removida sem alterar contratos, banco, schema, migrations, RLS ou produção. O Oracle Worker agora contém somente o orquestrador Discovery-Only e os três caminhos Native V5. IA e publicação antigas sem callers foram apagadas; clientes oficiais e componentes externos não certificados permaneceram subordinados ou fail-closed.

## Lotes executados

| Lote | Resultado |
|---|---|
| 1 — imports/exports órfãos | removidos com os módulos; LinkMetadata realocado ao quality gate |
| 2 — funções órfãs internas | 377 declarações removidas; Oracle reduzido ao Discovery |
| 3 — gateways fail-closed sem callers | ai-processor, gateway Groq e Generic Publisher removidos |
| 4 — scripts sem entrypoint | 70 arquivos em scripts removidos |
| 5 — rotas órfãs | zero rotas físicas removidas; rotas com caller externo/configurado preservadas 410 |
| 6 — Inngest órfão | preservado fail-closed por caller externo não certificado |
| 7 — IA antiga | core/llm, benchmarks, diagnósticos e testes removidos |
| 8 — publicação antiga | publisher, automated, router e CLIs diretos de teste removidos |
| 9 — fallbacks/flags | quatro variáveis ML removidas do template; leitores arquiteturais eliminados |
| 10 — testes/fixtures legados | 57 arquivos de teste/diagnóstico removidos |

Após os lotes foram executados testes arquiteturais, marketplaces, parser CJS, regressão, ESLint, typecheck direcionado e git diff --check.

## Prova de autoridades únicas

| Domínio | Evidência |
|---|---|
| Discovery | oracle-scraper chama runDiscoveryOnlyCycle, Shopee Native V5, Mercado Livre Native Top20 e Amazon Native Top20; não contém IA/posts/publicação/V3/V4 |
| Estado | buscas de writers classificam persistência inicial em pending_manual_review e o State Service; nenhum writer paralelo executável |
| IA | somente a composição Official AI importa GroqOfficialAIProvider/CerebrasOfficialAIProvider |
| Publicação | clientes chamam publishOfficialPost; somente composição oficial alcança transportes |
| Componentes paralelos | arquitetura PMAV5-009 atualizada: clientes oficiais ou guardas fail-closed |

## Oracle removido

processTopOffers, pendingDrafts, cleanupOldDrafts, runScrapingCycleLegacy, generateOfferAnalysis, callLLM/fallback, posts, aprovação/publicação, EPIC09, Selection Engine, Candidate Queue, runShopeeOfficialPipeline, fetchShopeeOfficialDiscovery, Amazon V3, Shopee V4 e exports associados foram removidos. Oracle API não importa mais esses símbolos; endpoints antigos de Shopee/Netshoes retornam 410.

## IA removida

Foram removidos ai-processor, core/llm JS/TS, factory/fallback, gateway Next legado, benchmarks Cerebras, diagnósticos Groq/Cerebras, prompt/extract CLIs e testes exclusivos. Official AI Service, AIProviderPort, providers oficiais, prompt/schema/adapters e seus testes permanecem.

## Publicação removida

Foram removidos Generic Publisher, automated publisher, router experimental e scripts de teste que chamavam transportes diretamente. Publish Express possui caller ativo e permanece fail-closed. Official Publication Service, Receipt Contract, quatro transportes, rotas oficiais, GitHub/Inngest/Extension clientes permanecem.

## Writers diretos

O local-scraper e scripts de saneamento/cleanup foram removidos. As ocorrências restantes são: ingestão oficial em pending_manual_review, State Service/Supabase adapter, contratos/resultados, fixtures/testes e componentes visuais. Nenhuma action, provider, transporte, Inngest, Extension, GitHub Action, scraper ou helper paralelo promove status diretamente.

## Rotas, Inngest, Extension e GitHub

- Rotas removidas: 0.
- Rotas preservadas: scraper Next e polling permanecem 410 devido caller externo/configurado.
- Inngest: dois clientes oficiais preservados; três jobs bloqueados preservados por produtor externo não certificado.
- Extension: cliente oficial preservado.
- GitHub: workflow e github-publish preservados como cliente do serviço oficial.

## Scripts administrativos preservados

clear-whatsapp-session, fix-webhook-subscription, setup-webhook-subscription, promote-admin, update-oracle e security-check permanecem por capacidade de recuperação/administração ou caller de package script. Nenhum foi executado. Não há entrypoint automático versionado para os scripts manuais preservados.

## Flags

Removidas do template: ML_PROVIDER, ML_DISCOVERY_MODE, ML_SIGNAL_URLS e ML_MAX_SCRAPEDO_REQUESTS. Leitores das flags de curation/score, Shopee cutover e LLM fallback desapareceram com o legado. Permanecem flags de teste/segurança/observabilidade e aliases WhatsApp com leitores ativos; nenhuma seleciona uma arquitetura concorrente.

## Métricas

| Métrica | Valor |
|---|---:|
| Arquivos removidos | 95 |
| Arquivos modificados de runtime/teste/config | 10 |
| Arquivos PMAV5/teste arquitetural criados antes do fechamento | 5 |
| Linhas adicionadas antes da documentação final | 336 |
| Linhas removidas | 15.950 |
| Declarações de função/classe removidas pelo diff | 377 |
| Linhas de import/require removidas | 251 |
| Linhas de export removidas | 59 |
| Scripts removidos | 70 |
| Testes/diagnósticos removidos | 57 |
| Rotas removidas | 0 |
| Endpoints Oracle convertidos para 410 | 3 |
| Flags/template ML removidas | 4 |
| Teste arquitetural novo | 1 arquivo, 69 provas de remoção/ausência |

Quantidade não é o critério principal. O resultado arquitetural é zero autoridade paralela executável certificada.

## TDD e validações

| Verificação | Resultado |
|---|---|
| RED inicial | 19 falhas esperadas: arquivos e símbolos ainda presentes |
| Arquitetura final | 6 arquivos, 146 testes aprovados |
| Direcionada ampla | 8 arquivos, 160 testes aprovados |
| Amazon/ML Node | 18 testes aprovados |
| Shopee Native V5 | 6 cenários aprovados |
| Regressão completa serial | 34 arquivos, 332 testes aprovados |
| ESLint alterados | PASS, zero saída |
| Typecheck direcionado | PASS, exit 0 |
| Typecheck global | dívida preexistente fora do diff; nenhum erro em arquivo alterado |
| Parser CJS | oracle-scraper e oracle-api PASS |
| git diff --check | PASS após correção de linha vazia |

## Limitações e itens adiados

Telemetria/ativação de callers externos não é observável nesta worktree. Por isso rotas HTTP 410, jobs Inngest registrados, aliases WhatsApp e scripts administrativos com possível uso manual permaneceram. Eles não integram o caminho oficial nem possuem autoridade de Estado, IA ou Publicação.

## Escopo negativo

Nenhum deploy, acesso Oracle VPS, restart PM2, migration, DDL, DML, banco, schema, RLS, secret, env real, Vercel, IA real, publicação real, Discovery real ou produção foi executado/alterado.

## Conclusão

O runtime versionado converge para Scheduler → Oracle Worker Discovery-Only → Ingestion V1 → pending_manual_review → Curadoria → State Service → selected → Official AI Service → posts draft → approved → Official Publication Service → receipts → published/posted. O Git preserva todo o histórico removido.
