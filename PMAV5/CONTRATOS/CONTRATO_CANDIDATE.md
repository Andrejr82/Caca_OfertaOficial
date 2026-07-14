# Contrato Canônico Candidate — `pmav5.candidate/v1`

## Finalidade e ownership

Representar o resultado puro de Discovery antes da persistência oficial.

| Campo | Definição |
|---|---|
| Owner | Oracle Worker / domínio Discovery |
| Produtor | Oracle Worker Discovery-only |
| Consumidor | Next Ingestion Service |
| Autoridade de estado | nenhuma; Candidate não é oferta persistida |

## Entrada do produtor

| Campo | Tipo | Obrigatório | Regra |
|---|---|---:|---|
| `contractVersion` | literal | sim | `pmav5.candidate/v1` |
| `candidateId` | UUID/string estável | sim | identidade técnica do candidato |
| `idempotencyKey` | string | sim | estável por tenant, marketplace e item |
| `correlationId` | UUID/string | sim | rastreio do ciclo |
| `tenantId` | UUID | sim | escopo proprietário |
| `marketplace` | enum | sim | marketplace reconhecido |
| `sourceItemId` | string | sim | identidade imutável na origem |
| `sourceUrl` | URL HTTPS | sim | URL sanitizada/canônica |
| `title` | string | sim | normalizado, não vazio |
| `imageUrl` | URL HTTPS | sim | imagem validada |
| `currentPrice` | decimal positivo | sim | moeda BRL no v1 |
| `originalPrice` | decimal/null | não | ≥ preço atual quando informado |
| `category` | objeto | sim | id/nome/origem da categoria oficial |
| `marketplaceMetrics` | objeto | sim | métricas brutas permitidas e tipadas |
| `deterministicScore` | decimal 0–10 | sim | sem contribuição de IA |
| `discoveryEvidence` | objeto | sim | posição, categoria, provider e instante |
| `discoveredAt` | ISO-8601 UTC | sim | instante da descoberta |

Campos de credencial, segredo, copy de IA, canal ou estado são proibidos.

## Saída

O Candidate é entregue ao Contrato de Ingestion. O aceite retorna `candidateId`, `ingestionId`, `correlationId` e `acceptedAt`; rejeição retorna código tipado sem persistir estado parcial.

## Pré-condições

- trigger oficial do Scheduler e configuração canônica válida;
- sanitização, deduplicação, novelty e score determinístico concluídos;
- tenant, marketplace e source item identificados;
- nenhuma IA, criação de posts ou publicação executada.

## Pós-condições

- payload imutável e auditável entregue uma vez logicamente;
- nenhuma oferta ou estado é criado pelo contrato Candidate;
- retry reutiliza a mesma `idempotencyKey`.

## Erros, idempotência e evolução

Payload inválido, versão desconhecida, duplicata conflitante ou evidência ausente falha fechado. Repetição idêntica devolve o primeiro resultado. Mudança incompatível cria `v2`, ADR, migração de consumidores e rollback.
