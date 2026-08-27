# Estado atual do sistema

<!-- docs-status: current -->
<!-- verified-against: 7f35e0d2c0ca22e118b8163a73d18a1c7d995439 -->
<!-- verified-on: 2026-08-27 -->

Baseado no código da `main` e na auditoria operacional da Oracle realizada em 27/08/2026.

## Runtime

- Next.js 16/React 19: painel, APIs, Official AI, Publicação Expressa, vídeos e transportes sociais.
- Supabase: ofertas, posts, links, auditoria, classificação, jobs e Storage.
- Oracle: Discovery-Only, scheduler editorial, scraping auxiliar, Radar dedicado e serviços operacionais.
- Scheduler: `0 6,8,10,12,14,16,18 * * *`, timezone `America/Sao_Paulo`, `noOverlap=true`.
- O scraper não executa Discovery no startup; `--run-now` dispara execução manual explícita.

## Matriz editorial ativa

1. 06h → `casa_cozinha_editorial`
2. 08h → `beleza_editorial`
3. 10h → `informatica_editorial`
4. 12h → `moda_editorial`
5. 14h → `ferramentas_editorial`
6. 16h → `pet_editorial`
7. 18h → `eletrodomesticos_editorial`

`cupons_aprovados_editorial` permanece `manual_only`.

## First Discovery Quality V1

O PR #177 foi mergeado na `main` no commit `7f35e0d2c0ca22e118b8163a73d18a1c7d995439`.

A flag `FIRST_DISCOVERY_QUALITY_V1_MODE` aceita `off | shadow | active`.

- default do código: `off`;
- produção Oracle em 27/08/2026: `active`;
- `active`: usa intents refinadas, descarta candidatos inelegíveis e prioriza candidatos fortes;
- se não houver candidatos fortes, não deve ocorrer backfill artificial com fracos;
- readiness insuficiente não dispara automaticamente uma nova descoberta.

A política `adaptive-catalog-depth/v1` permanece disponível como fallback conceitual, porém a chamada adicional de rede continua desacoplada do executor Oracle.

## Limitação operacional conhecida

A auditoria de um ciclo manual de `moda_editorial` em 27/08/2026 mostrou uma lacuna importante:

- Mercado Livre pode terminar vazio quando a resolução de domínio nativo não forma cobertura suficiente;
- Shopee pode ser bloqueada antes da extração quando categorias amplas levam o runtime a `coverageInsufficient`;
- o runtime atual não aprofunda automaticamente a busca nesses casos.

Isso é uma limitação do mecanismo de descoberta, não ausência de catálogo nos marketplaces. O comportamento desejado é: manter qualidade alta, continuar procurando enquanto houver orçamento seguro de busca e só encerrar zerado depois de esgotar de fato as alternativas do marketplace.

## Qualidade comercial

Um produto persistido não deve ser interpretado automaticamente como “achadinho”. A carteira forte deve combinar relevância editorial com evidências reais como desconto plausível, cupom, rating/reviews, vendas, loja oficial, frete/Prime e posição de origem conforme o marketplace.

Produtos sem desconto, sem prova social e sem outros sinais fortes podem ser válidos para catálogo, mas não devem ser tratados como ofertas fortes apenas porque passaram pelo funil.

## Publicação Expressa

O PR #178 foi mergeado no commit `f68512c56617680247f73d7cc3523f1e9de92892`, restaurando o contrato necessário da Publicação Expressa após Copy V5 sem alterar discovery, Oracle ou Supabase.

## Oracle — estado operacional confirmado em 27/08/2026

- branch: `main`;
- HEAD: `7f35e0d2c0ca22e118b8163a73d18a1c7d995439`;
- working tree: limpa;
- `FIRST_DISCOVERY_QUALITY_V1_MODE=active`;
- `oracle-scraper`: online;
- ativação realizada com incremento de restart igual a 1;
- crash loop: não;
- erros de startup: nenhum;
- `shopee-feed-sync`: parado;
- demais processos principais auditados online.

## Ambiente local

Resultados de execução manual local só são comparáveis à Oracle quando o checkout local estiver no mesmo SHA e com as mesmas flags relevantes. Um ciclo local executado em 27/08/2026 registrou `release_id=e157df09f0d8deb53a65a8f48376c89d9cdcdef1`, portanto não deve ser usado como prova do comportamento produtivo da Oracle em `7f35e0d2...`.

## Radar

- `oracle-trends-radar` dedicado;
- `TRENDS_RADAR_DEDICATED_RUNTIME=true`;
- `TREND_EXECUTIVE_MODE=off`;
- polling de 30s e lock `/tmp/caca-oferta-trends-radar.lock`;
- `oracle-scraper` não consome Radar no ciclo editorial.

## Validação

- `npm run verify`
- `npm run docs:audit`
- `/api/health`
- `/api/readiness`

Antes de qualquer intervenção de produção, comparar o SHA da Oracle com a `main`, confirmar working tree limpa, PM2 e flags efetivas.