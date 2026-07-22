const assert = require('node:assert/strict');
const { runMercadoLivreOfficialIntentCoverage } = require('./mercadolivre-official-intents-v5.cjs');

const json = (value) => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });

runMercadoLivreOfficialIntentCoverage({
  accessToken: 'fixture-token',
  keywords: ['smartphone'],
  delayMs: 0,
  fetchImpl: async (url) => {
    if (url.includes('/domain_discovery/search')) return json([{ domain_id: 'MLB-CELLPHONES', category_id: 'MLB1055', category_name: 'Celulares e Smartphones' }]);
    if (url.includes('/highlights/')) return json({ content: [{ id: 'MLBPRODUCT1', type: 'PRODUCT' }] });
    if (url.includes('/products/MLBPRODUCT1/items')) return json({ results: [{ item_id: 'MLBITEM1' }] });
    if (url.endsWith('/products/MLBPRODUCT1')) return json({ name: 'Smartphone Fixture', pictures: [{ url: 'https://img.example/product.jpg' }], permalink: 'https://mercadolivre.com.br/fixture' });
    if (url.includes('/items?ids=')) return json([{ code: 200, body: { id: 'MLBITEM1', title: 'Smartphone Fixture', price: 999, original_price: 1299, permalink: 'https://mercadolivre.com.br/fixture', thumbnail: 'https://img.example/fixture.jpg', seller_id: 123 } }]);
    throw new Error(`URL fixture inesperada: ${url}`);
  }
}).then((result) => {
  assert.equal(result.queries[0].status, 'low_coverage');
  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].current_price, 999);
  assert.equal(result.products[0].category_id, 'MLB1055');
  console.log('PASS Mercado Livre official intent discovery fixture');
}).catch((error) => { console.error(error); process.exitCode = 1; });
