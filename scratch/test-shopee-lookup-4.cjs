require('dotenv').config({ path: '.env.local' });
const crypto = require('crypto');
const axios = require('axios');

async function callShopeeAffiliateApi(payload) {
  const ts = Math.floor(Date.now() / 1000);
  const sig = crypto.createHash('sha256').update(process.env.SHOPEE_APP_ID + ts + payload + process.env.SHOPEE_APP_SECRET).digest('hex');
  return axios.post('https://open-api.affiliate.shopee.com.br/graphql', payload, {
    headers: { 'Content-Type': 'application/json', Authorization: `SHA256 Credential=${process.env.SHOPEE_APP_ID}, Timestamp=${ts}, Signature=${sig}` }
  });
}

(async () => {
  const query = 'query ShopeePromotionOffers($keyword: String, $productCatId: Int, $page: Int, $limit: Int, $sortType: Int, $isAMSOffer: Boolean) { productOfferV2(keyword: $keyword, productCatId: $productCatId, page: $page, limit: $limit, sortType: $sortType, isAMSOffer: $isAMSOffer) { nodes { itemId productName priceMin priceMax imageUrl productLink offerLink shopId } } }';
  
  const payload = JSON.stringify({
    operationName: 'ShopeePromotionOffers',
    query,
    variables: { keyword: 'https://shopee.com.br/product/1183719086/22498117558', productCatId: null, page: 1, limit: 20, sortType: 2, isAMSOffer: false },
  });

  try {
    const response = await callShopeeAffiliateApi(payload);
    console.log(JSON.stringify(response.data, null, 2));
  } catch (e) {
    console.error(e.message);
  }
  process.exit(0);
})();
