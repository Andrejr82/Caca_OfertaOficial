# Auditoria — Task 2 — Publicação Expressa Mercado Livre

Data: 2026-08-18

Baseline da `main`: `a113a19da07771ea6762a89b50c60412fc971079`

## Escopo executado

A Task 2 foi limitada à Publicação Expressa do Mercado Livre.

Não houve alteração em:

- Oracle / Official AI;
- `/go/...`;
- métricas de clique;
- copy;
- redes sociais;
- Documentation Audit.

## Problema tratado

O fluxo Express recebe tanto a URL original fornecida pelo afiliado quanto uma URL de afiliado reconstruída/derivada. Até esta task, `buildExpressAffiliateLinks` dava prioridade à URL derivada sempre que ela estivesse preenchida.

Esse comportamento podia descartar justamente o link oficial fornecido pela Central de Afiliados e Criadores do Mercado Livre.

## Regra implementada

Foi criado `selectExpressAffiliateDestination` em:

`src/lib/publish/express-affiliate-links.ts`

A regra agora é:

1. classificar o `originalUrl` pelo contrato da Task 1;
2. se for `official_meli_shortlink`, preservar o `meli.la` original;
3. se for `official_affiliate_full_url`, preservar integralmente a URL original com `matt_tool` + `ua`;
4. a URL resolvida/canônica continua sendo usada apenas para identidade/extração;
5. para entradas que não sejam links oficiais Mercado Livre, manter o comportamento pré-existente desta etapa, evitando mudança lateral em Shopee/Amazon/Shein.

## Revisão de `generateMLAffiliateLinkWithId`

A função legada continua existente, porém deixou de ser autoridade final de persistência quando o usuário fornece um link oficial da Central.

Mesmo que o fluxo produza uma URL reconstruída com `partner_id`, o destino persistido em `affiliate_links.original_url` será o link oficial original quando a classificação da Task 1 o aprovar.

Uma remoção/descontinuação global da função não foi feita nesta task para não afetar consumidores fora da Publicação Expressa sem auditoria específica.

## Revisão de `validateAffiliateMonetization`

A validação legada continua fazendo parte do fluxo atual. A Task 2 adiciona uma segunda proteção determinística no ponto de persistência para impedir que um link oficial da Central seja substituído por uma URL reconstruída.

A mudança estrutural de fail-closed para o ciclo automático pertence à Task 3, conforme o plano aprovado.

## Persistência

`buildExpressAffiliateLinks` continua criando os quatro links rastreáveis por canal, porém agora seleciona o destino comercial através de `selectExpressAffiliateDestination`.

Para os exemplos oficiais:

- `https://meli.la/...` → preservado;
- URL completa ML com `matt_tool` + `ua` → preservada.

## Testes adicionados/atualizados

Cobertura em:

`src/tests/lib/express-affiliate-links.test.ts`

Casos cobertos:

- preservação de `meli.la` mesmo se existir uma URL reconstruída;
- preservação de URL completa oficial com `matt_tool` + `ua`;
- manutenção de Shopee/Amazon;
- manutenção do contrato atual para URL ML comum nesta task;
- quatro canais continuam recebendo o mesmo destino comercial aprovado.

## Critério de saída da Task 2

Quando a Publicação Expressa recebe um link oficial da Central de Afiliados do Mercado Livre, o destino persistido para `/go/...` deve continuar sendo esse link oficial, e não uma URL canônica ou reconstruída internamente.
