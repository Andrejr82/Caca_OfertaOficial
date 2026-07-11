'use strict';

process.env.ORACLE_SCRAPER_DISABLE_AUTORUN = '1';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'dummy';
process.env.CEREBRAS_API_KEY = 'dummy';
process.env.SCRAPEDO_API_KEY = 'dummy';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const oracle = require('./oracle-scraper.cjs');

function amazonSearchContract() {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (message) => warnings.push(String(message));
  try {
    const result = oracle.normalizeScrapedoAmazonSearchProducts({ products: [
      { asin: 'B0AAAAAAA1', title: 'Valido', price: { amount: 10 }, rating: { value: 4.7, count: 900, stars: 5 }, reviewCount: '900', position: 1, badge: 'Best Seller', listPrice: { amount: 20 } },
      { asin: 'B0AAAAAAA2', title: 'Invalido', price: { amount: 20 }, rating: { value: 7, count: 7, stars: 5 }, oldPrice: 30 },
      { asin: 'B0AAAAAAA3', title: 'Sem origem', price: { amount: 30 }, rating: 4.8, originalPrice: 40 },
      { asin: 'B0AAAAAAA5', title: 'Tipo invalido', price: { amount: 40 }, rating: { value: '4.8' } }
    ] }, 4);

    assert.deepEqual(result.products.map((p) => p.rating), [4.7, null, null, null]);
    assert.deepEqual(result.products.map((p) => p.oldPrice), [null, null, null, null]);
    assert.deepEqual(result.products.map((p) => p.reviews), [null, null, null, null]);
    assert.ok(warnings.some((message) => message.includes('B0AAAAAAA2') && message.includes('7')));
  } finally {
    console.warn = originalWarn;
  }
}

function amazonBestSellersOldPriceContract() {
  assert.equal(typeof oracle.normalizeAmazonOfficialRankingHtml, 'function');
  const html = '<div class="zg-grid-general-faceout"><a href="/dp/B0AAAAAAA4"></a><img alt="Produto" src="x"><span class="a-price"><span class="a-offscreen">R$ 10,00</span></span><span class="a-text-price"><span class="a-offscreen">R$ 20,00</span></span></div>';
  const result = oracle.normalizeAmazonOfficialRankingHtml(html, 1, { label: 'Best Sellers', category: 'Eletronicos' });
  assert.equal(result.products[0].oldPrice, null);
}

function persistenceContract() {
  assert.equal(typeof oracle.applyMarketplaceDataContract, 'function');
  assert.deepEqual(
    oracle.applyMarketplaceDataContract({ rating: 4.9, category: 'Geral' }, 'Mercado Livre'),
    { rating: null, category: null }
  );
  assert.deepEqual(
    oracle.applyMarketplaceDataContract({ rating: 4.9, category: 'Eletronicos' }, 'Mercado Livre'),
    { rating: null, category: 'Eletronicos' }
  );
  assert.deepEqual(
    oracle.applyMarketplaceDataContract({ rating: 4.5, category: 'Geral' }, 'Netshoes'),
    { rating: null, category: null }
  );
  assert.deepEqual(
    oracle.applyMarketplaceDataContract({ rating: 4.5, category: 'Running' }, 'Netshoes'),
    { rating: null, category: 'Running' }
  );
}

function shopeeContract() {
  assert.equal(typeof oracle.normalizeShopeeProduct, 'function');
  assert.equal(typeof oracle.enrichShopeeOffer, 'function');
  const node = {
    itemId: 1,
    productName: 'Loja Oficial Black Friday',
    priceMin: '10',
    priceMax: '20',
    productLink: 'https://shopee.com.br/product/1/1',
    shopName: 'Shopee Mall Loja Oficial',
    ratingStar: '4.9'
  };
  assert.equal(oracle.normalizeShopeeProduct(node).old_price, null);
  const enriched = oracle.enrichShopeeOffer(node);
  assert.equal('is_official_store' in enriched, false);
  assert.equal('is_shopee_mall' in enriched, false);
  assert.equal('detected_campaigns' in enriched, false);
  const source = fs.readFileSync(require.resolve('./oracle-scraper.cjs'), 'utf8');
  assert.equal(source.includes('const oldPriceCandidate = parseShopeeMoney(node?.priceMax)'), false);
}

async function shopeeImageContract() {
  const imageUrl = 'https://cf.shopee.com.br/file/official-image.jpg';
  const node = {
    itemId: 22499056874,
    shopId: 1158053430,
    productName: 'Produto Shopee com imagem oficial',
    priceMin: '62.99',
    priceMax: '62.99',
    imageUrl,
    productLink: 'https://shopee.com.br/product/1158053430/22499056874',
    offerLink: 'https://s.shopee.com.br/teste',
    sales: 2000,
    commissionRate: '0.13',
    sellerCommissionRate: '0.10',
    shopeeCommissionRate: '0.03',
    ratingStar: '4.8',
    priceDiscountRate: 70,
    shopName: 'Loja Oficial'
  };
  const normalized = oracle.normalizeShopeeProduct(node);
  assert.equal(normalized.image_url, imageUrl);

  const { candidates } = await oracle.runShopeeOfficialPipeline('Computadores e Acessórios', 1, {
    mode: 'manual_review',
    historyStore: oracle.createShopeeHistoryStore(require('node:path').join(require('node:os').tmpdir(), `shopee-image-contract-${process.pid}.json`)),
    fetcher: async () => ({
      products: [{ ...normalized, categoria_original: 'Computadores e Acessórios' }],
      duplicatesRejected: 0,
      categoryStats: {},
      officialShopField: null
    })
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].image, imageUrl);
}

const tests = [amazonSearchContract, amazonBestSellersOldPriceContract, persistenceContract, shopeeContract, shopeeImageContract];
(async () => {
  let failures = 0;
  for (const test of tests) {
    try {
      await test();
      console.log(`PASS ${test.name}`);
    } catch (error) {
      failures++;
      console.error(`FAIL ${test.name}: ${error.message}`);
    }
  }
  process.exit(failures ? 1 : 0);
})();
