# Contrato Canônico State Transition — `pmav5.state-transition/v1`

## Finalidade e ownership

Definir a única interface autorizada para transições de ofertas e posts. Este contrato não implementa o State Service nesta Sprint.

| Campo | Definição |
|---|---|
| Owner | Serviço Oficial de Estados futuro |
| Produtores | Ingestion, Curation, AI e Publication Services |
| Consumidores | State Service, Supabase audit/storage e chamador |
| Autoridade | única autoridade de transição |

## Entrada

| Campo | Tipo | Obrigatório | Regra |
|---|---|---:|---|
| `contractVersion` | literal | sim | `pmav5.state-transition/v1` |
| `commandId` | UUID | sim | identidade do comando |
| `idempotencyKey` | string | sim | única por intenção lógica |
| `correlationId` | string | sim | cadeia ponta a ponta |
| `tenantId` | UUID | sim | escopo obrigatório |
| `entityType` | enum | sim | `offer` ou `post` |
| `entityId` | UUID/string | sim | identidade persistente; criação usa id reservado |
| `expectedVersion` | inteiro/null | sim | CAS; null somente em criação |
| `fromState` | enum/null | sim | null somente em criação |
| `toState` | enum | sim | destino permitido pela máquina oficial |
| `actor` | objeto | sim | tipo, id e serviço autenticado |
| `reason` | código + detalhe | sim | motivo auditável, sem segredo |
| `evidenceRefs` | array | sim | Candidate, AI result ou Receipt aplicável |
| `requestedAt` | ISO-8601 UTC | sim | instante do comando |

## Saída

| Resultado | Campos |
|---|---|
| `applied` | entidade, estado anterior/novo, versão nova, `auditId`, `appliedAt` |
| `idempotent_replay` | referência ao resultado original, sem nova transição |
| `rejected` | código `INVALID_TRANSITION`, `VERSION_CONFLICT`, `UNAUTHORIZED_ACTOR`, `INVALID_EVIDENCE`, `TENANT_MISMATCH` ou `DEPENDENCY_UNAVAILABLE` |

## Pré-condições

- ator e tenant autenticados;
- origem/versão coincidem com persistência;
- transição existe em `05_MAQUINA_DE_ESTADOS.md`;
- evidência exigida pelo domínio está completa;
- estados terminais não são reabertos.

## Pós-condições

- estado e auditoria gravados atomicamente;
- versão incrementada uma vez;
- nenhum efeito externo é presumido;
- conflito não sobrescreve estado.

## Idempotência, segurança e evolução

Mesma chave + mesmo payload retorna resultado original; mesma chave + payload diferente é conflito. Escrita direta no banco é violação. Logs nunca contêm tokens/payloads secretos. Implementação e testes de concorrência pertencem à Sprint seguinte.
