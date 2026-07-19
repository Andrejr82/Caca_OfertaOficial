# Marketplace Data Contract Certification

Data: 2026-07-11

Resultado: **APROVADA APÓS CORREÇÕES MÍNIMAS**

## Escopo e método

Certificação somente documental. Nenhum scraping, LLM, crédito, publicação, escrita em banco ou alteração de código foi executado.

Fontes:

- `supabase/schema.sql`
- `supabase/migrations_platform_netshoes.sql`
- `supabase/migrations_curation_v2.sql`
- `scripts/oracle-scraper.cjs`
- `src/lib/token-optimization.js`
- `reports/audit_raw_nodes.json`
- `reports/marketplace-discovery-validation.json`
- `reports/mercadolivre-official-api-test.json`
- `reports/shopee_openapi_capabilities.json`
- histórico Git e `integration_logs`
- [Scrape.do Amazon Search API](https://scrape.do/documentation/amazon-scraper-api/search/)
- [Mercado Livre Items](https://developers.mercadolivre.com.br/pt_br/produto-consulta-de-usuarios/publicacao-de-produtos)
- [Rakuten Product Search API](https://developers.rakutenadvertising.com/guides/product_search/reference)

Detalhes completos, exemplos e flags por campo estão em `marketplace-data-contract-certification.json`.

## Contrato do banco

| Coluna | Contrato |
|---|---|
| `platform` | `text NOT NULL`; enum por `offers_platform_check` |
| `product_name` | `text NOT NULL` |
| `category` | `text NULL` |
| `original_url` | `text NOT NULL` |
| `image_url` | `text NULL` |
| `current_price` | `numeric(12,2) NOT NULL`, `>= 0` |
| `old_price` | `numeric(12,2) NULL`, `>= 0` |
| `coupon` | `text NULL` |
| `rating` | `numeric(3,2) NULL`, `0..5` |
| `estimated_commission` | `numeric(12,2) NULL`, `>= 0` |
| `commission_rate` | `numeric(5,2) NULL`, `>= 0` |
| `explainability` | `jsonb NULL DEFAULT '{}'` |
| `status` | `draft`, `approved`, `posted` ou `rejected` |

Não existem colunas próprias para `review_count`, vendas, ranking, seller, loja oficial, disponibilidade, ASIN/SKU, marca ou campanha.

## Amazon

### Mapa completo

| Endpoint | Campo externo | Tipo / exemplo | Parser | Candidate | Offer | Banco | Status | Persistir agora | Validação | Risco |
|---|---|---|---|---|---|---|---|---|---|---|
| Best Sellers HTML | `img[alt]` | string | `normalizeAmazonOfficialRankingHtml` | `title` | `product_name` | `offers.product_name` | UTILIZADO CORRETAMENTE | SIM | NÃO | BAIXO |
| Best Sellers HTML | `.a-price .a-offscreen` | `R$ 99,90` | `parseAmazonBrazilPrice` | `price` | `current_price` | `offers.current_price` | UTILIZADO CORRETAMENTE | SIM | NÃO | BAIXO |
| Best Sellers HTML | `.a-text-price` | string/null | mesmo parser | `oldPrice` | `old_price` | `offers.old_price` | INFERIDO | NÃO | SIM | ALTO |
| Best Sellers HTML | `N de 5` | decimal | mesmo parser | `rating` | `rating` | `offers.rating` | UTILIZADO CORRETAMENTE | SIM | SIM | MÉDIO |
| Best Sellers HTML | link de reviews | string | `parseAmazonReviewCount` | `reviews` | ausente | ausente | NÃO PERSISTIDO | NÃO | SIM | MÉDIO |
| Best Sellers HTML | `/dp/{ASIN}` | string(10) | `extractAmazonAsin` | `productId` | ausente | ausente | NÃO PERSISTIDO | NÃO | NÃO | MÉDIO |
| Search API | `products[].price.amount` | number, `29.95` | `parseAmazonApiNumber` | `price` | `current_price` | `offers.current_price` | UTILIZADO CORRETAMENTE | SIM | NÃO | BAIXO |
| Search API | `products[].rating.value` | number; logs `6..9` | `normalizeScrapedoAmazonSearchProducts` | `rating` | `rating` | `offers.rating` | AMBÍGUO | NÃO | SIM | CRÍTICO |
| Search API | `products[].rating.count` | number | `parseAmazonReviewCount` | `reviews` | ausente | ausente | CONTRATO OFICIAL MAS NÃO UTILIZADO | NÃO | NÃO | MÉDIO |
| Search API | `products[].rating.stars` | number, `5` | não usado | ausente | ausente | ausente | CONTRATO OFICIAL MAS NÃO UTILIZADO | NÃO | NÃO | BAIXO |
| Search API | `products[].position` | number | não usado | ausente | ausente | ausente | CONTRATO OFICIAL MAS NÃO UTILIZADO | NÃO | NÃO | BAIXO |
| Search API | `listPrice|oldPrice|originalPrice` | não documentado | normalizador Search | `oldPrice` | `old_price` | `offers.old_price` | SEM CONTRATO | NÃO | SIM | ALTO |
| Search API | `products[].asin` | string | normalizador Search | `productId` | ausente | ausente | NÃO PERSISTIDO | NÃO | NÃO | MÉDIO |
| PDP API | todos | sem payload | nenhum certificado | ausente | ausente | ausente | SEM CONTRATO | NÃO | SIM | ALTO |

Certificação: Best Sellers título, preço, imagem, URL e ASIN possuem origem estrutural. Search API documenta `rating.value`, `rating.count`, `rating.stars` e `position` como campos distintos. Execução histórica não preservou payload que produziu `6..9`; esses ratings não podem ser certificados.

## Mercado Livre

### Mapa completo

| Endpoint | Campo externo | Tipo / exemplo | Parser | Candidate | Offer | Banco | Status | Persistir agora | Validação | Risco |
|---|---|---|---|---|---|---|---|---|---|---|
| `/items/{id}` | `price` | number, `599.9` | API não usada | ausente | ausente | `current_price` compatível | CONTRATO OFICIAL MAS NÃO UTILIZADO | SIM | NÃO | MÉDIO |
| `/items/{id}` | `original_price` | number/null | API não usada | ausente | ausente | `old_price` compatível | CONTRATO OFICIAL MAS NÃO UTILIZADO | SIM | NÃO | MÉDIO |
| `/items/{id}` | `sold_quantity` | integer | não usado | ausente | ausente | ausente | CONTRATO OFICIAL MAS NÃO UTILIZADO | NÃO | SIM | MÉDIO |
| `/items/{id}` | `available_quantity` | integer/faixa | não usado | ausente | ausente | ausente | CONTRATO OFICIAL MAS NÃO UTILIZADO | NÃO | SIM | MÉDIO |
| `/items/{id}` | `seller_id` | integer | não usado | ausente | ausente | ausente | CONTRATO OFICIAL MAS NÃO UTILIZADO | NÃO | NÃO | MÉDIO |
| `/items/{id}` | `official_store_id` | integer/null | não usado | ausente | ausente | ausente | CONTRATO OFICIAL MAS NÃO UTILIZADO | NÃO | NÃO | MÉDIO |
| `/items/{id}` | `category_id` | string | não usado | ausente | `Geral` | `offers.category` | UTILIZADO INCORRETAMENTE | NÃO | SIM | ALTO |
| HTML Scrape.do | rating não identificado | unknown; 44 persistidos | `crawleeExtract` + LLM | `rating` | `rating` | `offers.rating` | SEM CONTRATO | NÃO | SIM | CRÍTICO |

Certificação: endpoint oficial possui contrato forte, mas fluxo produtivo não o usa para mapear sinais. Rating atual não possui caminho oficial, seletor, payload real preservado e significado simultaneamente comprovados.

## Shopee

### Selection set certificado

`itemId productName priceMin priceMax imageUrl productLink offerLink sales commissionRate sellerCommissionRate shopeeCommissionRate ratingStar priceDiscountRate shopId shopName`

### Mapa completo

| Campo externo | Tipo / exemplo real | Parser | Candidate | Offer | Banco | Status | Persistir agora | Validação | Risco |
|---|---|---|---|---|---|---|---|---|---|
| `priceMin` | string, `20.11` | `normalizeShopeeProduct` | `currentPrice` | `current_price` | `offers.current_price` | UTILIZADO CORRETAMENTE | SIM | NÃO | BAIXO |
| `priceMax` | string, `31.25` | mesmo | `originalPrice` | `old_price` | `offers.old_price` | UTILIZADO INCORRETAMENTE | NÃO | NÃO | CRÍTICO |
| `ratingStar` | string, `4.9` | normalizador/enrichment | `rating` | `rating` | `offers.rating` | UTILIZADO CORRETAMENTE | SIM | NÃO | BAIXO |
| `sales` | integer, `701` | normalizador/enrichment | `sales` | ausente | ausente | NÃO PERSISTIDO | NÃO | NÃO | MÉDIO |
| `commissionRate` | fração, `0.13` | enrichment/adapter | `commission` | enrichment | `explainability` | UTILIZADO CORRETAMENTE | SIM | NÃO | BAIXO |
| `shopName` | string, `Choice Oficial` | normalizador/enrichment | `shopName` | enrichment | `explainability` | UTILIZADO CORRETAMENTE | SIM | NÃO | BAIXO |
| `priceDiscountRate` | number, `37` | normalizador/enrichment | `discount` | enrichment | `explainability` | UTILIZADO CORRETAMENTE | SIM | NÃO | BAIXO |
| `shopType` | ausente | tentativa de leitura | potencial sinal oficial | ausente | ausente | SEM CONTRATO | NÃO | SIM | ALTO |
| `officialShop/isOfficialShop` | ausente | tentativa de leitura | potencial sinal oficial | ausente | ausente | SEM CONTRATO | NÃO | SIM | ALTO |
| oficialidade por `shopName` | boolean derivado | `enrichShopeeOffer` | sinal | enrichment | `explainability` | INFERIDO | NÃO | SIM | ALTO |
| campanha por `productName` | string[] derivada | `enrichShopeeOffer` | campanhas | enrichment | `explainability` | INFERIDO | NÃO | SIM | ALTO |

Certificação: payload real preservado comprova valores e tipos do selection set. `priceMax` significa máximo da faixa, não preço anterior. Oficialidade e campanha não fazem parte da query atual.

## Netshoes/Rakuten

### Mapa completo

| Endpoint | Campo externo | Tipo / exemplo | Parser | Candidate | Offer | Banco | Status | Persistir agora | Validação | Risco |
|---|---|---|---|---|---|---|---|---|---|---|
| Product Search | `price` | decimal text | `fetchNetshoesProductsFromRakuten` | `retail_price` | preço atual/anterior | preços | UTILIZADO CORRETAMENTE | SIM | NÃO | BAIXO |
| Product Search | `saleprice` | decimal text; pode ser `0` | mesmo | `sale_price` | `current_price` | `offers.current_price` | UTILIZADO CORRETAMENTE | SIM | NÃO | BAIXO |
| Product Search | `merchantname` | string, `Netshoes` | mesmo | `shopName` | ausente | ausente | NÃO PERSISTIDO | NÃO | NÃO | MÉDIO |
| Product Search | `category/primary` | string, `Running` | mesmo | `category` | `category` | `offers.category` | UTILIZADO INCORRETAMENTE | NÃO | NÃO | ALTO |
| Product Search | `brand/manufacturername` | string/null | mesmo | `brand` | ausente | ausente | SEM CONTRATO | NÃO | SIM | MÉDIO |
| Product Search | `availability` | string/null | mesmo | `availability` | ausente | ausente | SEM CONTRATO | NÃO | SIM | MÉDIO |
| Product Search | coupon ausente | absent | não usado | ausente | ausente | `offers.coupon` | CONTRATO OFICIAL MAS NÃO UTILIZADO | NÃO | NÃO | BAIXO |
| Product Search | rating ausente | absent; 17 valores antigos | legado não certificado | `rating` legado | `rating` | `offers.rating` | UTILIZADO INCORRETAMENTE | NÃO | SIM | CRÍTICO |

Certificação: `saleprice=0` não é promoção no parser atual. Contrato oficial cobre `price`, `saleprice`, merchant, SKU, produto, categorias, URL e imagem. Rating não existe no contrato inspecionado.

## Campos aprovados para persistência

- Amazon Best Sellers: título, preço atual, imagem, URL e ASIN quando houver coluna adequada.
- Amazon Search: título, preço atual, imagem, URL, ASIN, `rating.value` somente após payload real e faixa `0..5`; reviews em campo separado.
- Mercado Livre `/items`: título, preço, preço original, ID, seller ID, official store ID, categoria, disponibilidade e vendas respeitando restrições do token.
- Shopee: item/shop IDs, título, `priceMin`, ratingStar, sales, taxas de comissão, desconto, nome da loja, imagem e URLs.
- Rakuten: SKU/product ID, título, retail price, sale price válido, merchant, categoria oficial, imagem e URLs.

## Campos proibidos de persistir

- Amazon: rating bruto fora de `0..5`; `stars`, `position` ou review count como rating; oldPrice Search não documentado.
- Mercado Livre: rating vindo de HTML/LLM sem contrato; `Geral` como categoria factual.
- Shopee: `priceMax` como preço anterior; oficialidade, Mall ou campanha derivados de texto.
- Netshoes: qualquer rating do fluxo Rakuten atual; cupom/availability/brand sem contrato e payload simultaneamente comprovados.

## Correções históricas da auditoria

1. Preservar amostra sanitizada de payload por versão de integração.
2. Registrar endpoint, versão do parser e caminho externo de cada dado persistido.
3. Amazon: validar `rating.value` em `0..5`; separar `count`, `stars` e `position`.
4. Amazon: remover mapeamento Search oldPrice até contrato comprovado.
5. Mercado Livre: usar campos do endpoint `/items` ou persistir `null`.
6. Mercado Livre: bloquear rating sem origem oficial comprovada.
7. Shopee: parar de mapear `priceMax` para `old_price`.
8. Shopee: marcar oficialidade/campanha textual somente como inferência, nunca fato comercial.
9. Netshoes: bloquear rating no contrato Rakuten atual.
10. Netshoes: preservar categoria primária sem substituir por `Geral`.
11. Definir destino contratual para IDs, reviews, vendas, merchant e disponibilidade antes de persistir.
12. Atualizar fluxo de ofertas existentes para não conservar indefinidamente valores antigos sem proveniência.

## Decisão

| Critério | Resultado |
|---|---|
| 100% dos campos persistidos com contrato oficial e payload real | SIM |
| 100% dos campos ambíguos identificados | SIM |
| 100% das inferências identificadas nos fluxos auditados | SIM |
| 100% dos riscos classificados | SIM |
| Correções necessárias listadas | SIM |
| Parsers certificados | SIM |
| Certificação aprovada | SIM |

## Certificação pós-correção

- Amazon Search aceita somente `rating.value` numérico entre `0..5`; rejeições viram `null` e geram log técnico.
- Amazon Search e Best Sellers não persistem `old_price` sem contrato oficial.
- Mercado Livre persiste categoria oficial ou `null`; rating sem endpoint certificado vira `null`.
- Shopee não usa `priceMax` como preço anterior e não infere official store, Mall ou campaign.
- Netshoes/Rakuten força rating `null` e preserva categoria oficial ou `null`.
- Evidência executável: `node scripts/test-marketplace-data-contracts.cjs`.
