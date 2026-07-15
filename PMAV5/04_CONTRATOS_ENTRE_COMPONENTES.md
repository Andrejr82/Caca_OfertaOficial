# Contratos entre Componentes

Todos os contratos são versionados, autenticados, observáveis, idempotentes e fail-closed. Payload inválido, estado incompatível, dependência indisponível ou ausência de auditoria impede efeitos posteriores.

## C-001 — Discovery

- **Entrada:** `marketplace`, categoria, subcategoria quando aplicável e configuração oficial versionada.
- **Pré-condições:** disparo do Scheduler oficial; marketplace/categoria habilitados; chave idempotente do ciclo.
- **Processamento:** Discovery, Top 20, sanitização, deduplicação, novelty e score determinístico.
- **Saída:** oferta normalizada persistida em `pending_manual_review` e evidência do ciclo.
- **Nunca produz:** `draft`, `selected`, `approved`, `posted`, posts, publicação ou IA.
- **Erro/retry:** não promove estado; retry preserva a mesma chave e não duplica oferta.

## C-002 — Curadoria

- **Entrada:** oferta em `pending_manual_review`, usuário autenticado e decisão explícita.
- **Saída:** `selected` ou `rejected`, com ator, data, origem e motivo auditáveis.
- **Proibições:** auto-seleção, decisão sem identidade ou salto para `approved`/`posted`.
- **Idempotência:** repetição da mesma decisão não cria nova promoção; decisão conflitante falha fechada.

## C-003 — IA

A Official AI é a única autoridade de geração de conteúdo. Não existe segunda IA, segundo Worker ou segundo endpoint. O modo de operação é selecionado internamente pelo serviço a partir do campo `mode` do comando.

### C-003 Modo 1 — Draft Generation (ADR-014)

- **Entrada:** oferta em `pending_manual_review`, identidade do solicitante/serviço, versão de prompt/modelo e idempotency key com prefixo `ai:draft:`.
- **Saída:** posts `draft` vinculados à oferta via `offer_id`.
- **Estado da offer:** permanece `pending_manual_review` durante e após a operação. Nenhuma transição de estado é executada.
- **Nunca aceita:** `selected`, `approved`, `posted`, `rejected`.
- **Nunca produz:** transição de estado, `approved`, publicação.
- **Idempotência:** chave por `offer_id`+`channel` impede geração de dois drafts ativos para a mesma oferta e canal.
- **Erro:** mantém `pending_manual_review`; conteúdo parcial não é visível nem publicável.
- **Auditoria:** entrada referenciada, provider/modelo, versão, resultado e erro sem segredo.

### C-003 Modo 2 — Approval (comportamento anterior, inalterado)

- **Entrada obrigatória:** oferta em `selected`, identidade do solicitante/serviço, versão de prompt/modelo e idempotency key.
- **Saída atômica de negócio:** oferta `approved` e posts `draft`, após validações oficiais.
- **Nunca aceita:** `draft`, `pending_manual_review`, `posted` ou `rejected`.
- **Erro:** mantém `selected`; conteúdo parcial não é aprovado nem publicável.
- **Auditoria:** entrada referenciada, provider/modelo, versão, resultado, validações e erro sem segredo.

## C-004 — Publicação

- **Entrada:** oferta `approved`, post `draft`, canal válido/configurado e comando autorizado.
- **Saída:** confirmação técnica válida, post `published` e oferta `posted` pelo serviço oficial.
- **Erro:** oferta permanece `approved`, post permanece `draft` ou registra erro técnico separado; nunca presume sucesso.
- **Idempotência:** chave por post/canal impede envio duplicado e permite reconciliar confirmação.
- **Proibições:** criar/selecionar/aprovar implicitamente, publicar conteúdo não persistido ou atualizar apenas metade do resultado.

## C-005 — Estado

Nenhum componente altera status diretamente. Toda transição usa o serviço oficial, que valida origem, destino, ator, pré-condições e versão concorrente; executa mudança e auditoria de forma transacional; recusa saltos, atores indevidos e estados terminais; e devolve resultado idempotente.

## C-006 — Scheduler

- **Entrada:** agenda e configuração canônica.
- **Saída:** comando idempotente exclusivamente para Discovery do Oracle Worker.
- **Nunca chama:** IA, curadoria, posts, publicação, canais ou transições de negócio.
- **Concorrência:** uma execução lógica por janela; lock/lease distribuído será definido em Sprint própria.

## C-007 — Extensão

- **Entrada:** produto externo normalizado, usuário autenticado e metadados de origem.
- **Saída:** ingresso oficial em `pending_manual_review` ou rejeição explícita.
- **Nunca:** usa service-role no cliente, escolhe usuário por fallback, chama IA/publicação ou escreve estado diretamente.

## C-008 — Inngest

- **Entrada:** tarefa delegada pela autoridade do domínio, contrato/versionamento, idempotency key e contexto de auditoria.
- **Saída:** resultado ou erro devolvido à autoridade; efeitos somente pelos serviços oficiais.
- **Garantias:** tarefas idempotentes, retry delimitado e observável, sem aquisição de autoridade por execução assíncrona.
- **Nunca:** inicia fluxo paralelo nem promove estado fora do contrato delegado.

## C-009 — Transporte WhatsApp

- **Entrada:** mensagem/post já autorizado pelo serviço único de publicação e identificador idempotente.
- **Saída:** recibo técnico verificável ou erro.
- **Nunca:** altera oferta/post, produz conteúdo ou decide retry de negócio por conta própria.

## Compatibilidade e evolução

Mudança incompatível de contrato exige versão nova, ADR aprovado, consumidores identificados, estratégia de migração e rollback. Payloads desconhecidos falham fechados. Nenhuma flag converte contrato temporário em arquitetura permanente.
