require('dotenv').config({ path: '.env.local' });
const { callShopeeAffiliateApi } = require('../scripts/oracle-scraper.cjs');

(async () => {
  const query = 'query ShopeePromotionOffers($keyword: String, $productCatId: Int, $page: Int, $limit: Int, $sortType: Int, $isAMSOffer: Boolean) { productOfferV2(keyword: $keyword, productCatId: $productCatId, page: $page, limit: $limit, sortType: $sortType, isAMSOffer: $isAMSOffer) { nodes { itemId productName priceMin priceMax imageUrl productLink offerLink shopId } } }';
  
  const payload = JSON.stringify({
    operationName: 'ShopeePromotionOffers',
    query,
    variables: { keyword: '22498117558', productCatId: null, page: 1, limit: 20, sortType: 2, isAMSOffer: false },
  });

  const response = await callShopeeAffiliateApi(payload);
  console.log(JSON.stringify(response.data, null, 2));
  process.exit(0);
})();
