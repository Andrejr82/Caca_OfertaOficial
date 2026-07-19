# PMAV5-008 — Serviço Oficial de Publicação

## Identificação

| Campo | Valor |
|---|---|
| Modo | `IMPLEMENTATION` |
| Implementação | M-06 — Publicação Única |
| Checkpoint | CP-008 |
| Status | `COMPLETED` |
| Data | 2026-07-14 |
| Branch | `codex/pmav5-architecture-unification` |
| Worktree | `C:\Projetos_GitHub\Caca_OfertaOficial\.worktrees\pmav5-architecture-unification` |
| SHA inicial | `70448a6a38eef363b8e6611095a0b5e7221431b8` |

## Especificação técnica aprovada

### Objetivo e autoridade

Estabelecer `publishOfficialPost()` como a única porta oficial capaz de orquestrar publicação externa. O serviço consome exclusivamente oferta `approved` e post persistido `draft`, reserva a operação antes do efeito externo, delega o envio a um transporte técnico, persiste e valida o receipt e somente então solicita as transições oficiais ao State Service.

Telegram, WhatsApp, Instagram e Facebook são transportes delegados. Eles não consultam oferta ou post, não acessam Supabase, não criam conteúdo, não geram IA e não alteram estado de negócio. Inngest e GitHub Actions permanecem executores paralelos fora do caminho oficial nesta Sprint; sua subordinação física pertence à PMAV5-009.

### Arquitetura por fronteira única

```text
POST /api/{telegram|whatsapp|instagram|facebook}/publish
  → autenticação + validação HTTP mínima
  → construção de pmav5.publication/v1
  → publishOfficialPost(command, dependencies)
      → validação do comando e fingerprint
      → reserva/idempotência operacional
      → leitura tenant-aware de offer + post oficial persistido
      → gates approved + draft + vínculo + canal + versões
      → verificação de receipt final anterior
      → PublicationTransportPort.publish(payload persistido)
      → validação e persistência de pmav5.receipt/v1
      → transitionOfficialPostState(draft → published)
      → regra explícita de conclusão
      → transitionOfficialOfferState(approved → posted)
      → auditoria + resultado idempotente
  → resposta HTTP tipada
```

O núcleo ficará em `src/core/publication/` e conhecerá somente tipos, validações e Ports. A composição server-side e os adapters Supabase ficarão em `src/lib/publication/official/`. As rotas não importarão transportes concretos. O núcleo não importará Next.js, Supabase, SDKs de canal, Inngest, GitHub Actions, `process.env`, relógio ou UUID concretos.

### Interface pública única

```ts
export function publishOfficialPost(
  command: OfficialPublicationCommand,
  dependencies: OfficialPublicationServiceDependencies
): Promise<OfficialPublicationResult>;
```

Validação, fingerprint, reconciliação e conclusão da oferta permanecerão internas ou serão funções puras sem capacidade independente de envio.

### Comando oficial

```ts
interface OfficialPublicationCommand {
  contractVersion: "pmav5.publication/v1";
  commandId: string;
  idempotencyKey: string;
  correlationId: string;
  causationId: string | null;
  offerId: string;
  postId: string;
  tenantId: string;
  channel: "telegram" | "whatsapp" | "instagram" | "facebook";
  expectedOfferState: "approved";
  expectedOfferVersion: 2;
  expectedPostState: "draft";
  expectedPostVersion: 0;
  payloadReference: string;
  requestedAt: string;
  actor: StateActor;
  origin: string;
  reason: StateReason;
  metadata?: Readonly<Record<string, string | number | boolean>>;
}
```

`commandId` é o Request ID. A chave natural recomendada é `publication:<postId>:<channel>`. O fingerprint cobre integralmente o payload lógico governante; identificadores de tracing e `requestedAt` são excluídos para que uma nova tentativa da mesma intenção recupere o resultado original. Mesma chave com payload lógico divergente retorna `IDEMPOTENCY_CONFLICT` antes do transporte.

`payloadReference` referencia o post oficial. Conteúdo arbitrário recebido pela rota não será publicado nem persistido durante a publicação.

### Modelo oficial carregado

O repositório entrega ao núcleo somente dados necessários:

- oferta: id, tenant, estado e versão lógica;
- post: id, tenant, offerId, canal, estado, versão, conteúdo persistido, mídia e destino técnico referenciado;
- vínculo entre post, oferta, tenant e canal.

Ausência, divergência de tenant, vínculo, estado, versão, canal ou payload falha fechada antes do transporte.

### Ports

| Port | Responsabilidade |
|---|---|
| `PublicationRepositoryPort` | leitura tenant-aware de oferta/post e avaliação da condição de conclusão |
| `PublicationTransportPort` | um envio técnico e retorno de receipt, sem estado de negócio |
| `PublicationTransportRegistryPort` | resolução de exatamente um transporte pelo canal |
| `PublicationReceiptPort` | leitura e persistência imutável/reconciliável de receipts |
| `PublicationReservationPort` | reserva, replay, conflito, conclusão e liberação operacional |
| `PublicationStatePort` | única ponte para as duas funções oficiais do State Service |
| `PublicationAuditPort` | tentativa, sucesso, falha, replay e estágio de falha |
| `ClockPort` | tempo UTC injetado |
| `UUIDPort` | IDs técnicos determinísticos/injetados |

### Transporte e payload técnico

```ts
interface PublicationTransportRequest {
  commandId: string;
  idempotencyKey: string;
  correlationId: string;
  causationId: string | null;
  offerId: string;
  postId: string;
  channel: OfficialPublicationChannel;
  content: string;
  mediaUrl: string | null;
  destination: string;
  timeoutMs: number;
  metadata: Readonly<Record<string, string | number | boolean>>;
}
```

Cada adapter recebe dependências técnicas já configuradas por injeção. Nenhum adapter acessa Supabase ou State Service. Retry de negócio não pertence ao transporte. Para impedir duplicação oculta, a operação pública do adapter realiza uma tentativa lógica; políticas internas inevitáveis do provider deverão preservar o mesmo Request ID e nunca decidir estado.

### Receipt v1

O receipt final normalizado conterá:

- `receiptVersion: "pmav5.receipt/v1"`;
- `receiptId`, `commandId`, `idempotencyKey`, `correlationId`, `causationId`;
- `tenantId`, `offerId`, `postId`, `channel`;
- `provider`, `externalId`, `sentAt`, `observedAt`;
- `accepted`, `deliveryStatus`, `outcome` e `evidenceHash`;
- metadados técnicos não sensíveis.

Somente `accepted=true`, `outcome=confirmed`, `deliveryStatus=confirmed`, IDs correspondentes ao comando e `externalId` não vazio constituem receipt final. Receipt inválido, `failed`, `unknown`, criação de job, aceite de fila ou workflow disparado não autoriza transição.

### Reserva operacional e reconciliação

Sem migration, `app_settings` armazenará registros sob prefixos exclusivos de publicação. A reserva é por tenant/post/canal e contém owner, commandId, correlationId, fingerprint, acquiredAt, expiresAt e fase técnica.

Fases operacionais não são estados de negócio. Nenhuma delas é gravada em `posts.status`:

- `reserved`: transporte ainda não chamado;
- `receipt_recorded`: envio externo confirmado e receipt persistido;
- `completed`: transições e resultado final persistidos;
- `failed_before_receipt`: falha determinística sem confirmação externa;
- `reconciliation_required`: receipt existe e alguma transição local falhou.

Se o transporte falhar sem receipt final, oferta permanece `approved`, post permanece `draft` e a tentativa é auditada. O mesmo comando retorna a mesma falha; uma nova intenção poderá tentar novamente com novo commandId conforme a política operacional.

Se houver receipt e a transição local falhar, o replay recupera o receipt, não chama o transporte e retoma somente State Service/auditoria. Receipt repetido não repete envio nem transição.

### Regra de conclusão da oferta

Adota-se a regra A: a oferta se torna `posted` após a primeira publicação oficial bem-sucedida.

Esta decisão é certificada pelo comportamento homologado vigente:

- C-004 define como saída de uma publicação confirmada o post `published` e a oferta `posted`;
- a máquina oficial vincula `approved → posted` a post draft, canal válido e receipt confirmado;
- `completeOfficialPublication()` e seu teste da PMAV5-006 solicitam `posted` imediatamente após um post confirmado.

A regra não é decidida por rota ou transporte. Ela será uma política explícita do serviço. Se o State Service informar replay da conclusão já aplicada, o resultado permanece idempotente. Novas publicações que não começam com oferta `approved` falham fechadas, conforme ADR-006 e o comando oficial.

### Política para canais assíncronos

O ramo Instagram que delegava Reels ao GitHub Actions continuará fail-closed. O job não será criado pela rota oficial nesta Sprint porque o executor proibido ainda não devolve receipt final autenticado sem escrever estados diretamente. O fluxo será documentado para PMAV5-009.

O transporte Instagram oficial desta Sprint cobre apenas a operação síncrona capaz de devolver um externalId final. Qualquer payload que exija o fluxo assíncrono retorna erro tipado antes de efeito externo.

### Rotas oficiais

As quatro rotas deverão:

1. autenticar a sessão;
2. aceitar `postId` e metadados de rastreio mínimos;
3. construir o comando com tenant autenticado e estados/versões esperados constantes;
4. chamar somente a composição de `publishOfficialPost()`;
5. mapear resultado/erro tipado para HTTP.

Elas não carregarão oferta/post, não aceitarão conteúdo governante, não atualizarão conteúdo/status/metadados, não resolverão imagem/destino, não chamarão SDK/cliente de canal e não decidirão `posted`.

### Inventário inicial de publicadores

| Caminho | Caller | Canal | Classe | Estado/efeito atual | Ação PMAV5-008 |
|---|---|---|---|---|---|
| `src/app/api/telegram/publish/route.ts::POST` | painel Telegram/Publish | Telegram | oficial fragmentado | lê DB, aceita conteúdo arbitrário, envia, chama conclusão e grava metadados | migrar para serviço único |
| `src/app/api/whatsapp/publish/route.ts::POST` | painel WhatsApp/Publish | WhatsApp | oficial fragmentado | resolve destino/imagem, envia com retry local, audita e conclui | migrar para serviço único |
| `src/app/api/instagram/publish/route.ts::POST` | painel Instagram/Publish | Instagram | oficial parcial | síncrono para cupom; assíncrono já desconectado | migrar síncrono; manter assíncrono fail-closed |
| `src/app/api/facebook/publish/route.ts::POST` | painel Facebook | Facebook | oficial fragmentado | envia, conclui e grava metadados | migrar para serviço único |
| `src/lib/state/official-publication-service.ts::completeOfficialPublication` | quatro rotas | todos | fundação transitória PMAV5-006 | só transições, sem comando/receipt/reserva/transporte | substituir pela nova autoridade; preservar compatibilidade apenas se sem caller |
| `src/lib/telegram/client.ts` | rota/actions/Extension | Telegram | transporte técnico compartilhado | API Telegram | envolver por adapter oficial; callers paralelos continuam fora do caminho oficial |
| `src/lib/integrations/whatsapp/index.ts` | rota/actions/Extension | WhatsApp | transporte com retry técnico | WhatsApp Engine | adapter oficial injetado; remover retry de negócio do caminho oficial |
| `src/lib/instagram/client.ts` | rota/actions/GitHub script | Instagram | transporte técnico compartilhado | Meta Graph síncrono e vídeo | adapter síncrono oficial; fluxo GitHub bloqueado |
| `src/lib/platforms/facebook.ts` | rota | Facebook | transporte técnico | Meta Graph | envolver por adapter oficial |
| `src/lib/publish/actions.ts` | Publish Express/Extension | Telegram/WhatsApp/Instagram | legado/experimental | gateways rápidos já fail-closed ou técnicos | bloquear qualquer autoridade concorrente permitida; sem alterar Extension |
| `src/lib/publish/automated.ts` | nenhum caller interno localizado | múltiplos | órfão/experimental | automação incompleta | preservar sem caller para PMAV5-009/010 |
| `src/lib/publisher/index.ts` | Inngest generic publisher | múltiplos | genérico/paralelo | seleciona cliente por canal e envia | provar não alcançado pelas rotas; PMAV5-009 |
| `src/lib/inngest/functions.ts::publishPostBackground` | evento Inngest | genérico | órfão/paralelo | chama generic publisher | arquivo proibido; preservar para PMAV5-009 |
| `src/app/api/publish/extension/route.ts::POST` | Extensão | múltiplos | paralelo | cria approved, gera IA e publica diretamente | arquivo proibido; gateway de IA já falha fechado; PMAV5-009 |
| `scripts/github-publish.ts::main` | GitHub Actions | Instagram | paralelo | renderiza, publica e escreve `published/posted` diretamente | arquivo proibido; rota oficial não o chama; PMAV5-009 |
| `.github/workflows/publish-reel.yml` | workflow dispatch | Instagram | paralelo | executa script GitHub | arquivo proibido; preservar desconectado |
| `scripts/ai-processor.cjs`, scripts antigos/manutenção | operador | múltiplos | legado/maintenance | capacidade manual fora do fluxo oficial | preservar para PMAV5-009/010 |
| `scripts/oracle-scraper.cjs` legado físico | nenhum caller do Worker oficial | múltiplos | legado desconectado | capacidade histórica de IA/posts | arquivo proibido; Worker oficial permanece Discovery-only |

### Limites da Sprint

- nenhuma publicação, IA, Discovery, deploy, migration, restart ou acesso à produção;
- nenhum arquivo de Oracle Worker/API, Discovery, marketplace, Official AI Service, Curadoria, Inngest, Extension, GitHub Actions, Scheduler, PM2, banco/schema/RLS, `.env` ou infraestrutura;
- nenhuma remoção física dos publicadores paralelos proibidos;
- nenhum estado `processing`, `failed`, `deleted` ou `retrying` na máquina de negócio;
- nenhuma alteração normativa dos contratos canônicos;
- nenhum plano fora de `PMAV5` e nenhum commit intermediário; o encerramento utilizará somente o commit exato da Sprint.

## Plano TDD de implementação

### Ciclo 1 — Contratos, validação e serviço puro

- [x] Criar testes de `publishOfficialPost()` para comando, tenant, existência, vínculo, canal, estados, versões, contracts, payload persistido e zero transporte em falha.
- [x] Executar o teste direcionado e registrar RED por módulo ausente.
- [x] Criar tipos, erros, validação, fingerprint, Ports, orquestrador e barrel em `src/core/publication/`.
- [x] Reexecutar até GREEN com adapters em memória, clock e UUID determinísticos.

### Ciclo 2 — Receipt, idempotência, concorrência e reconciliação

- [x] Adicionar testes RED para replay, conflito de payload, duas chamadas concorrentes, receipt inválido/repetido, falha de transporte e falhas de State Service após envio.
- [x] Implementar reserva e máquina operacional internas sem novo estado de negócio.
- [x] Persistir receipt antes das transições e retomar reconciliação sem reenvio.
- [x] Reexecutar até GREEN e provar no máximo um envio externo.

### Ciclo 3 — Transportes puros

- [x] Criar testes RED de conformidade para Telegram, WhatsApp, Instagram e Facebook.
- [x] Implementar quatro adapters que recebem funções/configuração técnicas por injeção e devolvem Receipt v1.
- [x] Provar estaticamente ausência de Supabase, State Service, IA, criação de posts e mutação de estados.
- [x] Reexecutar até GREEN sem rede real.

### Ciclo 4 — Persistência e composição oficial

- [x] Criar testes RED do adapter Supabase fake para leitura tenant-aware, reserva, receipt, auditoria e metadados técnicos.
- [x] Implementar composição em `src/lib/publication/official/`, reutilizando `app_settings`, `integration_logs` e as funções oficiais do State Service.
- [x] Implementar a regra A em uma policy explícita, fora das rotas.
- [x] Reexecutar até GREEN, incluindo reconciliação após receipt.

### Ciclo 5 — Rotas

- [x] Criar testes arquiteturais RED exigindo rotas finas e import exclusivo da composição oficial.
- [x] Migrar Telegram, WhatsApp, Instagram e Facebook sem transporte, banco ou regra de domínio nas rotas.
- [x] Manter Instagram assíncrono fail-closed e remover conteúdo arbitrário do comando HTTP.
- [x] Reexecutar testes de rota/arquitetura até GREEN.

### Ciclo 6 — Legado, provas e regressão

- [x] Bloquear gateways legados permitidos que ainda possam concorrer e provar ausência de caller nas rotas oficiais.
- [x] Executar State Service, Official AI Service, Curadoria, Oracle Discovery-Only, publicação e suíte completa serializada.
- [x] Executar ESLint direcionado, typecheck direcionado, cobertura quando disponível e `git diff --check`.
- [x] Revisar integralmente o diff e certificar zero arquivo proibido alterado.

### Ciclo 7 — Evidências, rollback e encerramento

- [x] Criar auditoria e rollback PMAV5-008 com resultados reais.
- [x] Atualizar CP-008 e changelog somente após evidência fresca.
- [x] Stage exclusivo, revisar diff staged, criar o commit exato e fazer push somente para a branch PMAV5.

## Critérios de design

O desenho será considerado implementado somente quando as quatro rotas chamarem exclusivamente `publishOfficialPost()`, os quatro transportes retornarem receipts sem autoridade de estado, todos os efeitos externos forem protegidos por reserva idempotente, toda confirmação for reconciliável e as duas transições finais ocorrerem exclusivamente pelo State Service.

## Resultado certificado

A implementação foi concluída em TDD. O núcleo oficial, os quatro transportes puros, a composição server-side, a persistência operacional e as quatro rotas foram migrados. A suíte integral aprovou 236 testes em 39 arquivos, sem falhas; ESLint e typecheck direcionados não registraram erro da Sprint. O typecheck global mantém somente dívida preexistente fora do escopo. Nenhuma rede externa, publicação real, IA real, migration, deploy ou produção foi acionada.
