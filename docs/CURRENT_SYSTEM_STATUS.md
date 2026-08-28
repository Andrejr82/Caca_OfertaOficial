# Estado atual do sistema

<!-- docs-status: current -->
<!-- verified-against: b4b6da282bbcecb74d93898a6d00c170ce103d24 -->
<!-- verified-on: 2026-08-28 -->

Baseado na `main` em `bd62fbf4784ce6ad1f5c123240e51c7815aaafb1`, no ciclo controlado de `informatica_editorial` de 28/08/2026 e na revisão do PR #187. O PR #187 permanece isolado até merge e alinhamento explícito da Oracle.

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

`FIRST_DISCOVERY_QUALITY_V1_MODE=active` na Oracle auditada. O fluxo trabalha com Core/Expansion/Opportunity e não deve preencher volume artificialmente com candidatos fracos.

A política `adaptive-catalog-depth/v1` permanece disponível como contrato de profundidade; cada marketplace preserva seus próprios mecanismos seguros de busca.

## Qualidade do funil — PR #187

O ciclo controlado de Informática comprovou: ML classificou 5/5 sem `review_required`, mas ficou concentrado em roteadores; Amazon ainda promoveu acessórios; Shopee ainda apresentou repetição e vazamento semântico.

O PR #187 corrige os gargalos nos componentes existentes:

- `product-title-quality`: bloqueio mais forte de acessórios/consumíveis antes do ranking;
- `curation-policy`: `allowAccessory` deixa de liberar um cenário inteiro; somente intenção explicitamente acessória pode autorizar o item;
- classificação: o produto principal do título precede menções secundárias, evitando casos como webcam→notebook e mini-PC→SSD;
- Amazon: filtros específicos para resultados ambíguos de `scanner` e `switch de rede`;
- ranking legado: menor influência de `deterministicScore`, com maior peso para confiança, desconto real, prova social, loja oficial e frete;
- Mercado Livre: paginação oficial usa o tamanho bruto da página para decidir continuidade e pode avançar por offsets `0/30/60/90`; aliases editoriais ampliam a busca mantendo os guardrails existentes.

Nenhuma dessas mudanças altera agenda, credenciais, Supabase ou publicação.

## Mercado Livre

A `main` já usa certified-first e catálogo editorial ampliado. O PR #187 corrige o encerramento prematuro da paginação: uma página cheia não pode ser tratada como “fim” apenas porque poucos itens sobreviveram ao filtro semântico.

O mapa certificado continua sendo a camada de maior confiança; famílias editoriais adicionais usam busca oficial estrita, sem se tornarem automaticamente certificadas.

## Qualidade comercial

Produto persistido não é automaticamente “achadinho”. A carteira deve combinar aderência editorial, produto principal, desconto plausível, rating/reviews, vendas, loja oficial, logística e economia real conforme o marketplace.

## Oracle — estado operacional confirmado antes do PR #187

- branch: `main`;
- HEAD/runtime: `bd62fbf4784ce6ad1f5c123240e51c7815aaafb1`;
- working tree: limpa na última checagem;
- `oracle-scraper`: online;
- alinhamento com a `main`: confirmado.

O PR #187 não deve ser considerado carregado pela Oracle enquanto não houver merge e novo alinhamento explícito.

## Radar

- `oracle-trends-radar` dedicado;
- `TRENDS_RADAR_DEDICATED_RUNTIME=true`;
- `TREND_EXECUTIVE_MODE=off`;
- polling de 30s e lock `/tmp/caca-oferta-trends-radar.lock`;
- `oracle-scraper` não consome Radar no ciclo editorial.

## Validação

- `npm run verify`
- `npm run docs:audit`
- testes de regressão de qualidade/classificação
- `/api/health`
- `/api/readiness`

Antes de qualquer intervenção de produção, comparar o SHA da Oracle com a `main`, confirmar working tree limpa, PM2 e flags efetivas.
