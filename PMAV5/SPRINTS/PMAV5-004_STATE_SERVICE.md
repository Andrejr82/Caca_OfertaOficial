# PMAV5-004 — Serviço Oficial de Estados

## Identificação

| Campo | Valor |
|---|---|
| Modo | `IMPLEMENTATION` |
| Implementação | M-02 |
| Checkpoint | CP-004 |
| Status | `COMPLETED` |
| Data | 2026-07-13 |
| Branch | `codex/pmav5-architecture-unification` |
| SHA inicial | `e8b08d171411072196e23796443d75fa28132181` |

> **Plano de implementação:** executar inline, tarefa por tarefa, com TDD e verificação completa antes do commit único exigido pelo checkpoint.

**Objetivo:** implementar a fundação do Serviço Oficial de Estados como autoridade futura e única de transições de `offers.status` e `posts.status`, sem migrar callers nem alterar comportamento funcional.

**Arquitetura:** núcleo command-oriented em Arquitetura Hexagonal. O State Service depende somente de Ports injetadas para persistência CAS, auditoria, relógio, UUID e idempotência; adapters concretos permanecem opt-in e não são conectados a runtimes nesta Sprint.

**Stack:** TypeScript 5.9, Vitest 4, strict mode, dependency injection.

## Restrições globais

- A máquina normativa é exclusivamente `PMAV5/05_MAQUINA_DE_ESTADOS.md`.
- Offers permitem apenas `pending_manual_review → selected`, `selected → approved`, `approved → posted` e rejeição a partir dos três estados não terminais.
- Posts permitem apenas `draft → published`; `failed`, `deleted`, `retry`, `cancelled` e `processing` são proibidos.
- O núcleo não depende de Supabase, Next.js, Oracle, Inngest, PM2, Scheduler, Vercel, GitHub Actions, feature flags ou persistência concreta.
- O núcleo não usa `Date.now()`, `new Date()` nem gera UUID diretamente.
- Nenhum adapter é instalado automaticamente e nenhum caller existente é alterado.
- Nenhum schema, migration, configuração, runtime, marketplace, IA ou publicação é alterado.

## Estrutura de arquivos

- `src/core/state/types.ts`: State v1, comandos, entidades, auditoria e resultados.
- `src/core/state/errors.ts`: códigos e erro tipado do domínio.
- `src/core/state/state-machine.ts`: estados e matriz oficial, `validateTransition()`.
- `src/core/state/validation.ts`: validação de comandos e `assertExpectedState()`.
- `src/core/state/ports/*.ts`: contratos de repository, audit, clock, UUID e idempotência.
- `src/core/state/state-service.ts`: coordenação de idempotência, leitura, CAS e auditoria.
- `src/core/state/index.ts`: única superfície pública, limitada às quatro operações exigidas e tipos necessários.
- `src/core/state/adapters/memory-state-adapter.ts`: adapter em memória concorrente para repository, audit e idempotência.
- `src/core/state/adapters/compatibility-adapter.ts`: ponte opt-in para callbacks legados.
- `src/core/state/adapters/future-supabase-adapter.ts`: contrato/fábrica opt-in sem import ou inicialização do Supabase.
- `src/tests/core/state/*.test.ts`: testes unitários por comportamento.

---

### Tarefa 1: Contratos, máquina oficial e validação

**Produz:**

```ts
validateTransition(entityType: "offer" | "post", fromState: State, toState: State): boolean
assertExpectedState(entity: StateEntity, expectedState: State, expectedVersion: number): void
```

- [ ] Escrever testes que aceitem exatamente as seis transições de offer e `draft → published`.
- [ ] Executar `npx vitest run src/tests/core/state/state-machine.test.ts` e confirmar falha pela ausência da implementação.
- [ ] Implementar tipos literais, matriz oficial, erros e validadores mínimos.
- [ ] Reexecutar o teste direcionado e confirmar aprovação.
- [ ] Acrescentar testes de transição inválida, estado incorreto, versão incorreta, entidade inexistente e comando inválido; observar RED antes de cada implementação.

### Tarefa 2: Ports e State Service com CAS

**Consome:** tipos, erros e validadores da Tarefa 1.

**Produz:**

```ts
interface StateRepositoryPort {
  findById(entityType: EntityType, entityId: string, tenantId: string): Promise<StateEntity | null>;
  compareAndSet(input: CompareAndSetInput): Promise<CompareAndSetResult>;
}

transitionOfferState(command: OfferTransitionCommand): Promise<StateTransitionResult>
transitionPostState(command: PostTransitionCommand): Promise<StateTransitionResult>
```

- [ ] Escrever teste de CAS bem-sucedido e observar RED.
- [ ] Criar as cinco Ports e o State Service com dependências injetadas.
- [ ] Implementar leitura, validação de estado/versão e uma única chamada `compareAndSet`.
- [ ] Confirmar GREEN no teste direcionado.
- [ ] Escrever e executar em RED testes de conflito de estado, conflito de versão e entidade inexistente.
- [ ] Implementar resultados rejeitados fail-closed sem mutação e confirmar GREEN.

### Tarefa 3: Idempotência e auditoria estruturada

**Produz:** replay byte-for-byte do resultado armazenado, conflito de payload e um audit record por tentativa.

- [ ] Escrever teste de replay idempotente e observar RED.
- [ ] Calcular fingerprint determinístico do payload sem infraestrutura e consultar/reservar a chave pela `IdempotencyPort`.
- [ ] Persistir o resultado original e confirmar que replay não executa novo CAS.
- [ ] Escrever teste de mesma chave com payload diferente, observar RED e implementar `IDEMPOTENCY_CONFLICT`.
- [ ] Escrever testes de auditoria em sucesso e erro usando `ClockPort` e `UUIDPort`, observar RED.
- [ ] Implementar `AuditRecord` com timestamp, actor, origin, reason, entity, entityId, previousState, newState, commandId, correlationId, causationId e result.
- [ ] Confirmar que cada tentativa nova gera auditoria pela Port e replay devolve exatamente o resultado original.

### Tarefa 4: Adapters opt-in e concorrência simulada

**Produz:** adapter em memória atômico, adapter de compatibilidade por callbacks e esqueleto tipado para futura persistência Supabase.

- [ ] Escrever teste com dois writers usando a mesma versão e observar RED.
- [ ] Implementar serialização atômica no adapter em memória: um writer aplica e o outro recebe conflito.
- [ ] Confirmar que a entidade termina com versão incrementada uma única vez.
- [ ] Escrever testes mínimos dos adapters de compatibilidade e futuro Supabase, observar RED.
- [ ] Implementar ambos como composição explícita, sem imports de infraestrutura, side effects ou uso automático.

### Tarefa 5: API pública, documentação e certificação

- [ ] Criar `src/core/state/index.ts` expondo apenas `transitionOfferState()`, `transitionPostState()`, `validateTransition()` e `assertExpectedState()`, além dos tipos públicos necessários.
- [ ] Criar `PMAV5/AUDITORIAS/PMAV5-004_STATE_SERVICE.md` com arquitetura, ports, adapters, fluxo, CAS, idempotência, auditoria e evidências.
- [ ] Atualizar `PMAV5/07_CHECKPOINTS.md` com CP-004 `COMPLETED` e `PMAV5/10_CHANGELOG.md`.
- [ ] Executar cobertura direcionada: `npx vitest run --coverage src/tests/core/state`.
- [ ] Executar verificação completa: `npm run lint`, `npm run typecheck`, `npm test` e `npm run build`.
- [ ] Auditar o diff para confirmar que nenhum caller, runtime, rota, marketplace, feature flag, configuração, IA, publicação, Scheduler ou Oracle foi alterado.
- [ ] Criar o único commit `feat(pmav5): implement official state service foundation` e fazer push somente para `origin/codex/pmav5-architecture-unification`.

## Critério de conclusão

O checkpoint só pode ser marcado `COMPLETED` após todos os testes e verificações aplicáveis passarem, o diff permanecer estritamente dentro da fundação `src/core/state`, seus testes e documentação PMAV5, e o push da branch exigida ser confirmado.

## Resultado da execução

| Critério | Evidência | Resultado |
|---|---|---|
| Arquitetura Hexagonal | núcleo depende somente das cinco Ports injetadas | PASS |
| Máquina oficial | seis transições de offers e `draft → published` | PASS |
| CAS | estado e versão esperados validados; escrita condicional única | PASS |
| Idempotência | replay exato, conflito de payload e espera de comando concorrente | PASS |
| Auditoria | objeto estruturado em sucesso, erro e replay | PASS |
| Clock e UUID | Ports injetadas; nenhuma geração concreta no núcleo | PASS |
| Adapters | memória, compatibilidade e futura ponte Supabase opt-in | PASS |
| Testes direcionados | 37 aprovados | PASS |
| Suíte completa | 122 aprovados e 2 ignorados | PASS |
| Cobertura do núcleo | 89,31% statements; 90,4% linhas | PASS |
| TypeScript do núcleo | compilação strict isolada sem erros | PASS |
| Callers/runtimes | nenhum arquivo fora da fundação, testes e PMAV5 alterado | PASS |

O `npm run typecheck` global permanece não limpo por erros preexistentes em scripts legados e páginas não tocadas por esta Sprint. A compilação strict isolada de `src/core/state` passou sem erros; a dívida global não foi alterada para preservar o escopo.

O build compilou o bundle com sucesso e foi interrompido no prerender legado de `/history` porque o Supabase Admin não está configurado na worktree. A falha ocorre fora do State Service e nenhum arquivo de ambiente foi criado para contorná-la.

## Encerramento

CP-004 registra `COMPLETED` para a fundação M-02. Os adapters não estão conectados a nenhum caller e nenhuma escrita de produção, mudança de runtime ou alteração funcional foi ativada.
