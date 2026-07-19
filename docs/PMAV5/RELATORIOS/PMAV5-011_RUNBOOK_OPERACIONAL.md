# PMAV5-011 — Runbook Operacional de Observabilidade e Recuperação

## Objetivo
Orientar a operação e a recuperação manual em caso de alertas emitidos pela camada de observabilidade end-to-end, garantindo que qualquer ação de recuperação respeite os princípios da arquitetura unificada (PMAV5).

## Alertas Críticos (CRITICAL)

### 1. `dual_authority_detected` / `direct_writer_detected`
- **Métrica**: `service_health`
- **Limiar**: any occurrence
- **Resumo**: Foi detectada uma tentativa de escrita direta no banco por um componente não oficial ou múltipla autoridade para o mesmo domínio.
- **Ação Imediata**: Bloquear a ação insegura. Isolar o log ou processo emissor.
- **Resolução**: Analisar log estruturado, identificar a origem não autorizada (ex: legacy script, worker antigo) e desligá-lo. O incidente só é resolvido quando os eventos provarem que o escritor direto foi contido.

### 2. `duplicate_publication_confirmed`
- **Métrica**: `publication_receipts_total`
- **Limiar**: duplicate receipt evidence
- **Resumo**: Evidência de recibo duplicado para o mesmo canal no mesmo tenant e offer/post.
- **Ação Imediata**: Pausar publicações para o canal no tenant afetado.
- **Resolução**: Validar os logs do Integration Service. O transporte foi chamado duas vezes indevidamente? Identificar a origem (falha de idempotência no transporte?). Corrigir o defeito; não é possível desfazer a publicação externa, mas a mitigação impede o loop.

### 3. `receipt_lost` / `published_without_posted`
- **Métrica**: `publication_reconciliation_required_total`
- **Resumo**: Efeito externo confirmado (post publicado) sem gravação de state ou receipt oficial.
- **Ação Imediata**: Iniciar reconciliação oficial do receipt.
- **Resolução**: Obter manualmente o Receipt do canal. Chamar o serviço de reconciliação passando o receipt para que o State Service atualize para `published` de forma autorizada.

### 4. `state_service_unavailable`
- **Métrica**: `service_readiness`
- **Limiar**: 0
- **Resumo**: State Service parou de responder ou reporta degradação.
- **Ação Imediata**: Escalation imediato ao Incident Commander. O fluxo principal está pausado.
- **Resolução**: Verificar logs do banco, conexão Supabase. Se houver falha de rede temporária, os `Recovery Items` abertos tratarão a retomada assim que o serviço voltar.

### 5. `cas_bypass_detected`
- **Métrica**: `state_transition_conflicts_total`
- **Resumo**: Evidência de bypass no Compare-and-Swap (ex: edição simultânea ignorando lock/version).
- **Ação Imediata**: Isolar o serviço chamador.
- **Resolução**: Garantir que as chamadas ao State Service usem as bridges oficiais e preservem a concorrência.

## Alertas Altos (HIGH)

### 1. `worker_heartbeat_missing` / `scheduler_delayed`
- **Métrica**: `worker_heartbeat_age_ms` / `scheduler_last_run_age_ms`
- **Resumo**: Oracle Worker não emite heartbeat no tempo esperado ou Scheduler está atrasado.
- **Resolução**: Checar PM2 e processos associados. Reiniciar processo se travado. Itens que ficarem "presos" na extração poderão ser descartados se obsoletos.

### 2. `recovery_queue_growing`
- **Métrica**: `recovery_items_open`
- **Limiar**: crescimento monotônico (monotonic growth)
- **Resumo**: A fila de itens para recuperação não está sendo esvaziada.
- **Resolução**: Verificar se há falha generalizada em algum provedor (AI ou Social). A recuperação automática e replay podem estar falhando em loop.

### 3. `selected_stuck` / `approved_stuck`
- **Métrica**: `ai_selected_age_ms` / `publication_draft_age_ms`
- **Resumo**: Itens aprovados para curadoria ou aguardando IA estão estagnados.
- **Resolução**: Investigar logs do provider de AI (`ai_failures_total`) ou timeout de curadoria humana. Disparar Replay via `Reconciliation Service` se for falha transiente.

## Procedimento Padrão para Replay e Reconciliação
1. Acessar dashboard de Recovery ou consultar banco de Integration Logs para identificar Recovery Items `OPEN`.
2. Para itens que não exijam intervenção humana (`MANUAL_ACTION_REQUIRED`), o executor de sistema tentará o `Replay` (acionando `OfficialReplayPort`).
3. Para falhas contínuas, um operador humano autenticado e com tenant ativo usará o endpoint oficial do `Reconciliation Service`.
4. É estritamente proibido forçar a transição de estado via SQL. Utilize o fluxo oficial: `ReconciliationService.replay()`.

## Política de Retenção
Os itens e recibos registrados pelo `Integration Logs` e `Audit` são preservados conforme definição em infraestrutura externa, servindo de evidência imutável para a auditoria de estado e decisões. Nunca apagar registros desta base via terminal.
