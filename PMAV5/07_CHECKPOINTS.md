# Checkpoints Oficiais

## Status permitidos

`NOT_STARTED` · `IN_PROGRESS` · `BLOCKED` · `IMPLEMENTED` · `VALIDATED` · `HOMOLOGATED` · `ROLLED_BACK`

Nenhuma Sprint pode iniciar se o checkpoint anterior não estiver `HOMOLOGATED`. Exceção somente mediante ADR aprovado antes da execução. Apenas revisão humana explícita concede homologação.

| Checkpoint | Nome | Status | Evidência de promoção |
|---|---|---|---|
| CP-000 | Fundação e Arquitetura Oficial | **IMPLEMENTED** | documentos, commit e verificação de escopo da PMAV5-000 |
| CP-001 | Incertezas Operacionais Encerradas | NOT_STARTED | inventário operacional homologado |
| CP-002 | Configuração Canônica | NOT_STARTED | fonte/configuração canônica homologada |
| CP-003 | Oracle Worker Discovery-Only | NOT_STARTED | Worker sem IA/publicação/legado, validado |
| CP-004 | Serviço Único de Estados | NOT_STARTED | todas as transições via serviço validado |
| CP-005 | IA Única | NOT_STARTED | IA somente após selected, validada |
| CP-006 | Publicação Única | NOT_STARTED | publicação única e estados consistentes |
| CP-007 | Fluxos Paralelos Adequados | NOT_STARTED | Inngest/Extensão/outros subordinados aos contratos |
| CP-008 | Legado Removido | NOT_STARTED | runtimes/fallbacks legados removidos com evidência |
| CP-009 | Observabilidade Certificada | NOT_STARTED | métricas, logs, alertas e rastreio homologados |
| CP-010 | Homologação End-to-End | NOT_STARTED | fluxo oficial completo homologado |

## CP-000

**Status:** IMPLEMENTED

**Aguardando:** HOMOLOGAÇÃO HUMANA

CP-001 permanece bloqueado até CP-000 receber `HOMOLOGATED`. Esta marcação não autoriza PMAV5-001, merge, deploy ou mudança operacional.
