# Checkpoints Oficiais

## Regra canônica

Checkpoint registra progresso. Checkpoint não bloqueia execução por si só.

A autorização de uma Sprint de implementação decorre das dependências técnicas registradas no ADR-013 e em `08_DEPENDENCIAS_DAS_SPRINTS.md`. Checkpoint não é gate e não substitui a verificação das dependências.

## Estados oficiais

`PLANNED` · `IN_PROGRESS` · `COMPLETED` · `APPROVED`

| Checkpoint | Entrega | Status | Evidência ou condição |
|---|---|---|---|
| CP-000 | Arquitetura Oficial e Fundação | **APPROVED** | PMAV5-000 concluída e versionada |
| CP-CONST | Constituição | **APPROVED** | PMAV5-CONST concluída e versionada |
| CP-GOV-1.0 | Governança V1.0 | **APPROVED** | PMAV5-GOV-1.0 concluída e versionada |
| CP-001 | Estado Operacional | **COMPLETED** | `AUDITORIAS/PMAV5-001_ESTADO_OPERACIONAL_CERTIFICADO.md` |
| CP-002 | Pipeline Compartilhado | **COMPLETED** | `AUDITORIAS/PMAV5-002_PIPELINE_COMPARTILHADO.md` |
| CP-003 | M-01 Configuração e Contratos | **COMPLETED** | `AUDITORIAS/PMAV5-003_CONFIGURACAO_CANONICA.md` |
| CP-004 | M-02 Serviço Oficial de Estados | **COMPLETED** | `AUDITORIAS/PMAV5-004_STATE_SERVICE.md` |
| CP-005 | M-03 Oracle Worker Discovery-Only | **COMPLETED** | `AUDITORIAS/PMAV5-005_ORACLE_WORKER_DISCOVERY_ONLY.md` |
| CP-006 | M-04 Ingestão e Curadoria | **COMPLETED** | `AUDITORIAS/PMAV5-006_CURADORIA_INGESTAO_OFICIAL.md` |
| CP-007 | M-05 Serviço Oficial de IA e Posts | **COMPLETED** | `AUDITORIAS/PMAV5-007_SERVICO_OFICIAL_IA.md` |
| CP-008 | M-06 Serviço Oficial de Publicação | **COMPLETED** | `AUDITORIAS/PMAV5-008_SERVICO_OFICIAL_PUBLICACAO.md` |
| CP-009 | M-07 Fluxos Paralelos | **PLANNED** | dependências definidas em `08_DEPENDENCIAS_DAS_SPRINTS.md` |
| CP-010 | M-08 Legado | **PLANNED** | dependências definidas em `08_DEPENDENCIAS_DAS_SPRINTS.md` |
| CP-011 | M-09 Observabilidade | **PLANNED** | dependências definidas em `08_DEPENDENCIAS_DAS_SPRINTS.md` |
| CP-012 | M-10 E2E e Cutover | **PLANNED** | dependências definidas em `08_DEPENDENCIAS_DAS_SPRINTS.md` |

## Progresso certificado

- CP-001 registra a auditoria do Estado Operacional, sem alteração funcional, operacional ou de produção.
- CP-002 registra a auditoria do Pipeline Compartilhado e o Plano Oficial de Migração M-01 a M-10.
- CP-003 registra a conclusão de M-01, Configuração e Contratos Canônicos.
- CP-004 registra a conclusão de M-02, Serviço Oficial de Estados.
- CP-005 registra o Oracle Worker Discovery-Only, com Shopee, Mercado Livre e Amazon encerrando em `pending_manual_review`.
- CP-006 registra Curadoria, Aprovação, Rejeição e Publicação do runtime oficial exclusivamente pelo State Service, com CAS, idempotência e AuditPort.
- CP-007 registra o Official AI Service como única autoridade oficial de geração e criação de posts draft, exclusivamente após `selected` e com aprovação pelo State Service.
- CP-008 registra o Official Publication Service como única autoridade das quatro rotas oficiais, com receipts anteriores às transições, transportes puros, idempotência, concorrência e reconciliação sem reenvio.

## Regras obsoletas

**OBSOLETO — substituído pelo ADR-013:** exigir `HOMOLOGATED` em CP-004 para iniciar PMAV5-005.

**OBSOLETO — substituído pelo ADR-013:** declarar checkpoints imutáveis ou transformá-los em bloqueio automático de auditorias ou implementações.

**OBSOLETO — substituído pelo ADR-013:** associar CP-005 a IA Única. CP-005 corresponde exclusivamente a M-03 Oracle Worker Discovery-Only.
