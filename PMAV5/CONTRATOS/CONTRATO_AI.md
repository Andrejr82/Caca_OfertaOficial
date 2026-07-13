# Contrato Canônico AI — `pmav5.ai/v1`

## Finalidade e ownership

Gerar resultado de IA e propostas de posts somente para oferta selecionada.

| Campo | Definição |
|---|---|
| Owner | Next AI Service |
| Produtor da requisição | Next Curation/AI coordinator |
| Consumidores | Next Posts Service e State Service |
| Provider | dependência técnica; nunca Owner |

## Entrada

| Campo | Tipo | Obrigatório | Regra |
|---|---|---:|---|
| `contractVersion` | literal | sim | `pmav5.ai/v1` |
| `requestId`, `idempotencyKey`, `correlationId` | string | sim | identidades estáveis |
| `tenantId`, `offerId` | UUID | sim | oferta do tenant |
| `offerVersion` | inteiro | sim | versão esperada |
| `offerState` | literal | sim | exclusivamente `selected` |
| `productSnapshot` | objeto | sim | título, preço, URL, imagem, marketplace, métricas |
| `promptVersion` | string | sim | prompt homologado |
| `modelPolicyVersion` | string | sim | política canônica de provider/modelo |
| `requestedBy` | ator | sim | usuário/serviço autenticado |
| `requestedAt` | ISO-8601 UTC | sim | instante |

## Saída

| Campo | Regra |
|---|---|
| `aiResultId` | identidade imutável |
| `decision` | `approved` ou `rejected_by_quality`; não aplica estado sozinho |
| `score` | escala/versionamento explícitos |
| `rationale` | justificativa sanitizada |
| `postDrafts` | zero ou um draft válido por canal requerido, conforme decisão |
| `providerEvidence` | provider/modelo/latência/tokens, sem segredo |
| `completedAt` | UTC |

## Pré-condições

- oferta existe em `selected` na versão informada;
- identidade, tenant e idempotency key válidos;
- provider/model policy e prompt version disponíveis;
- nenhum resultado anterior conflitante para a mesma chave.

## Pós-condições

- sucesso completo fornece resultado e drafts coerentes ao Posts Service;
- State Service pode aplicar `selected → approved` somente com evidência válida;
- erro mantém `selected`; saída parcial não é publicável nem persistida como aprovada.

## Proibições e idempotência

Não aceita `draft`, `pending_manual_review`, `approved`, `posted` ou `rejected`; não descobre, publica ou escreve status. Retry reutiliza o resultado original. Fallback de provider é política técnica versionada, nunca mudança de owner ou fluxo.
