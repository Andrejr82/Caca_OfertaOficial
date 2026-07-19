# PMAV5-008 — Auditoria do Serviço Oficial de Publicação

## Identificação

| Campo | Valor |
|---|---|
| Modo | `IMPLEMENTATION` |
| Entrega | M-06 — Publicação Única |
| Checkpoint | CP-008 |
| Status | `COMPLETED` |
| Data | 2026-07-14 |
| Branch | `codex/pmav5-architecture-unification` |
| SHA inicial | `70448a6a38eef363b8e6611095a0b5e7221431b8` |

## Resultado

`publishOfficialPost()` é a única operação pública do núcleo em `src/core/publication/`. Ela valida comando, tenant, vínculo, canal, estados, versões e referência ao post persistido; reserva a intenção; resolve um transporte delegado; valida e persiste Receipt v1; e somente então solicita as transições oficiais ao State Service.

A composição server-side está em `src/lib/publication/official/`. Telegram, WhatsApp, Instagram e Facebook recebem payload técnico por injeção, não acessam banco, State Service ou IA e devolvem somente receipts. As quatro rotas oficiais autenticam, constroem o comando e chamam a composição única, sem conteúdo arbitrário, queries de domínio ou SDK de canal.

## Invariantes certificadas

- oferta precisa estar `approved` e post precisa estar `draft` antes de qualquer envio;
- o conteúdo publicado é o post oficial persistido e tenant-aware;
- receipt final confirmado é persistido antes de qualquer transição;
- `draft → published` e `approved → posted` são solicitadas exclusivamente por `transitionOfficialPostState()` e `transitionOfficialOfferState()`;
- regra A: o primeiro receipt oficial confirmado conclui a oferta como `posted`;
- mesma intenção lógica produz replay e não reenvia; payload divergente conflita;
- chamadas concorrentes permitem no máximo um envio;
- falha antes de receipt mantém `draft/approved`; falha local depois do envio entra em reconciliação e reutiliza o receipt;
- Instagram assíncrono não autoriza transição até receipt final e permanece fail-closed;
- gateways legados permitidos foram bloqueados; publicadores proibidos e paralelos permanecem fisicamente inalterados e não são alcançados pelas rotas oficiais.

## Persistência operacional

Sem migration, reservas e idempotência utilizam chaves exclusivas em `app_settings`; auditoria usa `integration_logs`; receipts usam o store existente. Fases `pending`, `receipt_recorded`, `reconciliation_required` e `completed` são técnicas e nunca são gravadas como estado de negócio. Metadados técnicos somente são atualizados depois da persistência do receipt.

## Evidência TDD e verificação

- ciclos RED observados para núcleo ausente, fingerprint lógico, transportes, adapter Supabase, composição, fronteiras de rota e bloqueio legado;
- testes do núcleo: 23 aprovados;
- suíte direcionada de publicação, adapters, composição e arquitetura: aprovada;
- State Service, Official AI Service, Curadoria e Oracle Discovery-Only: aprovados em regressão;
- suíte integral: 236 testes aprovados em 39 arquivos, 0 falhas;
- ESLint direcionado: aprovado;
- typecheck direcionado: nenhum erro nos arquivos PMAV5-008;
- typecheck global: permanece com erros preexistentes fora do escopo, sem erro novo da Sprint;
- cobertura: não emitida porque `@vitest/coverage-v8` não está instalado;
- `git diff --check`: aprovado.

Todos os testes usaram fakes/mocks. Nenhuma publicação real, IA real, chamada a serviço externo, migration, alteração de schema, deploy, restart ou acesso à produção foi realizado.

## Escopo negativo

Nenhum arquivo de Oracle Worker/API, Discovery, marketplaces, Official AI Service, Curadoria de domínio, Inngest, Extensão, GitHub Actions, Scheduler, PM2, banco/schema/RLS, `.env`, segredo ou infraestrutura foi alterado. A remoção física e subordinação dos executores paralelos pertence à PMAV5-009 e não foi iniciada.

## Conclusão

CP-008 está `COMPLETED`. O Serviço Oficial de Publicação é a autoridade única das quatro rotas oficiais, com transportes puros, receipt anterior ao estado, idempotência, concorrência controlada, reconciliação sem reenvio e regra A aplicada pelo State Service.
