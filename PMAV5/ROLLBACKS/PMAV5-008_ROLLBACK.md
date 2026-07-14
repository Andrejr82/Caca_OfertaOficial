# PMAV5-008 — Plano de rollback

## Objetivo

Reverter exclusivamente a implementação M-06 se ela ainda não estiver integrada, sem tocar produção, banco, schema, migrations, segredos ou executores paralelos.

## Unidade de reversão

Após o encerramento, a unidade de reversão é o commit com a mensagem:

`refactor(pmav5): centralize publication in official service`

Executar a reversão por `git revert <sha-final>` em branch de manutenção derivada da branch PMAV5. Não usar reset destrutivo e não remover alterações posteriores não relacionadas.

## Componentes revertidos

O revert restaura as quatro rotas e os três callers de painel anteriores, recupera o serviço transitório de publicação e remove:

- `src/core/publication/`;
- `src/lib/publication/official/`;
- transportes oficiais e normalização de receipts;
- testes e provas arquiteturais PMAV5-008;
- bloqueio fail-closed do publisher genérico;
- registros documentais de CP-008.

## Validação pós-reversão

1. confirmar que somente o commit PMAV5-008 foi revertido;
2. executar a suíte integral e as regressões de State Service, IA, Curadoria e Oracle;
3. executar ESLint, typecheck direcionado e `git diff --check`;
4. certificar que nenhum arquivo proibido foi alterado;
5. manter qualquer ativação externa desabilitada e não realizar publicação de prova.

## Segurança operacional

Nenhuma etapa deste rollback autoriza deploy, migration, alteração de schema, `.env`, segredo, serviço externo ou produção. Como a Sprint não executou publicação real nem alterou produção, não existe efeito externo a compensar. Se houver integração posterior dependente da API oficial, ela deve ser revertida antes deste commit para preservar a ordem de dependências.
