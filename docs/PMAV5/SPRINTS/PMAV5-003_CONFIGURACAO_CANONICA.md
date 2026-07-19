# PMAV5-003 — M-01 Configuração e Contratos Canônicos

## Identificação

| Campo | Valor |
|---|---|
| Modo | `IMPLEMENTATION` |
| Implementação | M-01 |
| Checkpoint | CP-003 |
| Status | `COMPLETED` |
| Data | 2026-07-13 |
| Branch | `codex/pmav5-architecture-unification` |
| SHA inicial | `74a8e1a53775097fb717475ded6523372f6e6f43` |

## Objetivo

Eliminar ambiguidades normativas de configuração e estabelecer definições únicas e versionadas para ambientes, feature flags, contratos, ownership e dependências, sem alterar qualquer consumidor ou runtime.

## Escopo implementado

- inventário de `.env*`, templates, stores Vercel/Oracle/GitHub/Inngest, PM2 e Capacity Hunter;
- precedência canônica entre definição, template, store e processo;
- catálogo de variáveis sem valores secretos;
- classificação individual das feature flags com owner, consumidor, objetivo e prazo;
- contratos Candidate, State, AI, Posts, Publication, Receipt e Ingestion;
- ownership único por domínio;
- matriz e grafo Mermaid de dependências.

## Fora de escopo

- código funcional ou refatoração de consumidores;
- Oracle Worker/API, State Service, IA, Publication, Discovery, Curation, Scheduler ou PM2;
- `.env`, secrets ou valores reais;
- banco, schema, migration, deploy, restart ou execução de serviço.

## Decisões canônicas

1. `PMAV5/AUDITORIAS/PMAV5-003_CONFIGURACAO_CANONICA.md` é o registro normativo de definição.
2. `.env.example` e templates de componente são derivados e não contêm segredos.
3. `.env.local`, Vercel, Oracle, GitHub e Inngest são stores de valores por ambiente.
4. PM2 herda configuração; não define negócio.
5. Aliases e seletores arquiteturais são legados/temporários e possuem prazo de remoção.
6. Cada contrato possui owner único e envelope comum de versão, correlação, idempotência, tenant e auditoria.

## Artefatos criados

| Artefato | Conteúdo |
|---|---|
| `AUDITORIAS/PMAV5-003_CONFIGURACAO_CANONICA.md` | inventários, fonte canônica, flags, ownership, dependências e validação |
| `CONTRATOS/CONTRATO_CANDIDATE.md` | saída normalizada de Discovery |
| `CONTRATOS/CONTRATO_STATE.md` | comando único de transição futura |
| `CONTRATOS/CONTRATO_AI.md` | IA somente sobre `selected` |
| `CONTRATOS/CONTRATO_POSTS.md` | criação/versionamento de drafts |
| `CONTRATOS/CONTRATO_PUBLICATION.md` | comando oficial de publicação |
| `CONTRATOS/CONTRATO_RECEIPT.md` | evidência técnica dos transportes |
| `CONTRATOS/CONTRATO_INGESTION.md` | entrada Worker/Extensão para pending |

## Critérios de aceite

| Critério | Resultado esperado |
|---|---|
| uma configuração normativa | registro e precedência únicos |
| inventário sem segredo | somente nomes, owners e stores |
| flags governadas | todas classificadas com prazo |
| contratos não duplicados | sete arquivos, sete owners explícitos |
| ownership | um Owner por domínio |
| dependências | matriz e grafo consistentes |
| escopo | somente `PMAV5/` alterado |
| runtime | nenhuma execução ou mudança |

## Validação autorizada

Somente leitura estática, busca de nomes/referências, inspeção Markdown, `git diff --check`, diff staged, status e sincronismo Git. Build e testes funcionais não são necessários nem autorizados porque nenhum código executável foi alterado.

## Rollback

Reverter o commit documental por novo commit. Não há restauração de runtime, configuração real, banco ou serviço.

## Encerramento

CP-003 registra `COMPLETED` para M-01. A conclusão não implementa o State Service; apenas fornece seu contrato de entrada para a Sprint seguinte. Nenhuma ativação de produção é autorizada.
