# PMAV5-004 — Auditoria do Serviço Oficial de Estados

## 1. Identificação

| Campo | Valor |
|---|---|
| Modo | `IMPLEMENTATION` |
| Implementação | M-02 — Serviço Oficial de Estados |
| Checkpoint | CP-004 |
| Status | `COMPLETED` |
| Data | 2026-07-13 |
| Branch | `codex/pmav5-architecture-unification` |
| SHA inicial | `e8b08d171411072196e23796443d75fa28132181` |
| Natureza | fundação arquitetural desacoplada e não conectada a callers |

## 2. Veredito executivo

O State Service foi implementado em `src/core/state/` como núcleo command-oriented em Arquitetura Hexagonal. A implementação conhece somente contratos de domínio e cinco Ports injetadas. Não importa Supabase, Next.js, Oracle, Inngest ou qualquer mecanismo concreto de persistência, relógio ou UUID.

Nenhum caller foi migrado. Os adapters são opt-in, não possuem inicialização automática e não alteram o comportamento atual do sistema.

## 3. Arquitetura

```text
transitionOfferState / transitionPostState
                  │
                  ▼
      validação State v1 + máquina oficial
                  │
                  ▼
       idempotência → leitura → CAS
                  │
                  ▼
           auditoria estruturada
                  │
                  ▼
 Repository | Audit | Clock | UUID | Idempotency Ports
                  │
                  ▼
 Memory | Compatibility | Future Supabase adapters (opt-in)
```

### 3.1 Superfície pública de runtime

- `transitionOfferState()`;
- `transitionPostState()`;
- `validateTransition()`;
- `assertExpectedState()`.

O barrel público exporta somente essas quatro funções de runtime e os tipos/Ports necessários para composição. Coordenação interna, fingerprint e registro de auditoria não são expostos.

## 4. Máquina Oficial implementada

| Entidade | Origem | Destino |
|---|---|---|
| offer | `pending_manual_review` | `selected` |
| offer | `selected` | `approved` |
| offer | `approved` | `posted` |
| offer | `pending_manual_review` | `rejected` |
| offer | `selected` | `rejected` |
| offer | `approved` | `rejected` |
| post | `draft` | `published` |

`failed`, `deleted`, `retry`, `cancelled`, `processing` e qualquer outro estado não fazem parte dos tipos nem da matriz implementada.

## 5. Ports

| Port | Responsabilidade |
|---|---|
| `StateRepositoryPort` | leitura tenant-aware e `compareAndSet` por estado/versão |
| `AuditPort` | destino substituível dos registros estruturados |
| `ClockPort` | timestamp UTC injetado |
| `UUIDPort` | identidade de auditoria injetada |
| `IdempotencyPort` | reserva, replay, conflito e conclusão de comandos |

O núcleo não usa `Date.now()`, `new Date()`, `randomUUID()`, variáveis de ambiente ou clientes de infraestrutura.

## 6. Adapters

| Adapter | Uso |
|---|---|
| `MemoryStateAdapter` | CAS atômico simulado, auditoria e idempotência para testes/migração controlada |
| `CompatibilityStateAdapter` | delegação explícita para callbacks legados futuros |
| `FutureSupabaseStateAdapter` | fronteira tipada para gateway Supabase futuro, sem importar Supabase |

Nenhum adapter é instanciado por módulo, rota, runtime ou caller existente.

## 7. Fluxo CAS

1. validação estrutural do comando State v1;
2. reserva/verificação da chave idempotente;
3. leitura tenant-aware da entidade;
4. comparação do estado atual com `fromState`;
5. comparação da versão atual com `expectedVersion`;
6. validação da transição na máquina oficial;
7. `compareAndSet` único com estado e versão esperados;
8. resultado tipado e auditoria.

Divergência antes do CAS impede a tentativa de escrita. Divergência detectada no CAS retorna conflito e não altera o registro.

## 8. Idempotência

O fingerprint determinístico cobre todo o comando, incluindo Command ID, Correlation ID, Causation ID, tenant, ator, origem, motivo, evidências e intenção de estado. Mesma chave e mesmo payload retornam a mesma instância do resultado original sem novo CAS. Mesma chave e payload diferente retornam `IDEMPOTENCY_CONFLICT`. Comando idêntico concorrente aguarda o resultado em andamento.

## 9. Auditoria estruturada

Cada tentativa registra pela `AuditPort`: `timestamp`, `actor`, `origin`, `reason`, `entity`, `entityId`, `previousState`, `newState`, `commandId`, `correlationId`, `causationId` e `result`, além de `auditId` e `errorCode` quando aplicável. Sucesso, rejeição e replay possuem testes próprios. Nenhum sink definitivo ou schema foi criado.

## 10. Evidências de teste

| Verificação | Resultado |
|---|---|
| TDD da máquina e validação | 17 testes aprovados |
| State Service, contratos, CAS, idempotência, auditoria e concorrência | 16 testes aprovados |
| Adapters | 4 testes aprovados |
| Suíte direcionada | 37/37 aprovados |
| Suíte completa Vitest | 122 aprovados, 2 ignorados, 0 falhas |
| Cobertura V8 direcionada | 89,31% statements; 81,98% branches; 84,84% functions; 90,4% lines |
| ESLint de `src/core/state` e testes | PASS |
| TypeScript strict de `src/core/state` | PASS |
| `git diff --check` | PASS |

O typecheck global expõe erros preexistentes em scripts legados, páginas de learning/optimization/publish, automation e logs. Nenhum erro global remanescente aponta para `src/core/state` ou seus testes; arquivos externos não foram corrigidos por estarem expressamente fora do escopo.

O `next build` compilou o bundle com sucesso e parou no prerender preexistente de `/history`, que acessa Supabase Admin ausente na worktree. A limitação ambiental/legada não referencia a fundação implementada e não foi contornada com configuração fora do escopo.

## 11. Certificação de escopo

- nenhum caller, rota ou componente existente foi migrado;
- nenhum marketplace, Discovery, IA, Publicação ou Curadoria foi alterado;
- nenhum Oracle Worker/API, Scheduler, PM2, Inngest, GitHub Actions, Vercel ou Capacity Hunter foi alterado;
- nenhuma feature flag, configuração, schema, migration, banco ou deploy foi alterado;
- nenhum comportamento funcional atual foi ativado ou modificado.

## 12. Rollback

Reverter o commit da PMAV5-004 por novo commit. Como não há caller conectado, schema, migration ou configuração nova, o rollback não exige restauração de dados, runtime ou ambiente.

## 13. Conclusão

CP-004 está `COMPLETED`. A fundação do State Service está pronta para migração gradual em Sprints futuras, preservando integralmente os fluxos atuais.
