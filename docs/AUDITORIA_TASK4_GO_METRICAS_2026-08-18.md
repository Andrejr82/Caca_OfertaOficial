# Auditoria — Task 4 — `/go` e métricas

Data: 2026-08-18

Baseline da `main`: `99b542e517917ed4718574575c1035eee467bcf0`

## Escopo

A Task 4 foi limitada a:

- destino comercial do `/go`;
- separação entre clique humano e crawler/preview;
- preservação de Open Graph para previews.

Não houve alteração em:

- Oracle / Official AI;
- descoberta/ranking;
- copy;
- redes sociais;
- banco histórico;
- Documentation Audit.

## Problema identificado

A rota `src/app/go/[...subId]/route.ts` disparava `tracking/click.registered` antes da detecção de crawler. Assim, previews de WhatsApp/Facebook e outros bots podiam inflar `click_events` e as métricas internas.

Além disso, o código removia o `meta refresh` para alguns preview crawlers, mas mantinha o `window.location.href`, fazendo o crawler seguir para o marketplace mesmo assim.

## Regra implementada

Foi criado `src/lib/tracking/go-request.ts` com funções determinísticas:

- `isPreviewCrawler(userAgent)`;
- `isNonHumanTraffic(userAgent)`;
- `resolveGoAffiliateDestination(rawUrl)`.

A rota agora:

1. lê `affiliate_links.original_url` como destino comercial aprovado (`affiliateUrl`);
2. exige URL HTTP(S) válida antes de renderizar/redirecionar;
3. não dispara `tracking/click.registered` para crawlers de preview ou busca conhecidos;
4. mantém o evento para browser humano;
5. para preview crawler, retorna o HTML completo com OG/Twitter tags e não inclui `meta refresh` nem `window.location.href`;
6. para usuário normal, mantém redirect imediato via HTML para preservar a arquitetura existente de preview.

## Open Graph

Foram preservados:

- `og:type`;
- `og:url`;
- `og:title`;
- `og:description`;
- `og:image` e dimensões;
- tags Twitter;
- canonical URL do `/go`;
- `Cache-Control: no-store`.

## Métricas

Depois desta task, `tracking/click.registered` representa tráfego classificado como humano pelo gate da rota. Isso reduz contaminação por user-agents conhecidos de preview/busca, mas não é uma garantia absoluta contra todo bot existente.

## Testes adicionados

`src/tests/lib/go-request.test.ts` cobre:

- WhatsApp/Facebook/Telegram/Slack como preview crawlers;
- Chrome como tráfego humano;
- Googlebot/Bingbot/Applebot como tráfego não-humano;
- preservação byte a byte de `meli.la` e URL completa oficial;
- rejeição de destino vazio, inválido e `javascript:`.

## Critério de saída

- `/go` continua apontando para o destino persistido em `affiliate_links.original_url`;
- preview crawler consegue ler OG sem gerar clique humano e sem ser redirecionado automaticamente;
- browser humano gera tracking e segue para o destino afiliado.
