# Índice documental e hierarquia de autoridade

Atualizado em 31/07/2026. Este índice separa documentação operacional atual, contratos, decisões, auditorias e histórico.

## Hierarquia de autoridade

1. Código executável, migrations e configurações versionadas: `src/`, `scripts/`, `supabase/`, `vercel.json`, `.env.example`.
2. Runtime atual: `CURRENT_SYSTEM_STATUS.md`, `architecture-current.md`, `official.md`.
3. Operação: `api.md`, `ambiente.md`, `configuration.md`, `deployment.md`, `oracle.md`, `scripts.md`, `troubleshooting.md`, `SECURITY.md`, `rollback.md`.
4. Contratos e regras de marketplace: `Contrato_*.md`, `MATRIZ_INTENCOES_MERCADO_LIVRE.md`, `scenario-router-marketplace-contracts.md`, `marketplace-search-quality.md`.
5. Estratégia e futuras capacidades: `RELATORIO_ESTRATEGICO_PUBLICACAO_2026.md`, `ARQUITETURA_TELEGRAM_BOT_ASSISTENTE_COMPRAS.md`.
6. Auditorias, releases e decisões históricas: `PMAV5/`, `RELEASE/`, `certifications/`, `specs/`, `superpowers/`, `archive/`.

Quando houver divergência, prevalecem o código e o manifesto de release validado. Documentos arquivados não definem comportamento de produção.

## Documentos canônicos

| Tema | Documento |
|---|---|
| Estado atual | [CURRENT_SYSTEM_STATUS.md](CURRENT_SYSTEM_STATUS.md) |
| Arquitetura | [architecture-current.md](architecture-current.md) |
| Operação oficial | [official.md](official.md) |
| APIs | [api.md](api.md) |
| Oracle/PM2 | [oracle.md](oracle.md) |
| Deploy | [deployment.md](deployment.md) |
| Copy V2/IA | [llm-layer.md](llm-layer.md) e `src/core/ai/official-ai-service.ts` |
| Marketplaces | [scenario-router-marketplace-contracts.md](scenario-router-marketplace-contracts.md) |
| Vídeos | [VIDEO_WORKER_CURRENT.md](VIDEO_WORKER_CURRENT.md) |
| Assistente Telegram | [ARQUITETURA_TELEGRAM_BOT_ASSISTENTE_COMPRAS.md](ARQUITETURA_TELEGRAM_BOT_ASSISTENTE_COMPRAS.md) |

## Status dos documentos

- **Atual:** descreve runtime e operação presentes no código.
- **Contrato:** regra legal ou de marketplace; deve ter data de validação.
- **Experimental:** capacidade não homologada para o ciclo principal.
- **Histórico:** decisão, plano, auditoria ou release concluído.
- **Arquivado:** não deve ser usado como instrução operacional.

## Regra de manutenção

Toda alteração funcional que mude fluxo, estado, endpoint, scheduler, credencial ou contrato deve atualizar o documento canônico correspondente e registrar a data de validação. Não criar novo relatório quando uma atualização do documento canônico for suficiente.
