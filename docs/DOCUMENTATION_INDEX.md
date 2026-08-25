# Índice documental e hierarquia de autoridade

Atualizado em 25/08/2026. Este índice separa documentação operacional atual, contratos, decisões, auditorias e histórico.

## Hierarquia de autoridade

1. Código executável, migrations, testes e configurações versionadas: `src/`, `scripts/`, `supabase/`, `vercel.json`, `.env.example`.
2. Runtime atual: `CURRENT_SYSTEM_STATUS.md`, `architecture-current.md`, `official.md`.
3. Operação: `configuration.md`, `deployment.md`, `oracle.md`, `oracle-scripts-runbook.md`, `troubleshooting.md`, `SECURITY.md`.
4. Contratos e regras de marketplace: `Contrato_*.md`, `MATRIZ_INTENCOES_MERCADO_LIVRE.md`, `scenario-router-marketplace-contracts.md`, `marketplace-search-quality.md`.
5. Estratégia e capacidades futuras.
6. Auditorias, releases e decisões históricas: `PMAV5/`, `RELEASE/`, `certifications/`, `specs/`, `superpowers/`, `archive/`.

Quando houver divergência, prevalecem o código e o runtime validado. Documentos arquivados não definem comportamento de produção.

## Documentos canônicos

| Tema | Documento |
|---|---|
| Estado atual | [CURRENT_SYSTEM_STATUS.md](CURRENT_SYSTEM_STATUS.md) |
| Arquitetura | [architecture-current.md](architecture-current.md) |
| Configuração | [configuration.md](configuration.md) |
| Integrações | [integracoes.md](integracoes.md) |
| Oracle/PM2 | [oracle.md](oracle.md) |
| Runbook Oracle | [oracle-scripts-runbook.md](oracle-scripts-runbook.md) |
| Deploy | [deployment.md](deployment.md) |
| Troubleshooting | [troubleshooting.md](troubleshooting.md) |
| Segurança | [SECURITY.md](SECURITY.md) |
| Governança | [DOCUMENTATION_GOVERNANCE.md](DOCUMENTATION_GOVERNANCE.md) |
| Marketplaces | [scenario-router-marketplace-contracts.md](scenario-router-marketplace-contracts.md) |
| Vídeos | [VIDEO_WORKER_CURRENT.md](VIDEO_WORKER_CURRENT.md) |

## Regra de manutenção

O Documentation Audit é seletivo por domínio. Toda alteração funcional deve revisar apenas os documentos correspondentes ao domínio afetado. Alterações Oracle/PM2/scheduler exigem também `oracle.md` e `oracle-scripts-runbook.md`.

Afirmações sobre estado externo da VPS, PM2, flags ou serviços devem identificar a data da auditoria operacional. A fotografia Oracle usada nesta atualização é de 25/08/2026; o checkout auditado estava em `febe66abb28bd47c738d925befc50ad365c59371`.

Não criar novo relatório quando a atualização do documento canônico for suficiente.
