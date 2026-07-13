# Critérios de Aceite — PMAV5-000

## Fundação Git

- [x] Branch exclusiva criada diretamente de `origin/main`.
- [x] Working tree original e alterações de outros trabalhos preservados.
- [x] SHA inicial e worktrees registrados.
- [x] Commit documental exclusivo criado nesta execução.
- [x] Push exclusivo da branch confirmado nesta execução.

## Autoridade documental

- [x] Estrutura `PMAV5/` criada.
- [x] Arquitetura atual separa certificado, não certificado, legado, V5, morto e ativo-capaz.
- [x] Arquitetura-alvo e autoridades únicas definidas.
- [x] Responsabilidades permitidas/proibidas e contratos definidos.
- [x] Máquina de estados e invariantes definidos.
- [x] Princípios, checkpoints, dependências e ADRs definidos.
- [x] Protocolo LLM, ficha e changelog criados.

## Escopo e segurança

- [x] Diff final contém somente `PMAV5/`.
- [x] Nenhum arquivo funcional/configuração/segredo foi alterado.
- [x] Nenhuma mudança de banco, Oracle, PM2, Scheduler ou produção ocorreu.
- [x] Nenhum build, teste funcional, migration, deploy, restart ou runtime proibido foi executado.
- [x] Diff staged foi revisto antes do commit.

## Regra de resultado

`PASS` exige todos os itens acima comprovados, commit e push concluídos. `IMPLEMENTED` não significa `HOMOLOGATED`; CP-000 permanece pendente de revisão humana. Qualquer desvio externo a `PMAV5/` bloqueia commit e produz `FAIL`.
