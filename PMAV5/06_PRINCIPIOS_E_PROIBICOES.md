# Princípios e Proibições

| # | Princípio | Descrição e motivação | Conformidade | Violação | Exemplo |
|---:|---|---|---|---|---|
| 1 | Single Source of Truth | Supabase é a persistência oficial; evita versões concorrentes da verdade. | Toda decisão referencia estado/versionamento central. | Estado decisório mantido apenas em memória/cliente. | Oferta e auditoria persistidas transacionalmente. |
| 2 | Single Authority per Domain | Cada domínio tem uma autoridade; elimina governança paralela. | Discovery no Worker; curadoria/IA/publicação no Next.js. | Inngest decidir `approved`. | Inngest apenas executa delegação da IA oficial. |
| 3 | Discovery-Only Worker | Worker descobre, qualifica e para; reduz acoplamento e efeitos automáticos. | Saída exclusiva `pending_manual_review`. | Worker chamar Groq ou criar post. | Ciclo termina após persistir candidatos. |
| 4 | Manual Review First | Toda oferta exige decisão humana antes de IA. | `pending_manual_review → selected/rejected` autenticado. | Auto-seleção na publicação. | Curador seleciona no painel. |
| 5 | IA Only After Selected | IA consome apenas intenção humana explícita; controla custo e risco. | Gate transacional em `selected`. | IA sobre `draft` ou pending. | Serviço recusa pending com erro de contrato. |
| 6 | No Hidden Runtime | Todo runtime executável é inventariado e governado; evita efeitos invisíveis. | Launcher, dono, versão e status rastreados. | Script manual capaz sem classificação. | Job registrado no catálogo operacional. |
| 7 | No Parallel Governance | Execução paralela não implica decisão paralela; preserva invariantes. | Executor chama serviço proprietário. | Segundo pipeline de Discovery/IA autônomo. | Inngest faz retry do comando oficial. |
| 8 | No Implicit State Transition | Toda mudança é explícita e auditada; impede saltos silenciosos. | Origem, destino, ator e motivo registrados. | Publicar auto-selecionando. | UX de um clique registra transições separadas. |
| 9 | No Direct Database State Mutation | Status muda somente pelo serviço oficial; centraliza validações. | Escrita de estado encapsulada e observável. | `update({status:'approved'})` em rota. | Rota chama `transitionOffer`. |
| 10 | Idempotency by Default | Retries não duplicam oferta, post ou envio. | Chave estável e resultado reusável. | Retry criar segundo post. | Mesmo comando retorna o primeiro resultado. |
| 11 | Fail-Closed | Incerteza ou dependência indisponível não promove fluxo. | Validação/erro antes de efeito. | Assumir sucesso sem recibo. | Falha WhatsApp mantém approved/draft. |
| 12 | Evidence Before PASS | Declaração de sucesso exige prova fresca e reproduzível. | Checklist, comandos e resultados anexados. | PASS baseado em expectativa. | Diff verificado antes do commit. |
| 13 | No Feature Flag as Architecture | Flags são transição temporária, não fonte permanente de autoridade. | Alvo independe de flag; prazo/remoção rastreados. | Flag escolher V4/V5 indefinidamente. | Flag temporária vinculada à Sprint de remoção. |
| 14 | No Legacy Fallback | Falha V5 não reativa silenciosamente legado; evita regressão oculta. | Erro fechado e observável. | Shopee cair para EPIC 09. | V5 indisponível interrompe o ciclo. |
| 15 | No External Client as Orchestrator | Clientes enviam intenção/dados, não governam negócio. | Extensão usa API autenticada de entrada. | Extensão usar service-role, IA e canais. | Captura vira pending para revisão. |
| 16 | No Deployment Without Homologation | Produção só muda após evidência e aprovação humana. | Checkpoint `HOMOLOGATED` e plano de rollback. | Deploy em `IMPLEMENTED`. | Revisor homologa antes da janela. |
| 17 | No Sprint Repetition | Sprint concluída não é reexecutada; preserva sequência e história. | Correção usa nova Sprint/ADR/commit. | Rodar PMAV5-000 novamente. | Ajuste posterior recebe registro próprio. |
| 18 | No Untracked Architectural Decision | Toda decisão relevante é um ADR; evita arquitetura por acidente. | Contexto, decisão, trade-off e consequência registrados. | Alterar autoridade em PR comum. | Novo ADR sucede explicitamente o anterior. |

## Regra de aplicação

Uma única violação bloqueia PASS e promoção de checkpoint. Exceções não podem ser implícitas: exigem ADR aprovado antes da execução, prazo, risco, controles compensatórios e critério de remoção.
