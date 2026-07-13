# Contrato Canônico Ingestion — `pmav5.ingestion/v1`

## Finalidade e ownership

Transformar Candidate do Worker ou captura autenticada da Extensão em entrada oficial para revisão manual.

| Campo | Definição |
|---|---|
| Owner | Next Ingestion Service |
| Produtores | Oracle Worker e Extensão autenticada |
| Consumidores | State Service futuro e Supabase por seu intermédio |
| Estado de saída | exclusivamente `pending_manual_review` |

## Entrada

| Campo | Tipo | Obrigatório | Regra |
|---|---|---:|---|
| `contractVersion` | literal | sim | `pmav5.ingestion/v1` |
| `ingestionId`, `idempotencyKey`, `correlationId` | string | sim | identidades estáveis |
| `sourceType` | enum | sim | `oracle_candidate` ou `extension_capture` |
| `tenantId` | UUID | sim | resolvido por autenticação, nunca fallback |
| `actor` | objeto | sim | service identity ou usuário autenticado |
| `candidate` | `pmav5.candidate/v1` | condicional | obrigatório para Worker |
| `capture` | objeto | condicional | produto normalizado e origem para Extensão |
| `requestedAt` | ISO-8601 UTC | sim | instante |

`capture` deve conter source URL/item id, marketplace, título, imagem, preço, metadados de origem e evidência de identidade. Credenciais, IA, copy e canais são proibidos.

## Saída

| Resultado | Campos |
|---|---|
| `accepted` | `offerId`, `state=pending_manual_review`, versão, audit id, timestamps |
| `duplicate` | referência à oferta existente, sem nova criação |
| `rejected` | código tipado e erros de validação, sem persistência parcial |

## Pré-condições

- produtor autenticado e autorizado para o tenant;
- contrato Candidate válido ou captura completa;
- sanitização, identidade, novelty/deduplicação e regras de entrada satisfeitas;
- State Service/configuração disponíveis.

## Pós-condições

- exatamente uma oferta oficial em `pending_manual_review` por chave lógica;
- audit trail referencia origem, ator, payload hash e correlation id;
- nenhum post, IA, affiliate publish ou estado posterior é criado.

## Proibições e idempotência

Sem service-role no cliente, fallback de usuário, insert direto, `draft` ou `approved`. Repetição idêntica devolve a oferta original; payload divergente com mesma chave falha fechado. A indisponibilidade de State Service não autoriza persistência alternativa.
