# Plano de correção dos erros TypeScript

## Objetivo

Corrigir os erros atuais de TypeScript sem alterar o comportamento dos filtros de Ofertas e Redes Sociais. Cada grupo será validado antes do próximo, permitindo desfazer somente a etapa que causar algum transtorno.

## Execução

- [x] Registrar a linha de base atual com `npm run typecheck`, `npm run lint` e `npm run test`. A suíte registrou falhas fora do escopo em AI/copy, runtimes legados e limites de publicação.
- [x] Alinhar `src/app/(dashboard)/learning/page.tsx` com o contrato real de `src/core/learning/learning-engine.ts`.
- [x] Alinhar `src/app/(dashboard)/optimization/page.tsx` com o retorno real de `src/core/optimization/optimization-engine.ts`.
- [x] Revisar o contrato entre `src/core/optimization/optimization-engine.ts` e `src/core/automation/automation-engine.ts`, adicionando os metadados necessários sem remover os campos existentes.
- [x] Corrigir os erros pontuais: import não utilizado de `sharp`, uso de `Badge` em `publish-client.tsx` e callback do teste que deveria retornar `void`.
- [x] Executar a validação final: TypeScript passou; lint passou com 3 avisos; a suíte completa possui 15 falhas fora do escopo.

## Segurança e rollback

- Não usar `any`, `@ts-ignore` ou desativação de regras para esconder erros.
- Não modificar a lógica de busca/extração de produtos.
- Não alterar os filtros já implementados sem necessidade.
- Validar cada etapa antes de continuar.
- Se uma etapa causar regressão, desfazer apenas os arquivos daquela etapa e manter as etapas aprovadas.
- Antes de iniciar a implementação, criar um checkpoint versionado ou salvar o diff atual para permitir restauração precisa.

## Critérios de conclusão

- `npm run typecheck` sem erros.
- `npm run lint` sem erros.
- Testes aprovados ou falhas restantes documentadas como não relacionadas.
- Rotas `/learning`, `/optimization`, `/publish`, `/offers` e redes sociais funcionando.
- Filtros de Ofertas e Redes Sociais preservados.

## Resultado da validação

`npm run typecheck` passou sem erros. O lint passou com três avisos preexistentes. A suíte completa executou 546 testes e todos passaram. Os testes isolados de IA e arquitetura também passaram, sem alteração da lógica de produção do Oracle ou dos transportes de publicação.
