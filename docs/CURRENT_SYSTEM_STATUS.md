# Estado atual do sistema

<!-- docs-status: current -->
<!-- verified-against: 76cb164c2d76b99e23a6d9422d38469c3bb27583 -->
<!-- verified-on: 2026-08-28 -->

Baseado no código da `main`, na auditoria operacional da Oracle e na revisão do PR #186 em 28/08/2026. O PR #186 permanece isolado e não representa produção até merge e alinhamento explícito da Oracle.

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
- produção Oracle auditada: `active`;
- `active`: usa intents refinadas, descarta candidatos inelegíveis e prioriza candidatos fortes;
- se não houver candidatos fortes, não deve ocorrer backfill artificial com fracos;
- readiness insuficiente não dispara automaticamente uma nova descoberta.

A política `adaptive-catalog-depth/v1` permanece disponível como fallback conceitual, porém a chamada adicional de rede continua desacoplada do executor Oracle.

## Qualidade do funil — PR #186

A auditoria do ciclo de `informatica_editorial` de 28/08/2026 mostrou três falhas distintas: acessórios sobrevivendo em Amazon/Shopee, classificação ML descartando famílias válidas e ranking V2 favorecendo preço baixo sem qualidade comercial equivalente.

O PR #186 corrige esses pontos nos componentes existentes:

- `product-title-quality`: bloqueia títulos claramente de peça, reposição, cabo/carregador dedicado e manutenção de impressora 3D antes do ranking;
- Shopee OpenAPI V1: reutiliza esse gate imediatamente antes do controlled persist;
- Mercado Livre: classificação consome domínio/categoria do mapa certificado antes do catálogo genérico;
- Amazon: evidência do título/atributos precede browse nodes amplos na classificação;
- Offer Quality V2: preço baixo deixa de receber bônus automático; desconto verificado, confiança, prova social, logística e economia real ganham prioridade;
- runtime compilado e fonte TypeScript do Offer Quality permanecem alinhados.

Nenhuma dessas mudanças altera agenda, credenciais, Supabase ou publicação. O PR permanece não implantado até merge e alinhamento Oracle.

## Limitação operacional conhecida

O Mercado Livre continua deliberadamente restrito às famílias certificadas no mapa V1. Isso protege precisão, mas significa que famílias ainda em investigação não entram automaticamente na busca produtiva até certificação específica.

A profundidade automática também depende do orçamento seguro já existente de cada marketplace; o sistema não deve preencher volume artificialmente com produtos fracos.

## Qualidade comercial

Um produto persistido não deve ser interpretado automaticamente como “achadinho”. A carteira forte deve combinar relevância editorial com evidências reais como desconto plausível, cupom, rating/reviews, vendas, loja oficial, frete/Prime e posição de origem conforme o marketplace.

Produtos sem desconto, sem prova social e sem outros sinais fortes podem ser válidos para catálogo, mas não devem superar ofertas comprovadamente melhores apenas por serem baratos.

## Publicação Expressa

O PR #178 foi mergeado no commit `f68512c56617680247f73d7cc3523f1e9de92892`, restaurando o contrato necessário da Publicação Expressa após Copy V5 sem alterar discovery, Oracle ou Supabase.

## Oracle — estado operacional confirmado em 28/08/2026

- branch: `main`;
- HEAD/runtime antes do PR #186: `940a5b99c4e92d024197f8a8a88e3e33cc20cf1e`;
- working tree: limpa na última checagem;
- `oracle-scraper`: online;
- alinhamento com a `main`: confirmado antes da abertura do PR #186.

O PR #186 não deve ser considerado carregado pela Oracle enquanto não houver merge e novo alinhamento explícito.

## Radar

- `oracle-trends-radar` dedicado;
- `TRENDS_RADAR_DEDICATED_RUNTIME=true`;
- `TREND_EXECUTIVE_MODE=off`;
- polling de 30s e lock `/tmp/caca-oferta-trends-radar.lock`;
- `oracle-scraper` não consome Radar no ciclo editorial.

## Validação

- `npm run verify`
- `npm run docs:audit`
- testes de regressão de qualidade de marketplace
- `/api/health`
- `/api/readiness`

Antes de qualquer intervenção de produção, comparar o SHA da Oracle com a `main`, confirmar working tree limpa, PM2 e flags efetivas.