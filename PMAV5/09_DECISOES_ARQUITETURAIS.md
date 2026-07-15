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

**OBSOLETO — substituído pelo ADR-013:** a homologação do checkpoint anterior como gate automático. Permanece vigente a exigência de checkpoint e evidência como registro de progresso.

## ADR-013 — Sequência Canônica Definitiva das Sprints PMAV5

**Status:** APPROVED

**Contexto:** os documentos iniciais foram criados antes da consolidação do Plano Oficial M-01 a M-10. A execução real seguiu outra numeração, causando divergência entre checkpoints, dependências e prompts.

**Decisão:** a sequência efetivamente executada e versionada passa a ser a única sequência canônica do Programa.

### Sequência oficial

1. PMAV5-000 — Arquitetura Oficial e Fundação
2. PMAV5-001 — Estado Operacional
3. PMAV5-002 — Pipeline Compartilhado e Plano de Migração
4. PMAV5-003 — M-01 Configuração e Contratos Canônicos
5. PMAV5-004 — M-02 Serviço Oficial de Estados
6. PMAV5-005 — M-03 Oracle Worker Discovery-Only
7. PMAV5-006 — M-04 Ingestão e Curadoria
8. PMAV5-007 — M-05 IA e Posts Únicos
9. PMAV5-008 — M-06 Publicação Única
10. PMAV5-009 — M-07 Fluxos Paralelos Subordinados
11. PMAV5-010 — M-08 Legado Arquivado e Removido
12. PMAV5-011 — M-09 Observabilidade e Recuperação
13. PMAV5-012 — M-10 Homologação End-to-End e Cutover

**Consequência:** qualquer numeração anterior conflitante fica classificada como **OBSOLETA**.

Em particular, ficam classificados como **OBSOLETO — substituído pelo ADR-013**:

- a sequência antiga registrada em `README.md` e nas versões anteriores de `08_DEPENDENCIAS_DAS_SPRINTS.md`;
- a associação de PMAV5-003 a Oracle Worker Discovery-Only;
- a associação de PMAV5-005 a IA Única;
- a associação de CP-005 a IA Única;
- a exigência automática de checkpoint anterior `HOMOLOGATED` como gate de Sprint, presente em textos históricos de Governança, Constituição, ADR-012 e critérios iniciais;
- a imutabilidade de checkpoints e protocolos quando impedir esta reconciliação documental formalmente autorizada.

Checkpoints passam a registrar progresso, sem bloquear execução por si só. A autorização decorre das dependências técnicas em `COMPLETED` ou `APPROVED`, conforme `08_DEPENDENCIAS_DAS_SPRINTS.md`, e do protocolo operacional vigente.

**Motivo:** correção documental e alinhamento com o Plano Oficial já certificado.

**Risco e compensações:** a renumeração documental pode divergir de registros históricos preservados. A compensação é manter os textos históricos versionados, classificá-los nominalmente como obsoletos neste ADR e centralizar a sequência vigente nos documentos `07`, `08`, `12` e `13`.

## ADR-014 — Official AI Draft Generation

**Status:** APPROVED — 15/07/2026

**Contexto:** Durante a operação real da Arquitetura Oficial V5, constatou-se que o Oracle Worker Discovery-Only executa corretamente (Discovery → `pending_manual_review`), mas o painel operacional consome exclusivamente registros da tabela `posts` (drafts). Como consequência, as ofertas descobertas permanecem invisíveis ao operador, que não consegue revisar o material preparado para publicação, perdendo produtividade operacional em relação ao fluxo anterior.

**Problema arquitetural:** O Artigo 2, Princípio 6 da Constituição PMAV5 estabelecia que "IA somente poderá consumir: `selected`". Isso criava um paradoxo: drafts só existem após `selected → approved` (via IA), mas a aprovação humana exigia ver o conteúdo antes — tornando o fluxo circular e inoperável.

**Decisão:** A Official AI — que permanece como autoridade única e exclusiva de geração de conteúdo — passa a possuir dois modos internos de operação:

- **Modo 1 — Draft Generation:** consome ofertas em `pending_manual_review`, gera drafts (legenda, texto, imagem, metadados, posts), e retorna sem alterar o estado da oferta.
- **Modo 2 — Approval:** consome ofertas em `selected`, gera conteúdo, persiste posts draft e promove a oferta para `approved`. Comportamento anterior, inalterado.

**Mandatos constitucionais desta ADR:**

1. A Official AI continua sendo a única autoridade responsável pela geração de conteúdo. Não será criada uma segunda IA. Não existirão dois Workers de IA.
2. A Official AI permanece com uma única interface pública (`generateOfficialAI`). Não será criado um segundo endpoint oficial.
3. A geração de drafts (Modo 1) NÃO constitui aprovação da oferta. Gerar um draft não altera o estado da offer.
4. Durante o Modo 1, o estado da offer permanece `pending_manual_review`.
5. Nenhuma publicação poderá ocorrer a partir do Modo 1.
6. Nenhuma offer será promovida automaticamente para `approved` pelo Modo 1.
7. A única autoridade para alterar a offer para `approved` continua sendo a aprovação humana realizada no painel.
8. A Official Publication permanece inalterada. Ela continuará consumindo exclusivamente ofertas `approved`.
9. O adapter Supabase oficial é estendido com novos métodos, não substituído. Autoridade única da camada de persistência preservada.

**Nova máquina de estados (completa):**

```
Discovery → pending_manual_review
                │
                ▼
         Official AI (Modo 1: Draft Generation)
                │
                ├── gera drafts (posts status=draft)
                └── offer permanece pending_manual_review
                                │
                                ▼
                          Painel (aprovação humana)
                                │
                                ▼
                            approved
                                │
                                ▼
                    Official Publication
                                │
                                ▼
                           published
```

**Trade-off/consequência:** A Official AI assume responsabilidade adicional de pré-geração de conteúdo, aumentando sua criticidade. Em contrapartida, o operador passa a visualizar imediatamente o conteúdo preparado no painel, restaurando a produtividade operacional. O Modo 2 (Approval) permanece inalterado e compatível com todos os contratos existentes. A Constituição PMAV5 não é violada — ADRs são o mecanismo constitucional oficial para evolução arquitetural (Artigo 10).

**Evidência de preservação da autoridade única:** Uma única função `generateOfficialAI`, uma única rota `/api/ai/generate`, um único adapter `SupabaseOfficialAIAdapter`, um único serviço `OfficialAIApprovalAdapter`. O modo é selecionado via campo `mode` no comando, internamente ao serviço.
