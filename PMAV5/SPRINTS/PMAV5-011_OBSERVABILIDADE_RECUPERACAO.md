# PMAV5-011 — Observabilidade, Recuperação e Rastreabilidade End-to-End

## Identificação

| Campo | Valor |
|---|---|
| Modo | IMPLEMENTATION |
| Marco | M-09 — Observabilidade e Recuperação |
| Checkpoint | CP-011 |
| Branch | `codex/pmav5-architecture-unification` |
| SHA inicial | `75bb21c3b71063eae25487007d85726bdd020b64` |
| Worktree | `C:\Projetos_GitHub\Caca_OfertaOficial\.worktrees\pmav5-architecture-unification` |

## Objetivo e limites

Tornar ofertas, comandos, transições, inferências, posts, publicações, receipts, falhas e replays correlacionáveis de ponta a ponta. A camada observa, registra, mede, detecta e solicita recuperação somente pelas autoridades oficiais; nunca escreve estado de negócio.

O fluxo rastreável é Scheduler → Oracle Worker → Discovery → Ingestion → State → Curation → AI → Posts → Publication → Receipt → estados finais. Capacity Hunter permanece read-only.

## Arquitetura planejada

- núcleo hexagonal `src/core/observability`, sem Supabase, console, ambiente, relógio ou UUID concretos;
- envelope interno versionado `pmav5.observability/v1`;
- Ports de eventos, métricas, health, recovery queue, reconciliation repository, clock e UUID;
- adapters opt-in server-side para JSON estruturado, `integration_logs`, métricas em memória, registro técnico de recuperação e health;
- instrumentação mínima, injetável e best-effort nas autoridades oficiais;
- detectores somente leitura;
- Reconciliation Service autenticado e tenant-aware, delegando replay ao State, Official AI ou Official Publication Service;
- health/readiness sem mutação ou execução de Discovery, IA ou publicação.

## Envelope e eventos

O envelope conterá identidades de evento/comando/idempotência/correlação/causação/execução/tenant, entidade, contexto técnico, estados, versões, duração, tentativa, replay, resultado, falha, severidade e metadata sanitizada. Campos desconhecidos serão `null`; secrets, tokens, chaves, prompts/respostas integrais e dados pessoais desnecessários serão removidos.

Os eventos mínimos são os grupos Discovery, Ingestion, State, Curation, AI, Publication, Recovery e Health definidos pelo prompt PMAV5-011. Evento não possui autoridade de transição.

## Métricas, alertas e cardinalidade

Serão definidos contadores, gauges e histogramas oficiais para Discovery, State, Curation, AI, Publication, Recovery e System. Labels aceitas serão enums técnicos de baixa cardinalidade; IDs individuais serão proibidos. Alertas CRITICAL/HIGH/MEDIUM/LOW terão owner, limiar, janela, ação, runbook, escalonamento e resolução documentados, sem ativação externa nesta Sprint.

## Detecção, reconciliação, replay e DLQ

Detectores receberão snapshots por Ports somente leitura e identificarão pendências antigas, divergências receipt/estado, reservas expiradas, comandos incompletos e heartbeats atrasados. Itens técnicos usarão `OPEN`, `REPLAYING`, `RESOLVED` e `MANUAL_ACTION_REQUIRED`; esses valores não pertencem à máquina de negócio.

Replay exige autenticação, tenant, command ID e idempotency key. IA concluída não chama provider; publicação com receipt confirmado não chama transporte; Estado preserva CAS. Toda execução reutiliza exclusivamente o serviço oficial correspondente.

## Health e readiness

Health prova resposta do processo. Readiness consulta dependências mínimas por probes sem mutação e retorna apenas estado sanitizado. Nenhum probe executará fluxo real.

## Riscos e controles

| Risco | Controle |
|---|---|
| segredo ou payload sensível em log | sanitização recursiva, allowlist e testes |
| alta cardinalidade | bloqueio de labels com IDs |
| observabilidade alterar resultado | hooks best-effort isolados e testes de falha |
| replay duplicar efeito externo | receipt e idempotência antes da delegação |
| reconciliação virar writer | Ports oficiais, prova de imports e testes |
| alert fatigue | severidade, janela, owner e condição de resolução |

## Plano TDD

1. RED: contrato/envelope, propagação e sanitização.
2. GREEN: tipos, factory e adapters em memória/JSON.
3. RED: métricas, detectores, recovery queue, reconciliação e health/readiness.
4. GREEN: implementação mínima somente leitura e delegação oficial.
5. RED/GREEN: instrumentação injetável de Oracle, State, Curadoria, AI e Publication sem alterar retorno/efeito.
6. Regressão, provas arquiteturais, ESLint, typecheck, parser CJS e `git diff --check`.

## Rollback

Reverter exclusivamente o commit PMAV5-011 por novo commit. Não executar estado, replay, IA, publicação, Discovery, banco ou produção. Preservar audit trail já persistido e evidências documentais.

## Arquivos protegidos

Banco, schema, migrations, RLS, secrets, `.env`, Scheduler, PM2, Capacity Hunter, transportes, providers e marketplaces não receberão alteração funcional. Oracle Worker, State Service, Curadoria, Official AI e Official Publication admitem somente hooks mínimos sem mudança de fluxo, saída, estado ou idempotência.

