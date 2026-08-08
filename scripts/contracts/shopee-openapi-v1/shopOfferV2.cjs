'use strict';
module.exports = {
  version: 'shopee-openapi-v1', operation: 'shopOfferV2', executable: true,
  query: 'query ShopOfferV2($page: Int, $limit: Int) { shopOfferV2(page: $page, limit: $limit) { nodes { shopId shopName offerLink imageUrl commissionRate shopType } } }',
  fields: ['shopId','shopName','offerLink','imageUrl','commissionRate','shopType'], rejectedFields: ['itemId','productName','productLink','sellerCommissionRate','offerId','offerName'], requiredFields: ['offerLink'], optionalFields: ['shopId','shopName','imageUrl','commissionRate','shopType'], commissionUnit: 'fraction_or_percent_runtime_normalize', risks: ['node has no validated product identity', 'must resolve through productOfferV2 before Top']
};
