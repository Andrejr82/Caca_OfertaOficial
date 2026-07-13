# Governança do PMAV5

## Autoridade e precedência

Este conjunto documental é a autoridade arquitetural do PMAV5. Em caso de divergência, prevalecem: ADR aprovado mais recente; Arquitetura Oficial V5; Máquina de Estados; Contratos; Autoridades; Princípios; ficha da Sprint. A auditoria atual é evidência, não arquitetura-alvo.

## Papéis

| Papel | Responsabilidade |
|---|---|
| Arquitetura principal | manter arquitetura, contratos e ADRs coerentes |
| Tech Lead da Sprint | cumprir escopo, dependências, evidências e rollback |
| Governance Officer | verificar rastreabilidade e proibições |
| Revisor humano | homologar ou rejeitar checkpoints |
| LLM executora | cumprir o preflight e parar diante de bloqueio |

## Gates obrigatórios

1. Confirmar branch, SHA, working tree e dependências.
2. Ler o protocolo e os documentos vigentes.
3. Declarar escopo, arquivos proibidos e rollback antes de alterações.
4. Executar somente o autorizado pela ficha da Sprint.
5. Produzir evidência reproduzível e verificar o diff completo.
6. Marcar `IMPLEMENTED` ou `VALIDATED` apenas com evidência.
7. Reservar `HOMOLOGATED` à revisão humana explícita.

Nenhuma Sprint pode ser repetida. Nenhuma Sprint pode iniciar sem checkpoint anterior `HOMOLOGATED`, exceto por ADR aprovado que registre justificativa, risco, duração e compensações. Um commit, deploy ou teste bem-sucedido não substitui homologação.

## Controle de mudança

- Mudança arquitetural exige ADR novo; ADR aprovado não é editado para apagar a história.
- Mudança de escopo exige atualização da ficha antes da execução.
- Desvio encontrado interrompe commit e promoção do checkpoint.
- Feature flag é mecanismo transitório, nunca autoridade arquitetural permanente.
- Evidência deve registrar origem, data, branch, SHA, comando/método e resultado, sem segredos.
- Segredos, `.env`, dumps e logs privados não pertencem ao PMAV5.

## Política Git

A branch única do programa é `codex/pmav5-architecture-unification`, nascida de `origin/main`. São proibidos reset destrutivo, force push, rebase da `main`, stash ou sobrescrita de trabalho alheio e merge direto sem homologação. Cada Sprint usa commits exclusivos e rastreáveis nessa branch. Push não autoriza merge, deploy ou alteração de produção.

## Status e encerramento

Os únicos status de checkpoint são `NOT_STARTED`, `IN_PROGRESS`, `BLOCKED`, `IMPLEMENTED`, `VALIDATED`, `HOMOLOGATED` e `ROLLED_BACK`. Falha fechada é obrigatória: incerteza, evidência ausente, conflito ou dependência não homologada bloqueia a execução.

Rollback documental preserva o histórico por novo commit e, quando alterar decisão, por novo ADR. Nunca reescreve a história compartilhada. Rollback funcional será definido e autorizado na Sprint correspondente.

## AUTORIDADE CONSTITUCIONAL

Toda decisão do Programa deverá respeitar a Constituição.
