# PMAV5-009 — Auditoria dos Componentes Paralelos

## Resultado executivo

M-07 foi implementada em fail-closed. Inngest, Extension, GitHub Actions e scripts administrativos de publicação tornaram-se clientes de `generateOfficialAI()` ou `publishOfficialPost()`. Componentes sem comando oficial seguro foram bloqueados antes de banco, provider ou transporte. Rotas Next.js concorrentes de Discovery foram retiradas do fluxo, mantendo Oracle Worker como única autoridade de Discovery. State, AI e Publication Services permanecem as únicas autoridades dos respectivos domínios.

## Inventário consolidado

| Arquivo/componente | Caller | Responsabilidade anterior | Estado/IA/publicação/transporte/banco | Contrato anterior | Classe final | Ação |
|---|---|---|---|---|---|---|
| `src/lib/inngest/functions.ts::publishPostBackground` | evento `post/publish` | publicar payload arbitrário via Generic Publisher | transporte indireto; sem receipt oficial | evento livre | CLIENTE | recebe `OfficialPublicationCommand` e chama `publishOfficialPost()` |
| `src/lib/inngest/functions.ts::processOfferBackground` | evento `offer/process` | stub de processamento | promessa de IA paralela | evento livre | CLIENTE | recebe `OfficialAICommand` e chama `generateOfficialAI()` |
| `syncAnalyticsBackground` | evento `analytics/sync` | inserir vendas e decidir defaults | banco `sales`; regra local | evento livre | LEGADO | bloqueado com `PARALLEL_COMPONENT_DISABLED` |
| `runUserScrapingBackground` | evento `cron/run-scraping` | Discovery, ranking, IA, links, posts e aprovação | `offers.status`, `posts.status`, posts, Groq, Supabase | evento livre | LEGADO | bloqueado antes de qualquer etapa |
| `instagramPollingBackground` | cron Inngest | polling e DM | transporte Instagram | cron | LEGADO | bloqueado antes do transporte |
| `apps/chrome-extension/popup.js` | usuário da extensão | extrair página e chamar API | somente HTTP para Next.js | payload de página | CLIENTE | preservado como cliente HTTP; payload legado recebe 400 fail-closed |
| `src/app/api/publish/extension/route.ts` | Extension | criar oferta approved, links, IA e publicar | criação/aprovação, Groq, Telegram, WhatsApp, Instagram, Supabase | payload arbitrário | CLIENTE | aceita apenas `offerId` selecionado, autentica e chama `generateOfficialAI()` |
| `.github/workflows/publish-reel.yml` | dispatch manual | renderizar e publicar conteúdo arbitrário | secrets de transporte, mídia e publicação | inputs de copy/mídia | CLIENTE | envia somente identidades e executa cliente oficial |
| `scripts/github-publish.ts` | GitHub Actions | render, storage, Instagram e updates de estado | `posts.status`, `offers.status`, transporte, Supabase | inputs livres | CLIENTE | constrói `pmav5.publication/v1` e chama `publishOfficialPost()` |
| `scripts/publish-direct.ts` | operador | consultar post e enviar WhatsApp | banco e transporte direto | IDs hard-coded | CLIENTE | exige IDs/tenant/canal e chama `publishOfficialPost()` |
| `scripts/publish-rest.ts` | operador | REST, copy local, mídia e WhatsApp Engine | banco, Cloudinary e transporte | IDs hard-coded | CLIENTE | exige IDs/tenant/canal e chama `publishOfficialPost()` |
| `src/lib/publisher/index.ts` | Inngest legado | publisher multicanal genérico | transportes paralelos | `PublishPayload` arbitrário | LEGADO | permanece compatível e fail-closed |
| `src/lib/publish/actions.ts` / Publish Express | painel `/publish` | scraping, criação, copy e publicação rápida | criação de oferta; transportes | URL/texto/mídia | LEGADO | todas as mutações retornam `PARALLEL_COMPONENT_DISABLED` |
| `src/lib/publish/automated.ts` | sem caller produtivo | seleção de canal, IA e mídia experimental | IA e roteamento | URL | EXPERIMENTAL | bloqueado fail-closed |
| `src/lib/publish/router.ts` | automação experimental | selecionar canais | regra local de publicação | `OfferData` | ÓRFÃO | bloqueado fail-closed |
| `scripts/ai-processor.cjs` | operador | selecionar drafts, IA, criar posts, aprovar | offer/post state, posts, LLM, Supabase | nenhum contrato oficial | LEGADO | bloqueado fail-closed |
| `scripts/backfill-approved-posts.cjs` | operador | gerar posts faltantes | posts, IA, Supabase | flags locais | LEGADO | bloqueado fail-closed |
| `scripts/sanitize-posts-integrity.cjs` | operador | sanear e rejeitar | offer/post state, IA, Supabase | flags locais | LEGADO | bloqueado fail-closed |
| `scripts/panel-cleanup-apply.cjs` | operador | deletar/rejeitar em lote | offer/post state, Supabase | flags locais | LEGADO | bloqueado fail-closed |
| `src/core/llm/{groq,cerebras}.{ts,js}` | benchmarks/Factory | providers paralelos | provider Groq/Cerebras | contrato LLM legado | LEGADO | classes preservadas, geração sempre lança fail-closed |
| `src/core/llm/factory.js` | scripts legados | fallback entre providers | IA paralela | Factory local | LEGADO | nenhuma resolução ou fallback; falha imediata |
| `src/lib/ai/groq.ts` | callers históricos | gateway compartilhado | IA paralela | tipos legados | LEGADO | preservado fail-closed, agora marcado como componente paralelo desativado |
| `scripts/crawlee_groq_test.cjs` | operador | inferência experimental | provider direto | nenhum | EXPERIMENTAL | bloqueado fail-closed |
| `scripts/diagnose-cerebras-fallback.cjs` | operador | testar fallback | providers diretos | nenhum | EXPERIMENTAL | bloqueado fail-closed |
| `scripts/test-extract.cjs` | operador | extração via Groq | provider direto | nenhum | EXPERIMENTAL | bloqueado fail-closed |
| `scripts/create_drive_structure.gs` | operador | gerar runtime paralelo | publicação e estado em código gerado | nenhum | EXPERIMENTAL | gerador bloqueado fail-closed |
| `/api/scraper/{cron,trends,coupons,import}` | painel/jobs | Discovery Next.js e auto-IA | Discovery, ranking, IA e banco | HTTP legado | LEGADO | respostas 410 fail-closed; nenhum motor de Discovery foi alterado |
| `/api/instagram/poll-comments` | Scheduler Vercel | job auxiliar de DM | transporte Instagram | HTTP cron | LEGADO | resposta 410 antes do transporte; `vercel.json` não foi alterado |
| `src/lib/affiliates/scraper.ts` | somente módulos legados desconectados | Discovery Next.js histórico | banco, posts e gateway IA bloqueado | tipos internos | ÓRFÃO | preservado por restrição; removido dos entrypoints executáveis |
| `src/lib/publish/scraper.ts` | Publish Express bloqueado | scraping de URL | Discovery auxiliar | `LinkMetadata` | ÓRFÃO | preservado sem caller oficial |
| `src/lib/instagram/comment-polling.ts` | rotas/jobs bloqueados | polling e DM | banco e transporte | tipos locais | ÓRFÃO | preservado sem caller executável |
| `scripts/local-scraper.cjs` | nenhum caller oficial | Discovery local histórico | banco | nenhum | ÓRFÃO | preservado por restrição de Discovery; fora do fluxo oficial |

## Componentes preservados

- `scripts/oracle-worker-discovery-only.cjs` e implementações Oracle/marketplaces: preservados byte a byte; os testes PMAV5-005 continuam provando Discovery Only.
- State Service, Official AI Service e Official Publication Service: preservados como autoridades.
- `src/core/publication/transports/*`, `src/lib/telegram/client.ts`, `src/lib/integrations/whatsapp`, `src/lib/instagram/client.ts`, `src/lib/platforms/facebook.ts` e `scripts/whatsapp-engine.cjs`: adapters técnicos preservados atrás da composição oficial.
- Scheduler, `vercel.json`, PM2, banco, schema, migrations, secrets e `.env`: não alterados.

## Componentes removidos do fluxo oficial

Publish Express, Generic Publisher, automação experimental, Next.js Discovery, auto-IA de tendências/cupons, polling auxiliar, AI Processor, backfills, saneamentos, cleanup direto, providers LLM legados e geradores experimentais não possuem mais um caminho executável para estado, posts, provider ou transporte.

## Provas arquiteturais

`src/tests/architecture/parallel-components-subordination.test.ts` possui 96 provas cobrindo:

- clientes referenciam exclusivamente as funções oficiais esperadas;
- bloqueados contêm guarda fail-closed;
- nenhum componente inventariado escreve `offers.status` ou `posts.status`;
- nenhum cria/atualiza posts diretamente;
- nenhum chama provider de IA ou transporte diretamente;
- workflow não recebe copy, mídia ou secret de transporte;
- transportes concretos permanecem atrás da composição oficial;
- Next.js e jobs auxiliares não executam Discovery.

As provas anteriores de State, AI, Publication e Oracle foram mantidas e ajustadas apenas onde PMAV5-009 transforma explicitamente Inngest/Extension em clientes oficiais.

## TDD e regressão

- Baseline: 39 arquivos, 236 testes, zero falhas.
- RED 1: 38 falhas arquiteturais pelas autoridades paralelas existentes.
- RED 2: 6 falhas, isolando cinco gateways LLM e um falso positivo nominal corrigido na prova.
- RED 3: 7 falhas, isolando rotas Next.js/auxiliares ainda executáveis.
- GREEN arquitetural: 96/96 provas PMAV5-009.
- Regressão completa: 40 arquivos, 333 testes, zero falhas.
- ESLint direcionado: zero erros e zero warnings.
- Typecheck direcionado: 19 arquivos TypeScript alterados, zero diagnósticos.
- Typecheck global: mantém somente dívida preexistente fora dos arquivos alterados; nenhum diagnóstico PMAV5-009.
- `git diff --check`: executado no fechamento final.

## Escopo negativo

Nenhum deploy, publicação real, inferência real, Discovery real, acesso de produção, migration, alteração de schema, restart ou alteração de segredo foi executado.

## Conclusão

CP-009 está `COMPLETED`. Há uma única autoridade executável para Discovery, Estado, IA e Publicação; os componentes paralelos são clientes oficiais ou falham fechados antes de qualquer autoridade de negócio.
