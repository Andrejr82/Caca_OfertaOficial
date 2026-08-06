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

async function testOldWay(itemId) {
  const query = 'query ShopeePromotionOffers($keyword: String, $productCatId: Int, $page: Int, $limit: Int, $sortType: Int, $isAMSOffer: Boolean) { productOfferV2(keyword: $keyword, productCatId: $productCatId, page: $page, limit: $limit, sortType: $sortType, isAMSOffer: $isAMSOffer) { nodes { itemId productName priceMin priceMax imageUrl productLink offerLink shopId } } }';
  const payload = JSON.stringify({
    operationName: 'ShopeePromotionOffers',
    query,
    variables: { keyword: itemId, productCatId: null, page: 1, limit: 20, sortType: 2, isAMSOffer: true },
  });
  const res = await callShopeeAffiliateApi(payload);
  return res.data?.data?.productOfferV2?.nodes?.length || 0;
}

async function testNewWay(itemId) {
  // We use itemId directly in the query string because some GraphQL clients struggle with Int64 variables
  const query = `{ productOfferV2(itemId: ${itemId}, page: 1, limit: 20) { nodes { itemId productName priceMin priceMax imageUrl productLink offerLink shopId shopType } } }`;
  const payload = JSON.stringify({ query });
  const res = await callShopeeAffiliateApi(payload);
  return res.data?.data?.productOfferV2?.nodes?.length || 0;
}

(async () => {
  const testIds = ['58262957321', '18698093887'];
  console.log('--- INICIANDO TESTE COMPARATIVO ---');
  
  for (const id of testIds) {
    console.log(`\nTestando Produto ID: ${id}`);
    
    // Método Antigo (keyword)
    const oldNodes = await testOldWay(id);
    console.log(`Método Antigo (via keyword): Encontrou ${oldNodes} itens.`);
    
    // Método Novo (itemId)
    const newNodes = await testNewWay(id);
    console.log(`Método Novo (via itemId numérico): Encontrou ${newNodes} itens.`);
    
    if (newNodes > 0 && oldNodes === 0) {
      console.log('✅ SUCESSO: O novo método conseguiu burlar o bloqueio e encontrou o item!');
    }
  }
})();
