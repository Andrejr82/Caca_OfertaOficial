# RUNBOOK OPERACIONAL DE RELEASE

## 1. Freeze
- **Objetivo:** Congelar o ambiente e o repositório para a release.
- **Entradas:** Aprovação do Checkpoint final do PMAV5.
- **Saídas:** Repositório e ambiente bloqueados para alterações.
- **Critério de sucesso:** SHA congelado, sem commits paralelos.
- **Critério de falha:** Modificações ocorrendo durante o processo de freeze.
- **Rollback:** Descongelar e voltar ao estado normal de desenvolvimento.
- **Evidências:** `git log -1`, `git status --short`.

## 2. Cutover Validation
- **Objetivo:** Executar uma certificação final da arquitetura antes da promoção para produção.
- **Entradas:** Fase de Freeze concluída com sucesso.
- **Saídas:** Confirmação de integridade arquitetural sem architecture drift.
- **Critério de sucesso:**
  - Oracle Worker permanece Discovery-Only.
  - State Service continua autoridade única.
  - Official AI continua autoridade única.
  - Official Publication continua autoridade única.
  - Nenhum runtime paralelo reapareceu.
  - Nenhum writer paralelo existe.
  - Nenhum provider paralelo existe.
  - Nenhuma Feature Flag arquitetural voltou.
  - Nenhum Scheduler paralelo voltou.
  - Todos os contratos permanecem íntegros.
  - A SSOT permanece válida.
  - O Release Program continua consistente.
- **Critério de falha:** Detecção de qualquer violação arquitetural ou código paralelo.
- **Rollback:** Interromper a Release e descongelar o repositório para correções.
- **Evidências:** Relatório de certificação arquitetural e documental.

## 3. Production Cutover
- **Objetivo:** Preparar a transição entre versões em produção.
- **Entradas:** Fase de Cutover Validation concluída com sucesso.
- **Saídas:** Ambiente configurado e preparado para receber a versão V5.
- **Critério de sucesso:** Todos os serviços apontando para os locais de pré-deploy corretamente.
- **Critério de falha:** Falha de roteamento ou incompatibilidade de estado.
- **Rollback:** Reverter apontamentos de serviços para a versão anterior (`RELEASE/05_ROLLBACK_RELEASE.md`).
- **Evidências:** Logs do balanceador, status dos endpoints.

## 4. Deploy
- **Objetivo:** Instalação da V5 Oficial no ambiente alvo.
- **Entradas:** Production Cutover validado.
- **Saídas:** V5 em execução.
- **Critério de sucesso:** Todos os componentes iniciados sem erros críticos.
- **Critério de falha:** Crash de serviços na inicialização, falha na ligação com o banco de dados.
- **Rollback:** Aplicar `RELEASE/05_ROLLBACK_RELEASE.md`, retornando o ambiente à versão anterior estável.
- **Evidências:** Logs de inicialização, `docker ps`, verificação de estado no State Service.

## 5. Hypercare
- **Objetivo:** Monitoramento intensivo após o Deploy.
- **Entradas:** Deploy aprovado.
- **Saídas:** Sistema maduro sem incidentes críticos num período pré-determinado.
- **Critério de sucesso:** Zero anomalias arquiteturais e de estabilidade durante a janela de Hypercare.
- **Critério de falha:** Identificação de bugs críticos ou instabilidades de infraestrutura.
- **Rollback:** Acionar plano de contingência e Rollback se necessário.
- **Evidências:** Dashboards de monitoramento, traces de execução.

## 6. Release Closure
- **Objetivo:** Encerramento oficial da Release V5.
- **Entradas:** Fase de Hypercare encerrada sem pendências.
- **Saídas:** V5 declarada como versão estável e definitiva (Stable).
- **Critério de sucesso:** Assinatura formal do Release Closure e liberação da equipe de suporte intensivo.
- **Critério de falha:** Pendências não resolvidas que impeçam o fechamento da Release.
- **Rollback:** Não se aplica (nesta fase a versão já é definitiva, falhas exigem patch via novo ciclo).
- **Evidências:** Documento final de `RELEASE/08_RELEASE_CLOSURE.md` aprovado.
