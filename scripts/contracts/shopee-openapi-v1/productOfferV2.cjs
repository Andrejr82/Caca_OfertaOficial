'use strict';

module.exports = {
  version: 'shopee-openapi-v1', operation: 'productOfferV2', executable: true,
  query: 'query ShopeePromotionOffers($keyword: String, $productCatId: Int, $page: Int, $limit: Int, $sortType: Int, $isAMSOffer: Boolean) { productOfferV2(keyword: $keyword, productCatId: $productCatId, page: $page, limit: $limit, sortType: $sortType, isAMSOffer: $isAMSOffer) { nodes { itemId shopId shopName productName productLink offerLink imageUrl priceMin priceMax ratingStar sales priceDiscountRate commissionRate shopeeCommissionRate sellerCommissionRate shopType productCatIds } pageInfo { page limit hasNextPage } } }',
  itemQueryTemplate: 'query ShopeePromotionOfferByItem { productOfferV2(itemId: ITEM_ID, page: 1, limit: 1) { nodes { itemId shopId shopName productName productLink offerLink imageUrl priceMin priceMax ratingStar sales priceDiscountRate commissionRate shopeeCommissionRate sellerCommissionRate shopType productCatIds } } }',
  fields: ['itemId','shopId','shopName','productName','productLink','offerLink','imageUrl','priceMin','priceMax','ratingStar','sales','priceDiscountRate','commissionRate','shopeeCommissionRate','sellerCommissionRate','shopType','productCatIds'],
  rejectedFields: [], requiredFields: ['itemId|keyword|productCatId','productName','priceMin|priceMax'], optionalFields: ['shopId','shopName','productLink','offerLink','imageUrl','ratingStar','sales','priceDiscountRate','commissionRate','shopeeCommissionRate','sellerCommissionRate','shopType','productCatIds'], commissionUnit: 'fraction_or_percent_runtime_normalize', risks: ['itemId query must be exact when enriching a known product', 'commission field semantics are not additive without official contract']
};
