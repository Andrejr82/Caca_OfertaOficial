# Índice documental e hierarquia de autoridade

<!-- docs-status: current -->
<!-- verified-against: 5df6fe73 -->
<!-- verified-on: 2026-09-21 -->

Atualizado em 21/09/2026. Este índice organiza a documentação operacional atual, arquitetura canônica, contratos, auditorias e histórico.

## Hierarquia de autoridade

1. Código executável, migrations, testes e configurações versionadas: `src/`, `scripts/`, `supabase/`, `vercel.json`, `.env.example`.
2. Runtime atual: `CURRENT_SYSTEM_STATUS.md`, `architecture-current.md`, `official.md`.
3. Operação: `configuration.md`, `deployment.md`, `oracle.md`, `oracle-scripts-runbook.md`, `troubleshooting.md`, `SECURITY.md`.
4. Auditorias e consolidações de infraestrutura: `PLANO_CONSOLIDACAO_SRC.md`, `AUDITORIA_E_PLANO_ORACLE_VPS.md`, `AUDITORIA_E_PLANO_VERCEL.md`.
5. Contratos e regras de marketplace: `scenario-router-marketplace-contracts.md`, `marketplace-search-quality.md`.
6. Governança e Inteligência: `DOCUMENTATION_GOVERNANCE.md`, `AI_COMMERCIAL_INTELLIGENCE.md`.
7. Histórico e arquivos: `archive/`.

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
| APIs | [api.md](api.md) |
| Scripts | [scripts.md](scripts.md) |
| Inteligência Comercial IA | [AI_COMMERCIAL_INTELLIGENCE.md](AI_COMMERCIAL_INTELLIGENCE.md) |
| Consolidação de Código | [PLANO_CONSOLIDACAO_SRC.md](PLANO_CONSOLIDACAO_SRC.md) |
| Auditoria VPS Oracle | [AUDITORIA_E_PLANO_ORACLE_VPS.md](AUDITORIA_E_PLANO_ORACLE_VPS.md) |
| Auditoria Vercel | [AUDITORIA_E_PLANO_VERCEL.md](AUDITORIA_E_PLANO_VERCEL.md) |

## Regra de manutenção

O Documentation Audit é seletivo por domínio. Toda alteração funcional deve revisar apenas os documentos correspondentes ao domínio afetado. Alterações Oracle/PM2/scheduler exigem também `oracle.md` e `oracle-scripts-runbook.md`.

Afirmações sobre estado externo da VPS, PM2, flags ou serviços identificam a data da auditoria operacional (21/09/2026, commit canônico `5df6fe73`).
