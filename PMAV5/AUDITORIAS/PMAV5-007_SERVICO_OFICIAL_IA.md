# PMAV5-007 — Auditoria do Serviço Oficial de IA e Posts

## Identificação

| Campo | Valor |
|---|---|
| Modo | `IMPLEMENTATION` |
| Implementação | M-05 — Serviço Oficial de IA e Posts |
| Checkpoint | CP-007 |
| Status | `COMPLETED` |
| Data | 2026-07-13 |
| Branch | `codex/pmav5-architecture-unification` |
| SHA inicial | `746abb2b7967315c55cf0070ae8a753ed8d02573` |

## Veredito executivo

`generateOfficialAI()` é a única porta oficial capaz de alcançar os providers Groq/Cerebras. A rota `/api/ai/generate` autentica e cria o comando, mas não lê oferta, não chama provider concreto, não cria links/posts e não altera estado. O serviço valida comando, idempotência, tenant, estado `selected`, versão CAS e Candidate V1 antes da inferência; valida a saída completa; persiste links e posts `draft`; e somente então usa `transitionOfficialOfferState()` para `approved`.

Os gateways Next legados `callLLM()`, `generateOfferAnalysis()` e `analyzeConversionPotential()` preservam assinatura, mas lançam `LEGACY_AI_DISABLED` antes de rede, banco ou fallback. Arquivos proibidos não foram modificados. Referências históricas, diagnósticos e scripts manuais permanecem classificados para M-07/M-08; não integram a autoridade oficial e não foram executados.

## Fluxo certificado

```text
offer:selected + pmav5.ai/v1
  → validação fail-closed + reserva idempotente
  → AIProviderPort (Groq OU Cerebras; uma chamada)
  → OfficialAIContent validado
  → affiliate_links idempotentes
  → posts:draft idempotentes
  → transitionOfficialOfferState(selected → approved)
  → AuditPort + resultado persistido
  → PARAR
```

## Inventário exaustivo dos callers e referências de IA

| Arquivo / função | Caller | Consumidor | Provider/modelo | Entrada → saída | Efeito/status/posts/estado/publicação | Classe | Ação |
|---|---|---|---|---|---|---|---|
| `src/app/api/ai/generate/route.ts::POST` | `message-actions.tsx`; trends/coupons legados | Official AI Service | nenhum concreto | `offerId` + sessão → resultado oficial | zero persistência direta; aceita intenção para `selected` | oficial | migrado |
| `src/core/ai/official-ai-service.ts::generateOfficialAI` | rota oficial | content/approval/audit Ports | provider resolvido; modelo configurado | AI Command v1 → resultado tipado | links + drafts antes de State Service; nunca publica | oficial único | criado |
| `src/lib/ai/official/create-official-ai-service.ts` | rota oficial | núcleo Official AI | Groq `GROQ_MODEL`; Cerebras `CEREBRAS_MODEL` | configuração server-side → dependências | composição, sem regra de estado/post | oficial | criado |
| `src/core/ai/providers/groq-provider.ts` | composição oficial | Official AI Service | Groq | prompt técnico → inferência/evidência | zero banco/link/post/estado/publicação | provider | transformado em provider puro |
| `src/core/ai/providers/cerebras-provider.ts` | composição oficial | Official AI Service | Cerebras | prompt técnico → inferência/evidência | zero banco/link/post/estado/publicação | provider | transformado em provider puro |
| `src/lib/ai/groq.ts::generateOfferAnalysis` | Inngest, Extension, automated, cron e testes legados | nenhum provider | nenhum | assinatura legada → erro explícito | zero efeito | gateway legado | bloqueado fail-closed |
| `src/lib/ai/groq.ts::callLLM` | affiliates scraper e código histórico | nenhum provider | nenhum | assinatura legada → erro explícito | zero efeito | gateway legado | bloqueado fail-closed |
| `src/lib/ai/groq.ts::analyzeConversionPotential` | `curation-engine.ts` com flag legada | nenhum provider | nenhum | assinatura legada → erro explícito | zero efeito | paralelo legado | bloqueado fail-closed |
| `src/lib/ai/groq.ts::mapGeneratedCopyToLegacyResult` | testes/compatibilidade de tipo | PostBuilder puro | nenhum | estrutura já gerada → formatação | zero inferência/banco/estado/publicação | helper puro | preservado |
| `src/lib/inngest/functions.ts::runUserScrapingBackground` | endpoint Inngest | gateway legado | nenhum alcançável | oferta → erro no gateway | não alcança provider oficial; arquivo inalterado | paralelo proibido | preservado/bloqueado na fronteira |
| `src/app/api/publish/extension/route.ts::POST` | Extension | gateway legado | nenhum alcançável | produto → erro no gateway | não alcança provider oficial; arquivo inalterado | paralelo proibido | preservado/bloqueado na fronteira |
| `src/lib/affiliates/scraper.ts` | trends/cron/Inngest legados | gateway legado | nenhum alcançável | HTML → erro no gateway | Discovery Next legado não alcança provider oficial; arquivo inalterado | paralelo proibido | preservado/bloqueado na fronteira |
| `src/lib/offers/curation-engine.ts::rankOffersBatch` | scrapers legados | gateway legado quando flag IA ativa | nenhum alcançável | ofertas → erro fail-closed quando tenta IA | caminho determinístico sem flag permanece | paralelo legado | preservado; IA bloqueada |
| `src/lib/publish/automated.ts::publishAutomatedOfferAction` | nenhum caller interno localizado | gateway legado importado | nenhum alcançável | experimental | nenhum call efetivo localizado | órfão/experimental | preservar sem caller |
| `src/app/api/scraper/cron/route.ts` | cron legado | import não utilizado | nenhum | nenhum call localizado | zero geração pela importação | órfão | preservar; gateway bloqueado |
| `src/app/api/scraper/{trends,coupons}/route.ts` | chamadas HTTP internas legadas | rota oficial | somente após gates oficiais | offerId → comando oficial | pending/draft falha antes do provider | paralelo de entrada | preservado; subordinado aos gates |
| `src/lib/publish/actions.ts::generateQuickPostAction` | Publish Express UI | ingestão pending | nenhum | URL → pending_manual_review | não gera IA/posts/publicação | legado desconectado na PMAV5-006 | preservar |
| `scripts/oracle-scraper.cjs::generateOfferAnalysis/callLLM*` | somente legado/diagnóstico; não Worker oficial | scripts externos | Cerebras→Groq legado | prompt/produto → copy/extração | capacidade física histórica; entrypoint oficial desconectado na PMAV5-005 | legado proibido | arquivo inalterado; remover M-08 |
| `scripts/ai-processor.cjs` | operador manual | Oracle generator legado | Cerebras/Groq legado | drafts → posts/approved direto | capacidade manual fora do runtime oficial | legado | não executado; arquivar M-08 |
| `scripts/backfill-approved-posts.cjs` | operador com confirmação | LLMFactory legado | Cerebras/Groq legado | offer approved → drafts faltantes | manutenção, sem fluxo oficial | maintenance | não executado; migrar M-07/M-08 |
| `scripts/sanitize-posts-integrity.cjs` | operador com confirmação | LLMFactory legado | Cerebras/Groq legado | inconsistências → correção | manutenção direta | maintenance | não executado; migrar M-07/M-08 |
| `scripts/diagnose-cerebras-fallback.cjs` | operador | Oracle generator | Cerebras/Groq legado | diagnóstico → evidência | sem caller automático | diagnóstico | não executado; remover após M-09 |
| `scripts/crawlee_groq_test.cjs`, `scripts/test-extract.cjs` | operador | endpoint Groq direto | Groq | diagnóstico → JSON | inferência real manual possível | experimental | não executado; remover M-08 |
| `src/core/llm/*.{ts,js}` | LLMFactory/benchmarks legados | scripts/tests fora do Vitest oficial | Cerebras/Groq | mensagens → inferência | provider técnico legado, sem estado | legado físico | preservar para M-08; não importado pelo serviço oficial |
| `tests/cerebras/{benchmark,stresstest}.ts` | operador | `src/core/llm` legado | Cerebras/Groq | benchmark → métricas | inferência real manual | experimental | não executado |
| OpenAI SDK/endpoint | nenhum import ou endpoint localizado | — | — | — | — | ausente | nenhuma ação |

## Componentes implementados

- `src/core/ai/`: tipos AI v1, Ports, validações, prompt, schema, orquestrador e providers.
- `src/lib/ai/official/`: composição server-side, adapter Supabase de oferta/conteúdo/idempotência/auditoria e adapter de aprovação.
- `src/app/api/ai/generate/route.ts`: adapter HTTP fino.
- `src/lib/ai/groq.ts`: fronteira legada sem provider, banco ou fallback.

## Precondições e falha fechada

O provider não é resolvido antes de validar: contrato e IDs do comando; chave `ai:<offerId>:v<version>`; canais oficiais únicos; entidade/tenant; estado `selected`; versão lógica `1`; Candidate V1 e suas evidências/URLs/preços. Falha gera auditoria tipada e zero link/post/transição. Falha de provider ou schema gera zero draft. Falha de drafts mantém `selected`. Falha CAS mantém `selected` e conserva drafts para reconciliação.

## Providers e política de fallback

Groq e Cerebras implementam a mesma `AIProviderPort`. Recebem somente prompt/parâmetros técnicos e devolvem conteúdo/evidência. Não há fallback automático: um comando seleciona exatamente um provider, impedindo custo/duplicação ocultos. Provider ausente ou falho encerra o comando e é auditado.

## Posts, links, CAS e idempotência

- links usam `upsert` natural `offer_id,channel` e sub-id determinístico;
- posts existentes `draft` por tenant/oferta/canal são reutilizados; ausentes nascem somente `draft`;
- a chave do comando é determinística por oferta/versão;
- `app_settings` reserva fingerprint e resultado; replay não infere nem persiste novamente; divergência conflita;
- comandos idênticos concorrentes aguardam a primeira execução;
- aprovação usa chave derivada e `transitionOfficialOfferState()`; o State Service executa CAS `selected@1 → approved@2`.

## Auditoria

`integration_logs` registra CommandId, idempotencyKey, CorrelationId, CausationId, offer/tenant/ator/origem/motivo, provider/modelo/latência, resultado/replay/estágio/código, drafts preparados/persistidos e transição solicitada/concluída. API keys, prompt integral e conteúdo integral não são persistidos pela auditoria.

## Evidências de validação

| Verificação | Resultado |
|---|---|
| TDD RED serviço | import `@/core/ai` inexistente, falha esperada |
| TDD GREEN serviço | 15 testes aprovados |
| Providers + adapters + rota/fronteira | 36 testes direcionados aprovados |
| Vitest completo serializado | 34 arquivos, 177 testes aprovados, 0 falhas |
| Vitest paralelo inicial | 175 aprovados; 1 expectativa arquitetural atualizada e 1 timeout Oracle por starvation |
| Oracle isolado `--maxWorkers=1` | 10/10 aprovados; arquivo inalterado |
| ESLint direcionado | PASS, zero saída |
| Typecheck direcionado temporário | PASS, exit 0; arquivo temporário removido |
| Typecheck global | somente dívida preexistente fora dos arquivos PMAV5-007 |
| Cobertura instrumentada | indisponível: `@vitest/coverage-v8` não instalado; não foi instalado nesta Sprint |
| `git diff --check` | PASS |
| IA/Discovery/publicação/deploy | não executados |

## Certificação negativa de escopo

Nenhum Oracle Worker, Discovery, marketplace, Inngest, Extension, Scheduler, PM2, Oracle API/VPS, GitHub Actions, Capacity Hunter, rota de publicação, State Service Core, banco, schema, migration, RLS, `.env`, segredo, Vercel ou produção foi alterado. Nenhuma inferência, Discovery, publicação, build, deploy, restart, merge ou migration foi executada.

## Limitações governadas

Scripts manuais, diagnósticos e implementações `src/core/llm` permanecem fisicamente capazes como legado fora do runtime oficial, conforme preservação exigida e remoção reservada a M-07/M-08. O Worker oficial continua sem caminho para eles. Os componentes proibidos que importam o antigo gateway Next recebem erro fail-closed e não alcançam providers oficiais.

## Conclusão

CP-007 está `COMPLETED`: o Next.js possui uma única autoridade oficial de IA e criação de drafts, subordinada ao State Service e executável somente após `selected`.
