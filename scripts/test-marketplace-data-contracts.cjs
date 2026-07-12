'use strict';

process.env.ORACLE_SCRAPER_DISABLE_AUTORUN = '1';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'dummy';
process.env.CEREBRAS_API_KEY = 'dummy';
process.env.SCRAPEDO_API_KEY = 'dummy';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const oracle = require('./oracle-scraper.cjs');
const shopeeV5 = require('./shopee-native-discovery-v5.cjs');

function amazonV3HtmlContract() {
  assert.equal(typeof oracle.normalizeAmazonRankingRawHtmlV3, 'function');
  assert.equal(typeof oracle.normalizeAmazonOutletRawHtmlV3, 'function');
  const ranking = oracle.normalizeAmazonRankingRawHtmlV3(`
    <div data-asin="B0AAAAAAA1"><span class="zg-bdg-text">#1</span><a href="/dp/B0AAAAAAA1"><img src="https://m.media-amazon.com/images/I/a.jpg" alt="Produto V3 A"></a><span class="a-price"><span class="a-offscreen">R$ 10,00</span></span><span class="a-icon-alt">4,7 de 5 estrelas</span></div>
    <div data-asin="B0AAAAAAA2"><span class="zg-bdg-text">#2</span><a href="/dp/B0AAAAAAA2"><img src="https://m.media-amazon.com/images/I/b.jpg" alt="Produto V3 B"></a><span class="a-price"><span class="a-offscreen">R$ 20,00</span></span><span class="a-icon-alt">7,0 de 5 estrelas</span></div>
    <div data-asin="B0AAAAAAA2"><a href="/dp/B0AAAAAAA2"><img src="https://m.media-amazon.com/images/I/b2.jpg" alt="Duplicado"></a><span class="a-price"><span class="a-offscreen">R$ 30,00</span></span></div>
  `, { id: 'contract', category: 'Eletronicos' }, 5);
  const outlet = oracle.normalizeAmazonOutletRawHtmlV3(`
    <li class="a-carousel-card"><div class="dcl-product-wrapper"><a href="/Produto-Outlet/dp/B0AAAAAAA3">Produto Outlet40% offOfertaR$ 15,00</a><span class="a-price"><span class="a-offscreen">R$ 15,00</span></span><img src="https://m.media-amazon.com/images/I/c.jpg"><span class="a-icon-alt">4,5 de 5 estrelas</span></div></li>
  `, 5);

  assert.deepEqual(ranking.products.map((p) => p.rating), [4.7, null]);
  assert.deepEqual(ranking.products.map((p) => p.oldPrice), [null, null]);
  assert.deepEqual(ranking.products.map((p) => p.url), ['https://www.amazon.com.br/dp/B0AAAAAAA1', 'https://www.amazon.com.br/dp/B0AAAAAAA2']);
  assert.equal(ranking.stats.duplicates, 1);
  assert.equal(outlet.products[0].title, 'Produto Outlet');
  assert.equal(outlet.products[0].price, 15);
}

function amazonLegacySearchHtmlAbsentContract() {
  const source = fs.readFileSync(require.resolve('./oracle-scraper.cjs'), 'utf8');
  assert.equal(source.includes('normalizeScrapedoAmazonSearchProducts'), false);
  assert.equal(source.includes('normalizeAmazonOfficialRankingHtml'), false);
  assert.equal(source.includes('normalizeAmazonBestSellersRawHtmlV2'), false);
  assert.equal(source.includes('normalizeAmazonV2Json'), false);
  assert.equal(source.includes('fetchAmazonBestSellersV2'), false);
  assert.equal(source.includes('fetchAmazonDiscoveryV2'), false);
  assert.equal(source.includes('AMAZON_BEST_SELLERS_ELECTRONICS_URL'), false);
  assert.equal(source.includes('fetchAmazonProductsFromScrapedoApi'), false);
  assert.equal(source.includes('AMAZON_DISCOVERY_GENERIC_FALLBACK'), false);
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

function shopeeV5Contract() {
  assert.equal(typeof shopeeV5.validateShopeeV5Contract, 'function');
  const valid = {
    itemId: '22092998564',
    productCatId: '100001',
    category: 'New BAU Comm - Health',
    rating: 4.9,
    sales: 11651,
    discount: 35,
    commissionRate: 12,
    score: 90,
    status: 'pending_manual_review'
  };

  assert.deepEqual(shopeeV5.validateShopeeV5Contract(valid), { valid: true, errors: [] });
  assert.equal(shopeeV5.validateShopeeV5Contract({ ...valid, rating: null }).valid, true);
  assert.equal(shopeeV5.validateShopeeV5Contract({ ...valid, category: 'Geral' }).valid, false);
  assert.equal(shopeeV5.validateShopeeV5Contract({ ...valid, productCatId: null }).valid, false);
  assert.equal(shopeeV5.validateShopeeV5Contract({ ...valid, itemId: null }).valid, false);
  for (const status of ['pending_manual_review', 'selected', 'rejected', 'posted']) {
    assert.equal(shopeeV5.validateShopeeV5Contract({ ...valid, status }).valid, true);
  }
  assert.equal(shopeeV5.validateShopeeV5Contract({ ...valid, status: 'approved' }).valid, false);
  assert.equal(shopeeV5.validateShopeeV5Contract({ ...valid, copy: null }).valid, true);
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

const tests = [amazonV3HtmlContract, amazonLegacySearchHtmlAbsentContract, persistenceContract, shopeeContract, shopeeV5Contract, shopeeImageContract];
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
