# Changelog do PMAV5

## PMAV5-000 — 2026-07-13

- **Branch:** `codex/pmav5-architecture-unification`
- **SHA inicial:** `82f4a05f64800baa297aa8433920fc3295b4bc1b`
- **Arquivos criados:** estrutura documental completa `PMAV5/`, incluindo governança, arquiteturas atual/alvo, autoridades, contratos, máquina de estados, princípios, checkpoints, dependências, ADRs, critérios, protocolo LLM e ficha da Sprint.
- **Alteração funcional:** nenhuma.
- **Alteração operacional/produção:** nenhuma.
- **Verificação autorizada:** inspeção Git e documental; nenhum build, teste funcional, migration, deploy ou chamada de runtime.
- **Resultado:** CP-000 `IMPLEMENTED`.
- **Bloqueio:** CP-001 e PMAV5-001 não podem iniciar até homologação humana de CP-000.

## PMAV5-GOV-1.0 — 2026-07-13

Governança PMAV5 congelada.
- **Versão:** 1.0
- **Estado:** ESTÁVEL

## PMAV5-001 — 2026-07-13

- **Modo:** AUDIT.
- **Branch:** `codex/pmav5-architecture-unification`.
- **SHA inicial:** `c55bee1b7f32774e52f2d68d1d5feaf79f06d17b`.
- **Documentos criados:** `AUDITORIAS/PMAV5-001_ESTADO_OPERACIONAL_CERTIFICADO.md` e `SPRINTS/PMAV5-001_CERTIFICACAO_ESTADO_OPERACIONAL.md`.
- **Documentos atualizados:** `07_CHECKPOINTS.md` e este changelog.
- **Resultado:** CP-001 `COMPLETED`; componentes classificados com evidências, matrizes e grafo operacional.
- **Não certificados:** ativação produtiva de runtimes externos, configuração integral PM2/cron, schema produtivo, flags não observadas e protocolo operacional 13 ausente.
- **Alteração funcional/operacional/produção:** nenhuma.
- **Verificação autorizada:** inspeção Git e documental; nenhum build, teste funcional, migration, deploy ou runtime proibido.

## PMAV5-002 — 2026-07-13

- **Modo:** AUDIT.
- **Branch:** `codex/pmav5-architecture-unification`.
- **SHA inicial:** `43976b70a7e10d9e3a0475a14dc948b5bcc622e6`.
- **Documentos criados:** `AUDITORIAS/PMAV5-002_PIPELINE_COMPARTILHADO.md` e `SPRINTS/PMAV5-002_PIPELINE_COMPARTILHADO.md`.
- **Documentos atualizados:** `07_CHECKPOINTS.md` e este changelog.
- **Resultado:** CP-002 `COMPLETED`; pipeline Discovery → estados finais reconstruído, escritores e orquestradores classificados, arquitetura final consolidada e Plano Oficial de Implementação M-01–M-10 documentado.
- **Conflitos críticos certificados:** autoridades paralelas, escritas diretas, curadoria implícita, bypass para `approved`, finalização não transacional, estado `processing` incompatível e riscos de tenant/concorrência.
- **Não certificados:** ativação produtiva de runtimes externos, schema produtivo e `PMAV5/13_PROTOCOLO_OPERACIONAL.md` ausente.
- **Alteração funcional/operacional/produção:** nenhuma.
- **Verificação autorizada:** inspeção Git, documental e estática; nenhum build, teste funcional, migration, deploy, scraping, IA, publicação ou runtime proibido.
