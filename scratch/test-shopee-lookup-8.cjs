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
  const query = 'query ShopeePromotionOffers($itemId: Int64) { productOfferV2(itemId: $itemId, page: 1, limit: 20) { nodes { itemId productName priceMin priceMax imageUrl productLink offerLink shopId shopType } } }';
  
  for (const itemId of [58262957321, 18698093887]) {
    console.log('Testing itemId with itemId param:', itemId);
    const payload = JSON.stringify({
      operationName: 'ShopeePromotionOffers',
      query,
      variables: { itemId: itemId },
    });
    try {
      const response = await callShopeeAffiliateApi(payload);
      if (response.data.errors) {
         console.error('GraphQL Errors:', JSON.stringify(response.data.errors, null, 2));
      } else {
         console.log('Nodes found:', response.data?.data?.productOfferV2?.nodes?.length || 0);
         if (response.data?.data?.productOfferV2?.nodes?.length > 0) {
             console.log(response.data.data.productOfferV2.nodes[0]);
         }
      }
    } catch (e) {
      console.error(e.message);
    }
  }
  process.exit(0);
})();
