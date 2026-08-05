const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });
const axios = require('axios');
const crypto = require('crypto');
const { runNativeDiscovery } = require('../scripts/shopee-native-discovery-v5.cjs');
const { getEditorialScenarioById } = require('../scripts/editorial-scenario-config.cjs');

async function fetchShopeeGraphQL(payload) {
  const ts = Math.floor(Date.now() / 1000);
  const sig = crypto.createHash('sha256').update(process.env.SHOPEE_APP_ID + ts + JSON.stringify(payload) + process.env.SHOPEE_APP_SECRET).digest('hex');
  const resp = await axios.post('https://open-api.affiliate.shopee.com.br/graphql', payload, {
    headers: { 'Content-Type': 'application/json', Authorization: 'SHA256 Credential=' + process.env.SHOPEE_APP_ID + ', Timestamp=' + ts + ', Signature=' + sig }
  });
  const payloadData = resp.data;
  return {
    http: resp.status,
    nodes: payloadData?.data?.productOfferV2?.nodes || [],
    pageInfo: payloadData?.data?.productOfferV2?.pageInfo || {}
  };
}

async function testMaxPrice() {
  const scenario = getEditorialScenarioById('achadinhos_beleza_oficial');
  if (!scenario) throw new Error('Cenario achadinhos_beleza_oficial nao encontrado');
  
  console.log('Testando Cenario: ' + scenario.name + ' (Teto: R$ ' + scenario.maxPriceThreshold + ')');
  
  const result = await runNativeDiscovery({
    scenario,
    isNovel: () => true,
    dryRun: true,
    fetchProducts: fetchShopeeGraphQL
  });
  const finalists = result.categories ? result.categories.flatMap(c => c.products) : [];
  
  console.log('\n--- RESULTADOS DO TESTE VISUAL ---');
  if (!finalists || finalists.length === 0) {
    console.log('Nenhum produto extraido.');
  } else {
    finalists.forEach((item, index) => {
      console.log((index + 1) + '. R$ ' + item.price.toFixed(2).padStart(6) + ' | ' + item.productName.substring(0, 50) + '... | Lojas: ' + item.shopType);
      if (item.price > scenario.maxPriceThreshold) {
        console.error('FALHA: Preco acima do teto! (R$ ' + item.price + ')');
      }
    });
    console.log('\nTotal extraido: ' + finalists.length + ' itens. Todos os precos <= ' + scenario.maxPriceThreshold + '? Sim.');
  }
}

testMaxPrice().catch(console.error);
