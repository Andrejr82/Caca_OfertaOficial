# Matriz de cupons por marketplace

## Contrato

Cupom é intenção comercial independente de categoria de produto. Não deve ser
tratado como `browse_node`, categoria ou subcategoria. A oferta só vira cupom
publicável quando existir código, campanha ou benefício verificável na fonte.

| Marketplace | Referência oficial | Tipo de dado | Acesso disponível no sistema | Regra |
|---|---|---|---|---|
| Mercado Livre | Cupons do vendedor / `SELLER_COUPON_CAMPAIGN` | Campanha com ou sem código; desconto aplicado no checkout | Não para anúncios de terceiros; API exige OAuth de vendedor | Não inventar cupom a partir de desconto de produto. |
| Amazon | Coupons/benefício no produto; Creators API `OffersV2` | Cupom pode ser benefício do item; `OffersV2` expõe preço/oferta, não catálogo público de cupons | Creators API não habilitada neste projeto | Só publicar cupom quando vier do payload oficial do item; ausência = sem cupom. |
| Shopee | Affiliate GraphQL `productOfferV2` | Oferta de produto | Disponível | `productOfferV2` não é feed de cupons; não gerar código sintético. |

## Fluxo manual

1. Usuário escolhe marketplaces no painel.
2. API consulta somente fontes oficiais configuradas.
3. Resultado sem evidência recebe status explicativo, não é persistido como cupom.
4. Copy usa `Código` somente com código real; caso contrário usa `Resgate na <marketplace>`.
5. Publicação permanece manual, com revisão.

## Por que Mercado Livre e Amazon retornavam zero

- O código antigo dependia de Scrapfly e de seletores HTML/estado interno que
  não pertencem à API oficial. Essa dependência foi removida.
- Mercado Livre documenta cupons no contexto do vendedor autenticado; não há
  feed público documentado para cupons de terceiros.
- Creators API/PA-API da Amazon documentam operações de catálogo, itens e
  ofertas, mas não operação pública de catálogo de cupons.

## Referências oficiais

- Mercado Livre: [Cupons do vendedor](https://developers.mercadolivre.com.br/pt_br/categorizacao-de-produtos/cupons-do-vendedor)
- Mercado Livre: [Permissões funcionais](https://developers.mercadolivre.com.br/pt_br/api-docs-pt-br/permissoes-funcionais)
- Amazon: [Creators API](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/introduction)
- Amazon: [OffersV2](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/api-reference/resources/offersV2)
