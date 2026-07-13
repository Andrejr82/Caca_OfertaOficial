# Contrato Canônico Posts — `pmav5.posts/v1`

## Finalidade e ownership

Criar e versionar posts oficiais a partir de resultado AI válido, sem publicar.

| Campo | Definição |
|---|---|
| Owner | Next Posts Service |
| Produtores | Next AI Service; Curation apenas para edição autorizada futura |
| Consumidores | Next Publication Service, UI e State Service |

## Entrada

| Campo | Tipo | Obrigatório | Regra |
|---|---|---:|---|
| `contractVersion` | literal | sim | `pmav5.posts/v1` |
| `commandId`, `idempotencyKey`, `correlationId` | string | sim | rastreio/idempotência |
| `tenantId`, `offerId`, `aiResultId` | UUID/string | sim | referências válidas |
| `offerVersion` | inteiro | sim | versão selecionada/validada |
| `drafts` | array | sim | um item por canal, sem duplicata |
| `drafts[].channel` | enum | sim | `telegram`, `whatsapp`, `instagram` ou canal homologado |
| `drafts[].content` | string | sim | não vazio, sanitizado e dentro do limite do canal |
| `drafts[].media` | objeto/null | não | URL e tipo válidos |
| `drafts[].affiliateLinkRef` | string | sim | referência oficial, nunca segredo |
| `requestedAt` | ISO-8601 UTC | sim | instante |

## Saída

Lista de `postId`, `channel`, `version`, `state=draft`, hash de conteúdo e `createdAt`; replay retorna os mesmos identificadores.

## Pré-condições

- AI Result completo, aprovado e do mesmo tenant/oferta/versão;
- oferta elegível conforme State Contract;
- canal e conteúdo válidos;
- chave não usada com payload divergente.

## Pós-condições

- posts `draft` persistidos de forma coordenada com a aprovação da oferta;
- exatamente um draft ativo por oferta/versão/canal;
- drafts antigos são retidos/auditados ou marcados por transição oficial, nunca apagados fisicamente.

## Proibições e erros

Posts Service não publica, não promove oferta e não cria `published`. `processing` não é estado de negócio no v1. Falha parcial não entrega conjunto publicável. Versão/tenant/AI mismatch falham fechados.
