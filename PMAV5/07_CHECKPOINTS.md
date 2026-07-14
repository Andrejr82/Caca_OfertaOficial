# Checkpoints Oficiais

## Status permitidos

`PLANNED` · `IN_PROGRESS` · `COMPLETED` · `APPROVED`

Checkpoint NÃO bloqueia execução.
Checkpoint registra progresso.

Checkpoint nunca bloqueia outra Sprint.
Checkpoint representa progresso.
Nunca autorização.

| Checkpoint | Nome | Status | Evidência de promoção |
|---|---|---|---|
| CP-000 | Fundação e Arquitetura Oficial | **IMPLEMENTED** | documentos, commit e verificação de escopo da PMAV5-000 |
| CP-001 | Certificação do Estado Operacional | **COMPLETED** | `AUDITORIAS/PMAV5-001_ESTADO_OPERACIONAL_CERTIFICADO.md`; matriz, grafo e ficha da Sprint |
| CP-002 | Pipeline Compartilhado e Plano Oficial de Migração | **COMPLETED** | `AUDITORIAS/PMAV5-002_PIPELINE_COMPARTILHADO.md`; writers, autoridades, conflitos, grafos e plano M-01–M-10 |
| CP-003 | M-01 — Configuração e Contratos Canônicos | **COMPLETED** | `AUDITORIAS/PMAV5-003_CONFIGURACAO_CANONICA.md`; inventários, sete contratos, ownership, matriz e grafo |
| CP-004 | M-02 — Serviço Oficial de Estados | **COMPLETED** | `AUDITORIAS/PMAV5-004_STATE_SERVICE.md`; núcleo hexagonal, Ports, adapters, CAS, idempotência, auditoria e testes |
| CP-005 | IA Única | NOT_STARTED | IA somente após selected, validada |
| CP-006 | Publicação Única | NOT_STARTED | publicação única e estados consistentes |
| CP-007 | Fluxos Paralelos Adequados | NOT_STARTED | Inngest/Extensão/outros subordinados aos contratos |
| CP-008 | Legado Removido | NOT_STARTED | runtimes/fallbacks legados removidos com evidência |
| CP-009 | Observabilidade Certificada | NOT_STARTED | métricas, logs, alertas e rastreio homologados |
| CP-010 | Homologação End-to-End | NOT_STARTED | fluxo oficial completo homologado |

## CP-000

**Status:** IMPLEMENTED

**Aguardando:** HOMOLOGAÇÃO HUMANA

CP-000 permanece aguardando homologação humana. Esse registro não bloqueia a auditoria PMAV5-001 e não autoriza merge, deploy ou mudança operacional.

## CP-001

**Status:** COMPLETED

**Evidência:** `PMAV5/AUDITORIAS/PMAV5-001_ESTADO_OPERACIONAL_CERTIFICADO.md` e `PMAV5/SPRINTS/PMAV5-001_CERTIFICACAO_ESTADO_OPERACIONAL.md`.

**Escopo:** certificação em modo AUDIT; nenhuma alteração funcional, operacional ou de produção.

## CP-002

**Status:** COMPLETED

**Evidência:** `PMAV5/AUDITORIAS/PMAV5-002_PIPELINE_COMPARTILHADO.md` e `PMAV5/SPRINTS/PMAV5-002_PIPELINE_COMPARTILHADO.md`.

**Escopo:** certificação, em modo `AUDIT`, do Pipeline Compartilhado atual, da Arquitetura Oficial de Migração e do Plano Oficial de Implementação M-01–M-10; nenhuma alteração funcional, operacional ou de produção.

## CP-003

**Status:** COMPLETED

**Evidência:** `PMAV5/AUDITORIAS/PMAV5-003_CONFIGURACAO_CANONICA.md`, `PMAV5/SPRINTS/PMAV5-003_CONFIGURACAO_CANONICA.md` e sete contratos em `PMAV5/CONTRATOS/`.

**Escopo:** implementação normativa M-01, exclusivamente documental; configuração, ambientes, flags, contratos, ownership e dependências canônicos, sem alteração funcional, operacional ou de produção.

## CP-004

**Status:** COMPLETED

**Evidência:** `PMAV5/AUDITORIAS/PMAV5-004_STATE_SERVICE.md`, `PMAV5/SPRINTS/PMAV5-004_STATE_SERVICE.md`, `src/core/state/` e `src/tests/core/state/`.

**Escopo:** implementação da fundação M-02 em Arquitetura Hexagonal, com máquina oficial, CAS, idempotência, auditoria e adapters opt-in; nenhum caller, runtime, marketplace, schema ou comportamento funcional foi alterado.

## CP-CONST.2

**Status:** IMPLEMENTED

**Aguardando:** PENDENTE
