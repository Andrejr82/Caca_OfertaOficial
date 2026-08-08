'use strict';
module.exports = {
  version: 'shopee-openapi-v1', operation: 'shopeeOfferV2', executable: true,
  query: 'query ShopeeOfferV2($page: Int, $limit: Int) { shopeeOfferV2(page: $page, limit: $limit) { nodes { offerName offerLink imageUrl commissionRate } } }',
  fields: ['offerName','offerLink','imageUrl','commissionRate'], rejectedFields: ['itemId','shopId','shopName','productName','productLink','shopType','sellerCommissionRate','offerId'], requiredFields: ['offerLink'], optionalFields: ['offerName','imageUrl','commissionRate'], commissionUnit: 'fraction_or_percent_runtime_normalize', risks: ['node is campaign/offer metadata, not product identity', 'must resolve through productOfferV2 before Top']
};
