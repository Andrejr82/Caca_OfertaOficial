# PMAV5-007 — Serviço Oficial de IA e Posts

## Identificação

| Campo | Valor |
|---|---|
| Modo | `IMPLEMENTATION` |
| Implementação | M-05 — Serviço Oficial de IA e Posts |
| Checkpoint | CP-007 |
| Status | `COMPLETED` |
| Data | 2026-07-13 |
| Branch | `codex/pmav5-architecture-unification` |
| Worktree | `C:\Projetos_GitHub\Caca_OfertaOficial\.worktrees\pmav5-architecture-unification` |
| SHA inicial | `746abb2b7967315c55cf0070ae8a753ed8d02573` |

## Especificação técnica aprovada

### Objetivo

Estabelecer `generateOfficialAI()` como a única porta geradora de conteúdo. O serviço valida integralmente o comando e a oferta antes da inferência, coordena exatamente um provider puro, persiste links e posts `draft` de forma idempotente e somente depois solicita `selected → approved` por `transitionOfficialOfferState()`.

### Arquitetura por fronteira única

```text
POST /api/ai/generate
  → autenticação + construção do comando
  → generateOfficialAI(command, dependencies)
      → validação do comando AI v1
      → reserva idempotente/fingerprint
      → leitura tenant-aware da oferta
      → validação selected/version/Candidate v1/State v1
      → buildOfficialPrompt()
      → AIProviderPort.generate()
      → validação do schema de conteúdo
      → OfficialAIContentPort.persistDrafts()
          → affiliate_links idempotentes
          → posts:draft idempotentes
      → transitionOfficialOfferState(selected, approved)
      → OfficialAIAuditPort.register()
  → resposta HTTP tipada
```

O núcleo em `src/core/ai/` não conhece Next.js, Supabase, rotas, publicação, Oracle, Inngest ou Extension. Os providers conhecem somente requisição/resposta de inferência. A composição Supabase fica em `src/lib/ai/official/` e a rota não contém regra de domínio.

### Interface pública

```ts
export function generateOfficialAI(
  command: OfficialAICommand,
  dependencies: OfficialAIServiceDependencies
): Promise<OfficialAIResult>;
```

Não haverá segunda função pública capaz de alcançar provider. Construção de prompt, validação de saída e preparação de drafts permanecem internas ou puras.

### Comando oficial

```ts
interface OfficialAICommand {
  contractVersion: "pmav5.ai/v1";
  commandId: string;
  idempotencyKey: string;
  correlationId: string;
  causationId: string | null;
  offerId: string;
  tenantId: string;
  expectedState: "selected";
  expectedVersion: 1;
  providerPreference?: "groq" | "cerebras";
  channels: readonly ("telegram" | "instagram" | "whatsapp")[];
  requestedAt: string;
  actor: { type: "user" | "service"; id: string; service?: string };
  origin: string;
  reason: { code: string; detail?: string };
  metadata?: Readonly<Record<string, string | number | boolean>>;
}
```

### Fail-closed e contratos

Antes do provider, o serviço prova: comando `pmav5.ai/v1`, identidade e tenant, oferta existente, `status=selected`, versão lógica `1`, marketplace reconhecido, `explainability.contract_version=pmav5.candidate/v1`, campos Candidate materializados válidos, canais únicos/permitidos, comando State v1 construível e reserva idempotente sem conflito. Qualquer falha registra rejeição e produz zero inferência, link, post ou transição.

### Providers

`AIProviderPort` recebe somente prompt, modelo, parâmetros técnicos, correlation ID, timeout e metadata não sensível. Groq e Cerebras devolvem conteúdo, provider, modelo, latência, usage e finish reason. Eles não importam Supabase, State Service, posts, links ou publicação. A política inicial escolhe um único provider por comando; não há fallback automático nesta Sprint, eliminando risco de inferência duplicada. Uma falha retorna erro tipado ao serviço.

### Saída estruturada

O schema exige `title`, `description`, `shortCopy`, `longCopy`, `hashtags`, `callToAction`, `highlights`, `explanation` e `channelCopies` para os canais solicitados. Campos de estado, aprovação, seleção, publicação ou operação de banco são rejeitados.

### Links, posts e aprovação

O adapter Supabase usa identidades naturais já existentes: `affiliate_links(offer_id,channel)` via upsert e reutilização; posts ativos são lidos por oferta/canal e drafts ausentes são inseridos uma única vez. Posts nascem exclusivamente `draft`. Não há delete, `published`, `processing` ou update de status. Somente após confirmar todos os canais, o serviço chama `transitionOfficialOfferState()` com chave própria derivada do comando. Falha mantém a oferta `selected` e os drafts reconciliáveis.

### Idempotência, concorrência e auditoria

O fingerprint determinístico cobre todo o comando. `app_settings` persiste reserva e resultado do comando sem schema novo; replay idêntico retorna o resultado original, enquanto payload divergente retorna `IDEMPOTENCY_CONFLICT`. Comandos concorrentes iguais compartilham o resultado pendente. A auditoria em `integration_logs` registra IDs, provider/modelo/latência, estágio, resultado, replay, quantidade de drafts e resultado da transição, sem segredo ou prompt integral.

### Fronteira legada

`src/lib/ai/groq.ts` preservará assinaturas necessárias à compilação, mas `callLLM()`, `generateOfferAnalysis()` e `analyzeConversionPotential()` encerrarão com erro explícito antes de provider. Assim, arquivos proibidos permanecem fisicamente inalterados e sem acesso executável a Groq/Cerebras. Remoção física dos callers pertence a PMAV5-009/010.

## Inventário inicial dos callers de IA

| Arquivo/função | Caller/consumidor | Provider | Efeitos atuais | Classe | Ação PMAV5-007 |
|---|---|---|---|---|---|
| `src/app/api/ai/generate/route.ts::POST` | painel de mensagens, trends/coupons legados | Groq | links, posts draft, score, aprovação | oficial fragmentado | migrar para `generateOfficialAI()` |
| `src/lib/ai/groq.ts::generateOfferAnalysis` | rota oficial, Inngest, Extension; testes | Groq | copy e fallback estático | gateway paralelo | bloquear fail-closed após migração oficial |
| `src/lib/ai/groq.ts::callLLM` | generator, curadoria IA, scraper Next | Groq | inferência genérica | gateway paralelo | bloquear fail-closed |
| `src/lib/ai/groq.ts::analyzeConversionPotential` | `curation-engine.ts` | Groq | score/justificativa | paralelo | bloquear fail-closed; curadoria determinística preservada |
| `src/lib/inngest/functions.ts::runUserScrapingBackground` | endpoint Inngest | Groq | Discovery, links, posts, estado | paralelo/proibido | preservar arquivo; acesso ao gateway fica bloqueado |
| `src/app/api/publish/extension/route.ts::POST` | Extensão | Groq | oferta approved, IA e publicação | paralelo/proibido | preservar arquivo; acesso ao gateway fica bloqueado |
| `src/lib/affiliates/scraper.ts` | trends/cron/Inngest | Groq | extração Discovery | paralelo/proibido | preservar arquivo; acesso ao gateway fica bloqueado |
| `src/lib/publish/automated.ts::publishAutomatedOfferAction` | nenhum caller interno localizado | import Groq | fluxo experimental | órfão/experimental | preservar sem caller; gateway bloqueado |
| `src/lib/publish/actions.ts::generateQuickPostAction` | Publish Express | nenhum após PMAV5-006 | somente ingestão pending | legado desconectado | preservar sem geração |
| `scripts/ai-processor.cjs` | execução manual | Oracle generator/Cerebras→Groq | posts e approved | legado | preservar; fronteira Next não o torna oficial; runtime já fora do Worker |
| `scripts/oracle-scraper.cjs::generateOfferAnalysis/callLLM` | legado e diagnósticos | Cerebras→Groq | extração/copy | legado físico | arquivo proibido; Worker oficial provado sem caller |
| `scripts/backfill-approved-posts.cjs` | operador com confirmação | LLMFactory | posts faltantes | manutenção | preservar para M-07/M-08; não é fluxo oficial |
| `scripts/sanitize-posts-integrity.cjs` | operador com confirmação | LLMFactory | saneamento | manutenção | preservar para M-07/M-08 |
| `src/core/llm/{groq,cerebras}.ts` | benchmarks externos | respectivos | inferência pura | provider técnico | transformar/adaptar ao `AIProviderPort` oficial |
| `src/core/llm/*.js` | LLMFactory de scripts | Cerebras/Groq | inferência de legado | legado | preservar fisicamente, sem import pelo serviço oficial |
| `scripts/crawlee_groq_test.cjs`, `scripts/test-extract.cjs` | execução manual de diagnóstico | Groq endpoint | inferência real | experimental | preservar; proibido executar; remoção futura |
| `tests/cerebras/*` | operador | Groq/Cerebras | benchmark real | experimental | preservar; não executar |
| OpenAI SDK | nenhum import/endpoint localizado | — | — | ausente | preservar ausência |

## Plano TDD de implementação

### Ciclo 1 — Contratos, validação e serviço

- [x] Criar `src/tests/core/ai/official-ai-service.test.ts` com providers/adapters em memória e casos de estado, tenant, entidade, versão, Candidate/AI/State contracts, canais, provider/saída, persistência, transição, falhas, replay, conflito e concorrência.
- [x] Executar `npx vitest run src/tests/core/ai/official-ai-service.test.ts` e registrar RED por módulo ausente.
- [x] Criar `src/core/ai/types.ts`, `ports.ts`, `validation.ts`, `prompt.ts`, `content-schema.ts`, `official-ai-service.ts` e `index.ts` com a implementação mínima para GREEN.
- [x] Reexecutar o teste direcionado até zero falhas, mantendo providers e persistência injetados.

### Ciclo 2 — Providers puros

- [x] Criar `src/tests/core/ai/providers.test.ts` cobrindo Groq/Cerebras, payload técnico, resposta/erro e ausência de imports proibidos.
- [x] Executar o teste e registrar RED por adapters ausentes.
- [x] Criar `src/core/ai/providers/groq-provider.ts` e `cerebras-provider.ts`, ambos implementando `AIProviderPort` sem side effects fora de `fetch`.
- [x] Reexecutar os testes até GREEN, sem chamadas reais.

### Ciclo 3 — Adapter Supabase oficial

- [x] Criar `src/tests/lib/ai/supabase-official-ai-adapter.test.ts` com cliente fake cobrindo oferta tenant-aware, reservas/replay/conflito, links, drafts e auditoria.
- [x] Executar o teste e registrar RED.
- [x] Criar `src/lib/ai/official/supabase-official-ai-adapter.ts` e `create-official-ai-service.ts`, reutilizando `app_settings`, `integration_logs` e `transitionOfficialOfferState()`.
- [x] Reexecutar até GREEN e provar que posts nascem somente `draft`.

### Ciclo 4 — Rota e bloqueio legado

- [x] Criar testes arquiteturais para a rota importar apenas a composição oficial e para os gateways legados falharem antes de `fetch`.
- [x] Executar os testes e registrar RED.
- [x] Reduzir `src/app/api/ai/generate/route.ts` a autenticação, comando e resposta; substituir `src/lib/ai/groq.ts` por fachada de tipos/erros fail-closed sem provider.
- [x] Reexecutar até GREEN e ajustar os testes Groq legados para certificarem a fronteira desativada.

### Ciclo 5 — Provas e regressão

- [x] Criar/estender teste arquitetural que separe referências históricas de caminhos oficiais e prove providers importados somente pela composição do Official AI Service.
- [x] Executar testes AI, State Service, Curadoria, Oracle Discovery-Only e suíte completa.
- [x] Executar ESLint dos arquivos alterados, typecheck direcionado e `git diff --check`.
- [x] Revisar o diff e confirmar zero alteração nos arquivos proibidos.

### Ciclo 6 — Evidências, rollback e encerramento

- [x] Criar `PMAV5/AUDITORIAS/PMAV5-007_SERVICO_OFICIAL_IA.md` e `PMAV5/ROLLBACKS/PMAV5-007_ROLLBACK.md` com resultados reais.
- [x] Atualizar CP-007 para `COMPLETED`, changelog e esta ficha somente após evidência fresca.
- [ ] Stage exclusivo, revisar `git diff --cached --stat`, criar o commit exato e fazer push somente para a branch PMAV5.

## Resultado de validação

- Vitest completo: 34 arquivos, 177 testes aprovados, zero falhas, usando `--maxWorkers=1` para evitar starvation do subprocesso Oracle.
- ESLint direcionado: PASS.
- Typecheck direcionado: PASS; typecheck global conserva somente dívida preexistente fora do escopo.
- Cobertura: não disponível porque `@vitest/coverage-v8` não está instalado; nenhuma dependência foi adicionada.
- `git diff --check`: PASS.
- IA real, Discovery real, publicação, build, deploy e produção: não executados.

## Restrições globais

- Não alterar Oracle Worker, Discovery, marketplaces, Inngest, Extension, Scheduler, PM2, GitHub Actions, Capacity Hunter, rotas de publicação, banco, schema, migration, RLS, `.env`, produção ou `main`.
- Não executar inferência, Discovery, publicação, deploy, migration, restart, merge, force push ou reset destrutivo.
- Não iniciar PMAV5-008.
