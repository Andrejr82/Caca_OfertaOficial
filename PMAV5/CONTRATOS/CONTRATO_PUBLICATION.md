# Contrato Canônico Publication — `pmav5.publication/v1`

## Finalidade e ownership

Comandar uma publicação externa somente após validação de oferta e post.

| Campo | Definição |
|---|---|
| Owner | Next Publication Service |
| Produtor | UI/automação Next autorizada |
| Consumidores | adapter do canal, Inngest ou GitHub como executor delegado |
| Resultado consumido | Receipt Contract |

## Entrada

| Campo | Tipo | Obrigatório | Regra |
|---|---|---:|---|
| `contractVersion` | literal | sim | `pmav5.publication/v1` |
| `publicationId`, `idempotencyKey`, `correlationId` | string | sim | identidade estável por post/canal |
| `tenantId`, `offerId`, `postId` | UUID | sim | mesmo tenant e relacionamento |
| `offerVersion`, `postVersion` | inteiro | sim | versões esperadas |
| `offerState` | literal | sim | `approved` |
| `postState` | literal | sim | `draft` |
| `channel` | enum | sim | canal homologado/configurado |
| `payload` | objeto | sim | conteúdo/mídia/link já persistidos |
| `transportPolicyVersion` | string | sim | timeout/retry técnicos versionados |
| `requestedBy`, `requestedAt` | ator/UTC | sim | comando autorizado |

## Saída

Aceite do executor retorna `accepted`, `executorId` e timestamp; conclusão obrigatoriamente usa `pmav5.receipt/v1`. Aceite de fila não equivale a publicação.

## Pré-condições

- oferta `approved` e post `draft` na versão atual;
- canal configurado e credencial disponível no store correto;
- post pertence à oferta e tenant;
- nenhuma publicação confirmada com a mesma chave.

## Pós-condições

- comando entregue uma vez logicamente ao executor;
- Receipt válido é reconciliado pelo Publication Service;
- somente State Service aplica `post → published` e `offer → posted`;
- erro/timeout não presume sucesso e mantém estados elegíveis para reconciliação.

## Proibições e idempotência

Não cria oferta/post, não auto-seleciona, não aprova e não permite transportes escreverem banco. Retry conserva `publicationId` e `idempotencyKey`. Resultado externo ambíguo vai para reconciliação manual/automática, não para reenvio cego.
