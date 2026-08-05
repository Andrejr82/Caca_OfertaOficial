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
  const payload = JSON.stringify({
    query: '{ productOfferV2(itemId: 58262957321, page: 1, limit: 20) { nodes { itemId productName priceMin priceMax shopType } } }'
  });
  try {
    const response = await callShopeeAffiliateApi(payload);
    console.log(JSON.stringify(response.data, null, 2));
  } catch (e) {
    console.error(e.message);
  }
})();
