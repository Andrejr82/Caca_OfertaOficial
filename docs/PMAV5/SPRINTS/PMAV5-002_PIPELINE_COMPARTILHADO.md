# PMAV5-002 — Pipeline Compartilhado e Plano Oficial de Migração

## Identificação

| Campo | Valor |
|---|---|
| Tipo | Certificação arquitetural |
| Modo | `AUDIT` |
| Data | 2026-07-13 |
| Branch | `codex/pmav5-architecture-unification` |
| SHA inicial | `43976b70a7e10d9e3a0475a14dc948b5bcc622e6` |
| Checkpoint | CP-002 |
| Status | `COMPLETED` |

## Objetivo

Reconstruir o pipeline compartilhado real, certificar autores e consumidores de estado, consolidar a arquitetura final já normativa e produzir o Plano Oficial de Migração sem alteração funcional, operacional ou de produção.

## Escopo executado

- fluxo Discovery → Persistence → Curation → AI → Posts → Publication → estados finais;
- inventário de escritores de `offers.status` e `posts.status`;
- classificação Official, Parallel, Legacy, Orphan, Experimental e Maintenance;
- matrizes de autoridades, writers, consumidores, dependências, conflitos e migração;
- arquitetura atual e final em Mermaid;
- responsabilidades finais de Oracle Worker, Next.js, Supabase, State Service, Inngest, Extensão, Oracle API, Scheduler, Capacity Hunter, PM2, WhatsApp Engine e canais;
- lista de futuras desconexões, substituições, arquivos e remoções;
- plano M-01–M-10 com dependências, riscos, rollback e aceite.

## Fora de escopo

- alteração de código, schema, migration, configuração, secrets, infraestrutura ou runtime;
- execução de scraping, IA, publicação, build, testes funcionais, deploy ou banco;
- desconexão, arquivo ou remoção de componente;
- merge, PR ou alteração de produção.

## Evidência principal

`PMAV5/AUDITORIAS/PMAV5-002_PIPELINE_COMPARTILHADO.md`

## Resultado certificado

O pipeline atual é federado: Oracle Worker, Next.js, Inngest, Extensão e scripts operacionais possuem segmentos sobrepostos e escritores diretos no Supabase. As inconsistências de maior severidade são curadoria implícita durante publicação, entradas diretas em `approved`, IA paralela, finalização não transacional de post/oferta, `posts.processing` fora do contrato, ausência de convergência para `posts.failed`, regressões a `draft`, deleções físicas e filtros multi-tenant incompletos.

A arquitetura final consolidada determina:

1. Oracle Worker como autoridade exclusiva de Discovery, emitindo candidatos `pending_manual_review`.
2. Next.js como autoridade de Curation, AI, Posts e Publication.
3. Serviço Oficial de Estados como única porta para transições, com CAS, idempotência e auditoria.
4. Supabase como persistência protegida, sem decisão de negócio.
5. Scheduler único para Discovery.
6. Inngest, GitHub Actions, WhatsApp Engine e canais como executores/transportes sem escrita direta.
7. Extensão como cliente autenticado de ingestão.
8. Oracle API como gateway e Capacity Hunter como observabilidade read-only.

## Plano Oficial de Implementação

| Ordem | Entrega | Critério terminal |
|---:|---|---|
| M-01 | Configuração e contratos canônicos | uma fonte por configuração e contratos versionados |
| M-02 | Serviço Oficial de Estados | CAS, idempotência, tenant, audit e zero novos direct writers |
| M-03 | Oracle Worker Discovery-only | zero IA/posts/publicação/cleanup de estado no Worker |
| M-04 | Ingestão e Curation Next | toda origem autenticada chega pendente; sem seleção implícita |
| M-05 | IA e Posts únicos | uma IA por oferta/versão; persistência coordenada |
| M-06 | Publication única | receipts idempotentes; finais consistentes; transportes sem DB |
| M-07 | Fluxos paralelos subordinados | zero autoridade residual e zero direct writers |
| M-08 | Legado arquivado/removido | telemetria de ausência de uso e aprovação humana |
| M-09 | Observabilidade certificada | tracing, métricas, alertas, DLQ/replay e runbook |
| M-10 | Homologação E2E e cutover | fluxo completo, falhas e concorrência homologados |

Detalhes de objetivo, escopo, componentes, dependências, impacto, riscos, rollback e aceite estão na evidência principal.

## Artefatos

| Arquivo | Ação |
|---|---|
| `PMAV5/AUDITORIAS/PMAV5-002_PIPELINE_COMPARTILHADO.md` | criado |
| `PMAV5/SPRINTS/PMAV5-002_PIPELINE_COMPARTILHADO.md` | criado |
| `PMAV5/07_CHECKPOINTS.md` | CP-002 promovido a `COMPLETED` |
| `PMAV5/10_CHANGELOG.md` | registro PMAV5-002 adicionado |

## Verificações autorizadas

- leitura estática de documentação e código versionado;
- buscas de escritores/callers;
- inspeção de diff, status e conteúdo dos documentos;
- verificação Git do commit e upstream após push.

Não foram autorizados nem executados build, testes funcionais, runtime, migration, banco, scraping, IA, publicação ou deploy. A ausência de `PMAV5/13_PROTOCOLO_OPERACIONAL.md` e a ativação de runtimes externos permanecem `NOT CERTIFIED`.

## Rollback desta Sprint

Reverter o único commit documental da PMAV5-002. Como não há mudança funcional, de configuração, schema ou runtime, o rollback não exige restauração operacional.

## Encerramento

CP-002 está `COMPLETED` em modo `AUDIT`. Essa promoção registra evidência e não autoriza implementação, merge ou produção. As etapas M-01–M-10 exigem Sprints próprias, validação proporcional ao risco e aprovação humana onde prevista pela governança.
