# Decisões Arquiteturais Iniciais

Todos os ADRs abaixo têm status **APPROVED** em 13/07/2026. Contexto comum: a auditoria certificou governança distribuída, bypasses de estado, IA/publicação concorrentes e coexistência V4/V5. Alternativas comuns rejeitadas foram manter múltiplas autoridades ou usar flags como arquitetura; elas preservariam ambiguidade e risco. Revisão exige novo ADR que indique explicitamente o sucedido.

## ADR-001 — Oracle Worker será Discovery-Only

**Decisão:** limitar o Worker a Discovery, qualificação determinística e persistência em `pending_manual_review`.

**Trade-off/consequência:** perde autonomia de processamento completo e passa a depender do fluxo manual; ganha separação, previsibilidade e auditabilidade. Falha termina fechada no estágio de Discovery.

## ADR-002 — Next.js será autoridade de curadoria, IA e publicação

**Decisão:** concentrar interface humana e serviços oficiais posteriores à revisão no Next.js.

**Trade-off/consequência:** aumenta criticidade e responsabilidade do Next.js; elimina decisões concorrentes. Mitigação futura: serviços internos bem delimitados e observabilidade.

## ADR-003 — Supabase será o estado central

**Decisão:** ofertas, links, posts e auditoria terão persistência oficial no Supabase.

**Trade-off/consequência:** cria dependência central explícita; ganha integridade e visão única. Indisponibilidade falha fechada.

## ADR-004 — IA exigirá selected

**Decisão:** somente oferta `selected` pode entrar na IA.

**Trade-off/consequência:** reduz automação antecipada e throughput bruto; preserva intenção humana, custo e qualidade.

## ADR-005 — Discovery sempre produzirá pending_manual_review

**Decisão:** todo ingresso automatizado ou externo termina em `pending_manual_review`.

**Trade-off/consequência:** adiciona fila manual; elimina promoção automática e uniformiza entradas.

## ADR-006 — Publicação exigirá approved e post draft

**Decisão:** serviço único publicará apenas oferta `approved` com post `draft` e canal válido.

**Trade-off/consequência:** exige consistência entre entidades; impede atalhos e permite idempotência/auditoria.

## ADR-007 — Extensão será cliente, não orquestrador

**Decisão:** Extensão apenas captura e envia dados autenticados à entrada oficial.

**Trade-off/consequência:** remove publicação imediata pelo cliente; reduz privilégio, bypass e acoplamento.

## ADR-008 — Inngest será executor delegado

**Decisão:** Inngest executa tarefas idempotentes solicitadas pelas autoridades, sem decidir fluxo.

**Trade-off/consequência:** jobs perdem autonomia; retries e escala permanecem sem governança paralela.

## ADR-009 — Runtimes V4 serão removidos somente após substitutos homologados

**Decisão:** remoção ocorre na Sprint prevista após validação dos substitutos.

**Trade-off/consequência:** coexistência temporária controlada é aceita; remoção prematura e fallback automático são proibidos.

## ADR-010 — Feature flags não poderão definir arquitetura permanente

**Decisão:** flags só podem apoiar transição rastreada e com remoção definida.

**Trade-off/consequência:** menor flexibilidade para alternar autoridades; maior determinismo do runtime oficial.

## ADR-011 — Nenhum componente poderá alterar status diretamente fora do serviço oficial

**Decisão:** toda transição passa por um serviço único com validação, concorrência, idempotência e auditoria.

**Trade-off/consequência:** adiciona dependência e migração de escritores; remove saltos e regras divergentes.

## ADR-012 — Toda Sprint exigirá checkpoint e evidência

**Decisão:** avanço depende de evidência e homologação do checkpoint anterior.

**Trade-off/consequência:** reduz velocidade nominal; aumenta governança, reversibilidade e confiança. Exceção somente por ADR aprovado.
