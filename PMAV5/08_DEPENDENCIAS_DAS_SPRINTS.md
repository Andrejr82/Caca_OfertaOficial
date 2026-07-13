# Dependências e Ordem Oficial das Sprints

A ordem é obrigatória e linear. Cada saída depende do checkpoint anterior homologado; exceções exigem ADR aprovado.

| Sprint | Depende de | Bloqueia | Critério de entrada | Critério de saída | Rollback | Checkpoint |
|---|---|---|---|---|---|---|
| PMAV5-000 — Arquitetura Oficial V5 | `origin/main` certificado; auditoria disponível | PMAV5-001 | branch exclusiva limpa; escopo documental | documentos, ADRs, contratos e commit exclusivos verificados | novo commit documental; sem reescrita de história | CP-000 |
| PMAV5-001 — Fechar Incertezas Operacionais | CP-000 HOMOLOGATED | PMAV5-002 | protocolo lido; lacunas NÃO CERTIFICADO enumeradas | cada lacuna provada ou explicitamente encerrada com evidência | preservar evidências; reclassificar por relatório/ADR | CP-001 |
| PMAV5-002 — Configuração Canônica | CP-001 HOMOLOGATED | PMAV5-003 | runtimes e configurações reais certificados | fonte canônica, precedência e consumidores validados | restaurar configuração anterior documentada, sem fallback oculto | CP-002 |
| PMAV5-003 — Oracle Worker Discovery-Only | CP-002 HOMOLOGATED | PMAV5-004 | configuração canônica ativa em ambiente autorizado | Worker só descobre e termina em pending, com evidência | restaurar versão anterior controladamente; impedir execução concorrente | CP-003 |
| PMAV5-004 — Serviço Único de Estados | CP-003 HOMOLOGATED | PMAV5-005 | produtores Discovery conformes | transições oficiais centralizadas, concorrência/auditoria validadas | reverter consumidores e serviço de forma coordenada | CP-004 |
| PMAV5-005 — IA Única | CP-004 HOMOLOGATED | PMAV5-006 | serviço de estados e gate selected validados | um serviço de IA; nenhum bypass; drafts consistentes | desabilitar nova IA e restaurar caminho homologado anterior | CP-005 |
| PMAV5-006 — Publicação Única | CP-005 HOMOLOGATED | PMAV5-007 | approved + post draft produzidos oficialmente | canais usam serviço único; published/posted consistentes | suspender envios e restaurar versão homologada sem duplicar publicação | CP-006 |
| PMAV5-007 — Fluxos Paralelos | CP-006 HOMOLOGATED | PMAV5-008 | autoridades principais únicas | Extensão, Inngest, Actions e demais fluxos delegados ou bloqueados | desabilitar adaptador problemático; manter autoridades oficiais | CP-007 |
| PMAV5-008 — Remoção do Legado | CP-007 HOMOLOGATED | PMAV5-009 | substitutos homologados e inventário de legado fechado | V4, fallbacks e código morto removidos com prova | restaurar somente artefato necessário sob incidente/ADR, nunca fallback automático | CP-008 |
| PMAV5-009 — Observabilidade | CP-008 HOMOLOGATED | PMAV5-010 | arquitetura única sem legado | rastreio E2E, métricas, logs e alertas certificados | restaurar configuração de observabilidade sem afetar estados | CP-009 |
| PMAV5-010 — Homologação End-to-End | CP-009 HOMOLOGATED | encerramento do programa | ambientes, dados de teste, rollback e evidências prontos | fluxo completo e falhas homologados por humanos | executar rollback aprovado do estágio falho e registrar ROLLED_BACK | CP-010 |

## Regra de não repetição

Uma Sprint executada não é reiniciada nem sobrescrita. Correções posteriores recebem novo registro de mudança e, quando afetarem arquitetura, novo ADR. Changelog, SHAs e evidências permanecem históricos.
