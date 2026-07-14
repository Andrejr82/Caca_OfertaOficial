# Protocolo Operacional PMAV5 V1.0

## Objetivo

Padronizar a execução de Sprints por qualquer LLM.

## Regras

1. Ler Constituição, Governança, ADRs, dependências e Sprint vigente.
2. Identificar o modo: `AUDIT`, `DOCUMENTATION` ou `IMPLEMENTATION`.
3. Confirmar branch, worktree e working tree.
4. Em `AUDIT` e `DOCUMENTATION`, incertezas não bloqueiam a execução: devem ser registradas como `NÃO CERTIFICADO`, sem alterar runtime.
5. `IMPLEMENTATION` exige somente dependências anteriores em `COMPLETED` ou `APPROVED`, rollback e testes proporcionais ao risco. Bloqueia apenas por dependência técnica real, risco de segurança, working tree conflitante ou falha de testes.
6. Checkpoint não é gate.
7. O documento de dependências e os ADRs definem autorização.
8. Nenhuma LLM pode reinterpretar a numeração das Sprints.
9. Nenhuma LLM pode criar nova Sprint de governança durante o PMAV5.
10. Divergência documental deve ser resolvida pela sequência do ADR-013.
11. Toda implementação deve terminar com testes, revisão de diff, commit, push, working tree limpa e checkpoint `COMPLETED`.
12. Nenhuma Sprint realiza merge ou deploy sem instrução explícita.

## Checklist operacional

- [ ] branch correta
- [ ] worktree correto
- [ ] dependências `COMPLETED`/`APPROVED`
- [ ] escopo lido
- [ ] rollback definido
- [ ] testes definidos
- [ ] arquivos proibidos identificados

## Precedência operacional

Quando um texto histórico divergir desta sequência, aplicar o ADR-013 e classificar a regra conflitante como **OBSOLETO — substituído pelo ADR-013**. Esta regra não autoriza alteração de runtime, merge ou deploy.
