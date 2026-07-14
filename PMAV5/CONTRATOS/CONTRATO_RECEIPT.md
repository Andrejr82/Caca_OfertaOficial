# Contrato Canônico Receipt — `pmav5.receipt/v1`

## Finalidade e ownership

Representar evidência técnica imutável de uma tentativa de transporte.

| Campo | Definição |
|---|---|
| Owner do contrato | Next Publication Service |
| Produtores | adapters Telegram/WhatsApp/Instagram, Inngest ou GitHub executor |
| Consumidores | Publication Service e, por ele, State Service/auditoria |
| Autoridade do produtor | somente fato técnico do transporte |

## Entrada/saída do executor

| Campo | Tipo | Obrigatório | Regra |
|---|---|---:|---|
| `contractVersion` | literal | sim | `pmav5.receipt/v1` |
| `receiptId` | UUID/string | sim | identidade do recibo |
| `publicationId`, `idempotencyKey`, `correlationId` | string | sim | iguais ao comando |
| `tenantId`, `offerId`, `postId` | UUID | sim | referências do comando |
| `channel` | enum | sim | canal executado |
| `attempt` | inteiro positivo | sim | tentativa observada |
| `outcome` | enum | sim | `confirmed`, `failed` ou `unknown` |
| `externalId` | string/null | condicional | obrigatório quando `confirmed` |
| `externalUrl` | URL/null | não | sanitizada quando disponível |
| `providerCode` | string/null | não | código técnico sem segredo |
| `error` | objeto/null | condicional | código retryable/sanitizado em falha |
| `sentAt`, `observedAt` | ISO-8601 UTC | sim | timestamps técnicos |
| `evidenceHash` | string | sim | integridade do receipt |

## Pré-condições

- Publication Command válido recebido;
- executor autenticado e autorizado para o canal;
- ids e idempotency key preservados sem transformação.

## Pós-condições

- Receipt devolvido ao Publication Service, nunca aplicado diretamente ao banco;
- `confirmed` permite solicitar estados finais;
- `failed` segue política oficial de retry;
- `unknown` exige reconciliação e proíbe novo envio cego.

## Proibições e idempotência

Receipt não decide `published/posted`, não inclui tokens e não mascara falha como sucesso. Mesma tentativa produz o mesmo fato; receipts posteriores são novos attempts ligados à mesma publicação. Receipt conflitante é incidente auditável.
