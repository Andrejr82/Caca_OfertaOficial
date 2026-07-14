# Dependências e Ordem Oficial das Sprints

Este documento aplica a sequência canônica definitiva aprovada no ADR-013. Dependências em `COMPLETED` ou `APPROVED` autorizam a Sprint seguinte; checkpoints registram progresso e não são gates.

## Fundação e auditorias concluídas

| Sprint | Entrega | Estado |
|---|---|---|
| PMAV5-000 | Arquitetura Oficial e Fundação | COMPLETED / PASS |
| PMAV5-CONST | Constituição Oficial | COMPLETED / PASS |
| PMAV5-GOV-1.0 | Governança consolidada | COMPLETED / PASS |
| PMAV5-001 | Estado Operacional | COMPLETED |
| PMAV5-002 | Pipeline Compartilhado e Plano Oficial de Migração | COMPLETED |

## Entregas M-01 a M-10

### PMAV5-003 — M-01 Configuração e Contratos Canônicos

- Dependência: PMAV5-002 `COMPLETED`.
- Estado: `COMPLETED`.

### PMAV5-004 — M-02 Serviço Oficial de Estados

- Dependência: PMAV5-003 `COMPLETED`.
- Estado: `COMPLETED`.

### PMAV5-005 — M-03 Oracle Worker Discovery-Only

- Dependência: PMAV5-003 `COMPLETED`.
- Dependência: PMAV5-004 `COMPLETED`.
- Estado: autorizada como próxima Sprint de implementação.

### PMAV5-006 — M-04 Ingestão e Curadoria

- Dependência: PMAV5-004 `COMPLETED`.
- Dependência: PMAV5-005 `COMPLETED`.

### PMAV5-007 — M-05 IA e Posts Únicos

- Dependência: PMAV5-004 `COMPLETED`.
- Dependência: PMAV5-006 `COMPLETED`.

### PMAV5-008 — M-06 Publicação Única

- Dependência: PMAV5-004 `COMPLETED`.
- Dependência: PMAV5-007 `COMPLETED`.

### PMAV5-009 — M-07 Fluxos Paralelos Subordinados

- Dependência: PMAV5-005 `COMPLETED`.
- Dependência: PMAV5-006 `COMPLETED`.
- Dependência: PMAV5-007 `COMPLETED`.
- Dependência: PMAV5-008 `COMPLETED`.

### PMAV5-010 — M-08 Legado Arquivado e Removido

- Dependência: PMAV5-009 `COMPLETED`.

### PMAV5-011 — M-09 Observabilidade e Recuperação

- Dependência: PMAV5-004 `COMPLETED`.
- Dependência: PMAV5-008 `COMPLETED`.

### PMAV5-012 — M-10 Homologação End-to-End e Cutover

- Dependências: PMAV5-003 a PMAV5-011 `COMPLETED`.

## Regra de autorização

Uma Sprint de implementação pode iniciar quando suas dependências técnicas estiverem em `COMPLETED` ou `APPROVED`. A autorização decorre deste documento e dos ADRs vigentes. Rollback, escopo e testes proporcionais ao risco continuam obrigatórios para implementação.

## Declarações obsoletas

**OBSOLETO — substituído pelo ADR-013:** PMAV5-003 como Oracle Worker Discovery-Only.

**OBSOLETO — substituído pelo ADR-013:** PMAV5-005 como IA Única.

**OBSOLETO — substituído pelo ADR-013:** dependência automática de checkpoint anterior `HOMOLOGATED` como condição de entrada. Checkpoint não é gate.

## Regra de não repetição

Uma Sprint executada não é reiniciada nem sobrescrita. Correções posteriores recebem novo registro de mudança e, quando afetarem arquitetura, novo ADR. Changelog, SHAs e evidências permanecem históricos.
