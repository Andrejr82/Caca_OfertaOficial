# PMAV5-ALIGN-001 — Reconciliação Definitiva

## Identificação

- **Modo:** DOCUMENTATION
- **Status:** COMPLETED
- **Branch:** `codex/pmav5-architecture-unification`
- **SHA inicial:** `216fc33f1b31f3862f635682a7e7bc95bb5295d2`
- **Data:** 2026-07-13

## Causa do bloqueio

A PMAV5-005 foi interrompida porque a numeração inicial de Sprints e checkpoints não acompanhou a consolidação posterior do Plano Oficial M-01 a M-10. Dependências, gates de homologação, imutabilidade documental e a ausência do protocolo operacional produziram instruções incompatíveis.

## Documentos conflitantes

- `07_CHECKPOINTS.md`: CP-005 estava associado a IA Única e usava estados anteriores à Governança V1.0.
- `08_DEPENDENCIAS_DAS_SPRINTS.md`: PMAV5-003 estava associado ao Oracle Worker e PMAV5-005 à IA Única, com gate `HOMOLOGATED`.
- `09_DECISOES_ARQUITETURAIS.md`: ADR-012 preservava homologação do checkpoint anterior como gate automático.
- `README.md`, `00_GOVERNANCA.md`, `CONSTITUICAO_PMAV5.md` e `11_CRITERIOS_DE_ACEITE.md`: textos históricos preservavam a sequência ou gates anteriores.
- `13_PROTOCOLO_OPERACIONAL.md`: ausente.

Os trechos históricos fora do escopo autorizado não foram alterados; o ADR-013 os classifica nominalmente como **OBSOLETO — substituído pelo ADR-013**.

## Histórico real certificado

| Entrega | Resultado | SHA final |
|---|---|---|
| PMAV5-000 — Arquitetura Oficial e Fundação | COMPLETED / PASS | histórico versionado anterior |
| PMAV5-CONST — Constituição Oficial | COMPLETED / PASS | histórico versionado anterior |
| PMAV5-GOV-1.0 — Governança consolidada | COMPLETED / PASS | histórico versionado anterior |
| PMAV5-001 — Estado Operacional | COMPLETED | `43976b70a7e10d9e3a0475a14dc948b5bcc622e6` |
| PMAV5-002 — Pipeline Compartilhado e Plano de Migração | COMPLETED | `74a8e1a53775097fb717475ded6523372f6e6f43` |
| PMAV5-003 — M-01 Configuração e Contratos Canônicos | COMPLETED | `e8b08d171411072196e23796443d75fa28132181` |
| PMAV5-004 — M-02 Serviço Oficial de Estados | COMPLETED | `216fc33f1b31f3862f635682a7e7bc95bb5295d2` |

Os commits, artefatos de auditoria/Sprint e resultados de testes registrados foram confirmados por `git log` e `git show --stat`. A referência remota da branch apontava para o SHA inicial antes desta reconciliação.

## Sequência canônica

| Sprint | Entrega |
|---|---|
| PMAV5-000 | Arquitetura Oficial e Fundação |
| PMAV5-001 | Estado Operacional |
| PMAV5-002 | Pipeline Compartilhado e Plano de Migração |
| PMAV5-003 | M-01 Configuração e Contratos Canônicos |
| PMAV5-004 | M-02 Serviço Oficial de Estados |
| PMAV5-005 | M-03 Oracle Worker Discovery-Only |
| PMAV5-006 | M-04 Ingestão e Curadoria |
| PMAV5-007 | M-05 IA e Posts Únicos |
| PMAV5-008 | M-06 Publicação Única |
| PMAV5-009 | M-07 Fluxos Paralelos Subordinados |
| PMAV5-010 | M-08 Legado Arquivado e Removido |
| PMAV5-011 | M-09 Observabilidade e Recuperação |
| PMAV5-012 | M-10 Homologação End-to-End e Cutover |

## ADR-013

O ADR-013 foi criado com status `APPROVED`. Ele torna a sequência executada e versionada a única sequência canônica e classifica numerações, gates e associações conflitantes anteriores como obsoletos.

## Checkpoints finais

- CP-000, CP-CONST e CP-GOV-1.0: `APPROVED`.
- CP-001 a CP-004: `COMPLETED`.
- CP-005 a CP-012: `PLANNED`.
- CP-005 corresponde a M-03 Oracle Worker Discovery-Only.

## Dependências finais

As dependências completas estão em `08_DEPENDENCIAS_DAS_SPRINTS.md`. Para PMAV5-005, PMAV5-003 e PMAV5-004 estão `COMPLETED`; portanto, as dependências estão satisfeitas.

## Protocolo criado

`13_PROTOCOLO_OPERACIONAL.md` foi criado na versão 1.0. O protocolo fixa modos, preflight, bloqueios legítimos, relação entre dependências e checkpoints, encerramento de implementação e proibição de merge/deploy sem instrução explícita.

## Arquivos alterados

- `PMAV5/07_CHECKPOINTS.md`
- `PMAV5/08_DEPENDENCIAS_DAS_SPRINTS.md`
- `PMAV5/09_DECISOES_ARQUITETURAIS.md`
- `PMAV5/10_CHANGELOG.md`
- `PMAV5/12_PROTOCOLO_LLM.md`

## Arquivos criados

- `PMAV5/13_PROTOCOLO_OPERACIONAL.md`
- `PMAV5/SPRINTS/PMAV5-ALIGN-001_RECONCILIACAO.md`

## Escopo e rollback

- **Alteração funcional:** nenhuma.
- **Alteração operacional/produção:** nenhuma.
- **Rollback:** reverter este commit por novo commit documental, preservando o histórico; nenhum runtime, banco, schema ou ambiente precisa ser restaurado.

## Autorização

PMAV5-005 — M-03 Oracle Worker Discovery-Only é a próxima Sprint oficial autorizada. Esta autorização não executa o Worker, não realiza merge e não autoriza deploy.
