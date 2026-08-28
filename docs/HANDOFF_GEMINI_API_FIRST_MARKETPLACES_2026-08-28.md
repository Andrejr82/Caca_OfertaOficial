# Handoff operacional para Gemini — API-first marketplaces

Use este documento como instrução de execução.

## Contexto obrigatório

Projeto: `Caça Ofertas Oficial`

Repositório local esperado:

`C:\Projetos_GitHub\Projeto_Oficial\Caca_OfertaOficial\`

Branch obrigatória de trabalho:

`docs/api-first-marketplace-validation-plan`

Base inicial documentada:

`main@1bf08df46b7aafd897af2e88ed327b1a15937f2d`

Documentos canônicos deste trabalho:

- `docs/PLANO_API_FIRST_MARKETPLACES_2026-08-28.md`
- `docs/TASKS_API_FIRST_MARKETPLACES_2026-08-28.md`
- este handoff.

## Regra máxima

**Não fazer merge na `main`.**

Execute todas as tasks, testes, probes e validações na branch separada. Ao final, entregue todas as evidências ao usuário. O merge só pode ocorrer depois de uma auditoria externa final.

## Objetivo

Resolver de forma mensurável os problemas de:

- cobertura de busca;
- profundidade/paginação;
- aderência semântica;
- acessórios/consumíveis;
- classificação do produto principal;
- ranking;
- diversidade;
- persistência.

Não criar nova arquitetura. Trabalhar nos componentes já existentes.

## Princípio API-first

Para Mercado Livre e Shopee, use **as APIs oficiais e as credenciais já configuradas no runtime** como fonte primária para entender o que existe na entrada.

Nunca imprima tokens, client secrets, refresh tokens, cookies ou qualquer segredo em terminal, relatório, commit ou resposta.

Para Amazon, preserve o mecanismo de coleta atual e audite o volume bruto antes dos filtros.

Site/web pode ser usado apenas como inspeção manual complementar. Não use o site como fonte principal para concluir que o runtime encontra ou não encontra produtos.

## Procedimento de trabalho

1. Leia integralmente os três documentos.
2. Confirme branch e SHA.
3. Revise os componentes atuais antes de editar.
4. Execute TASK 0 a TASK 12 primeiro.
5. Não toque na Oracle antes da autorização explícita do usuário.
6. Quando chegar à TASK 13, pare e apresente ao usuário:
   - diff atual;
   - testes;
   - probes API-first;
   - riscos;
   - comandos exatos pretendidos para Oracle.
7. Só depois da autorização continue TASK 13 em diante.
8. Ao final, não faça merge. Entregue o pacote de evidências.

## Restrições

Não fazer:

- novo motor de discovery;
- novo serviço paralelo;
- nova tabela Supabase sem necessidade comprovada e autorização;
- alteração de credenciais;
- alteração de cron/scheduler não relacionada;
- alteração de publicação/social não relacionada;
- bypass de filtros para aumentar volume;
- padding de fila com produto fraco;
- hardcode de produto específico para fazer teste passar;
- remoção de guardrail sem prova API-first;
- merge automático;
- deploy automático.

## Mercado Livre — foco

Problema conhecido: classificação já chegou a 5/5 no ciclo controlado, mas os 5 persistidos eram roteadores.

Investigue separadamente:

- o que foi pesquisado;
- o que a API retornou;
- o que foi eliminado antes do funil instrumentado;
- quais famílias tinham candidatos válidos;
- quais aliases foram usados;
- quais offsets foram realmente consultados;
- por que uma família dominou a seleção.

Garanta que a paginação use quantidade bruta da página para decidir continuidade. Não encerrar uma família apenas porque o filtro semântico reduziu a página.

Certified-first continua obrigatório. Famílias editoriais adicionais podem usar somente o fallback oficial estrito já existente.

## Shopee — foco

Problema conhecido: volume forte, mas vazamentos semânticos e repetição.

Preserve as fontes oficiais já ativas e compare-as.

Bloqueie falsos produtos principais, incluindo:

- filamento 3D;
- caneta 3D classificada como impressora;
- peças;
- kits de manutenção;
- suportes/adaptadores fora da intenção;
- famílias incompatíveis por palavra secundária.

Verifique diversidade sem criar cota cega.

## Amazon — foco

Problema conhecido: centenas de candidatos, mas acessórios e classificação incorreta chegam à fila.

Casos obrigatórios:

- suporte notebook;
- suporte SSD;
- kit limpeza;
- organizador/enrolador de cabo;
- webcam para notebook;
- mini PC com SSD;
- scanner ambíguo;
- switch de rede ambíguo.

Produto principal e aderência devem ser resolvidos antes de ranking.

## Telemetria obrigatória

Nenhum candidato deve desaparecer silenciosamente.

A contabilidade deve fechar entre:

`API bruta -> parse -> semântica -> produto principal -> novidade -> quality -> classificação -> ranking/diversidade -> fila -> RPC -> persistência`

Produza contadores e motivos suficientes para explicar 100% da amostra avaliada.

## Golden set

Construa no mínimo 60 casos reais ou representativos:

- 20 Amazon;
- 20 ML;
- 20 Shopee.

Classifique cada um como:

- MUST_ACCEPT;
- MUST_REJECT;
- AMBIGUOUS_REVIEW.

Use títulos reais encontrados nas probes/ciclos sempre que possível.

O teste deve falhar se um caso MUST_REJECT entrar como produto principal ou se um MUST_ACCEPT inequívoco for rejeitado sem justificativa.

## Ordem correta de correção

1. produto principal;
2. aderência à intenção;
3. integridade dos dados;
4. classificação;
5. qualidade comercial;
6. ranking;
7. diversidade;
8. fila/persistência.

Nunca tente resolver classe errada apenas reduzindo score.

## Testes

Execute explicitamente todos os testes aplicáveis listados em `TASKS_API_FIRST_MARKETPLACES_2026-08-28.md`.

Para cada comando, registrar:

- comando;
- exit code;
- pass/fail;
- quantidade de testes quando disponível.

Não afirmar que CI/testes estão verdes se não foram executados.

## Oracle

Quando autorizado, use apenas procedimentos já suportados pelo projeto.

Não inventar sintaxe nova para `oracle-scraper`.

O cenário de prova deve ser `informatica_editorial` e deve ser executado uma única vez inicialmente.

Antes do ciclo, confirmar:

- SHA correto;
- working tree limpa;
- runtime release;
- PM2 online.

Depois do ciclo, registrar o correlation/cycle id.

## Supabase

Usar após o ciclo somente para validação do que realmente foi persistido.

Não editar dados para melhorar o resultado.

Cruzar correlation id com:

- marketplace;
- título;
- classificação/família;
- status;
- insert/update;
- evidências/score disponíveis.

## Condição de parada

Se qualquer uma destas situações ocorrer, pare e reporte antes de continuar:

- necessidade de nova arquitetura;
- necessidade de alterar credencial;
- necessidade de alterar schema Supabase;
- necessidade de mudar Oracle fora do plano;
- resultado da API contradiz premissa importante do plano;
- testes existentes revelam regressão ampla;
- branch divergiu da `main` de maneira que exija rebase/merge complexo.

## Entrega final obrigatória

Entregue ao usuário exatamente este pacote:

```text
BRANCH=
BASE_SHA=
FINAL_SHA=
MAIN_MERGED=NO
ORACLE_TOUCHED=YES|NO
ORACLE_SHA=
CONTROLLED_CYCLE_ID=

FILES_CHANGED:
...

TASK_STATUS:
TASK_0=PASS|FAIL
...
TASK_17=PASS|FAIL

TESTS_EXECUTED:
...

API_FIRST_REPORTS:
- Mercado Livre: ...
- Shopee: ...
- Amazon: ...

FUNNEL_LOSS_MATRIX:
...

FAMILY_COVERAGE:
...

GOLDEN_SET:
...

CONTROLLED_ORACLE_RESULT:
...

SUPABASE_POST_CYCLE:
...

BASELINE_VS_FINAL:
...

RESIDUAL_RISKS:
...
```

Não faça merge após gerar esse relatório. Aguarde auditoria e autorização.
