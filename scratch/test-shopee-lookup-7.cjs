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
  const query = 'query ShopeePromotionOffers($keyword: String, $isAMSOffer: Boolean) { productOfferV2(keyword: $keyword, page: 1, limit: 20, sortType: 2, isAMSOffer: $isAMSOffer) { nodes { itemId productName priceMin priceMax imageUrl productLink offerLink shopId } } }';
  
  for (const itemId of ['58262957321', '18698093887']) {
    for (const ams of [true, false]) {
      const payload = JSON.stringify({
        operationName: 'ShopeePromotionOffers',
        query,
        variables: { keyword: itemId, isAMSOffer: ams },
      });
      try {
        const response = await callShopeeAffiliateApi(payload);
        console.log(`${itemId} (AMS: ${ams}): Nodes = ${response.data?.data?.productOfferV2?.nodes?.length || 0}`);
      } catch (e) {
        console.error(e.message);
      }
    }
  }
  process.exit(0);
})();
