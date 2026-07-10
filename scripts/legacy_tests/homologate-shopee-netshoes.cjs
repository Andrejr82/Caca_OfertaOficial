'use strict';

process.env.ORACLE_SCRAPER_DISABLE_AUTORUN = '1';
require('dotenv').config({ path: '.env.local' });

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  runShopeeOfficialPipeline,
  fetchShopeeOfficialDiscovery,
  scrapeStore,
  canonicalizeAmazonProductUrl,
  sanitizeAmazonProductsBeforeLlm,
  createShopeeHistoryStore
} = require('../oracle-scraper.cjs');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cacaoferta-marketplace-'));
}

function makeShopeeProduct(id, overrides = {}) {
  const itemId = String(overrides.itemId || id);
  const shopId = String(overrides.shopId || 9000 + id);
  const category = overrides.category || 'Eletrônicos';
  const productName = overrides.product_name || `Produto Premium ${itemId}`;
  return {
    product_name: productName,
    current_price: overrides.current_price ?? 199.9,
    old_price: overrides.old_price ?? 399.9,
    image_url: overrides.image_url || `https://cf.shopee.com.br/file/${itemId}.jpg`,
    original_url: overrides.original_url || `https://shopee.com.br/${productName.replace(/\s+/g, '-').toLowerCase()}-i.${shopId}.${itemId}`,
    affiliate_url: overrides.affiliate_url || `https://shopee.com.br/${productName.replace(/\s+/g, '-').toLowerCase()}-i.${shopId}.${itemId}?af_click_lookback=7d`,
    rating: overrides.rating ?? 4.9,
    sales: overrides.sales ?? 9000,
    category,
    categoria_original: category,
    platform: 'Shopee',
    marketplace: 'Shopee',
    shopee_item_id: itemId,
    shopee_shop_id: shopId,
    commission_rate: overrides.commission_rate ?? 0.18,
    discount_rate: overrides.discount_rate ?? 50,
    raw_node: {
      itemId,
      shopId,
      shopName: overrides.shopName || `Loja ${shopId}`,
      productName,
      productLink: overrides.original_url || `https://shopee.com.br/${productName.replace(/\s+/g, '-').toLowerCase()}-i.${shopId}.${itemId}`,
      offerLink: overrides.affiliate_url || `https://shopee.com.br/${productName.replace(/\s+/g, '-').toLowerCase()}-i.${shopId}.${itemId}?af_click_lookback=7d`,
      ratingStar: overrides.rating ?? 4.9,
      sales: overrides.sales ?? 9000,
      commissionRate: overrides.commission_rate ?? 0.18,
      priceDiscountRate: overrides.discount_rate ?? 50,
      imageUrl: overrides.image_url || `https://cf.shopee.com.br/file/${itemId}.jpg`
    }
  };
}

async function runWithHistoryFile(historyFile, fetcher) {
  const historyStore = createShopeeHistoryStore(historyFile);
  return runShopeeOfficialPipeline('Todas', 50, {
    mode: 'manual_review',
    historyStore,
    fetcher
  });
}

async function main() {
  const tempDir = createTempDir();
  const mockProducts = [
    makeShopeeProduct(101, { category: 'Eletrônicos' }),
    makeShopeeProduct(102, { category: 'Telefonia', current_price: 249.9, old_price: 499.9 }),
    makeShopeeProduct(101, { category: 'Eletrônicos' })
  ];
  const mockFetcher = async () => ({
    products: mockProducts,
    categories: ['Eletrônicos', 'Telefonia'],
    duplicatesRejected: 0,
    categoryStats: {
      Eletrônicos: { requested: 'Eletrônicos', received: 2, uniqueAfterFetch: 2, approved: 0 },
      Telefonia: { requested: 'Telefonia', received: 1, uniqueAfterFetch: 1, approved: 0 }
    },
    officialShopField: null
  });

  const results = {
    shopee: {},
    amazon: {}
  };

  const missingHistoryFile = path.join(tempDir, 'missing', 'shopee_seen_products.json');
  const missingRun = await runWithHistoryFile(missingHistoryFile, mockFetcher);
  assert(fs.existsSync(missingHistoryFile), 'History inexistente não foi criado');
  assert(missingRun.candidates.length >= 1, 'Pipeline não continuou após criar history');
  results.shopee.historyMissing = true;

  const emptyHistoryFile = path.join(tempDir, 'empty', 'shopee_seen_products.json');
  fs.mkdirSync(path.dirname(emptyHistoryFile), { recursive: true });
  fs.writeFileSync(emptyHistoryFile, '', 'utf8');
  const emptyRun = await runWithHistoryFile(emptyHistoryFile, mockFetcher);
  assert(emptyRun.candidates.length >= 1, 'Pipeline não continuou com history vazio');
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(emptyHistoryFile, 'utf8')), JSON.parse(fs.readFileSync(emptyHistoryFile, 'utf8')));
  results.shopee.historyEmpty = true;

  const corruptHistoryFile = path.join(tempDir, 'corrupt', 'shopee_seen_products.json');
  fs.mkdirSync(path.dirname(corruptHistoryFile), { recursive: true });
  fs.writeFileSync(corruptHistoryFile, '{invalid json', 'utf8');
  fs.writeFileSync(`${corruptHistoryFile}.bak`, JSON.stringify({ preserved: { itemId: '1' } }, null, 2), 'utf8');
  const corruptRun = await runWithHistoryFile(corruptHistoryFile, mockFetcher);
  const corruptArtifacts = fs.readdirSync(path.dirname(corruptHistoryFile)).filter((name) => name.includes('.corrupt-'));
  assert(corruptRun.candidates.length >= 1, 'Pipeline não continuou com history corrompido');
  assert(corruptArtifacts.length >= 1, 'Backup de history corrompido não foi preservado');
  results.shopee.historyCorrupt = true;

  const writeHistoryFile = path.join(tempDir, 'writes', 'shopee_seen_products.json');
  const writeStore = createShopeeHistoryStore(writeHistoryFile);
  writeStore.save('item:1', { itemId: '1', lastSeenAt: Date.now() });
  writeStore.save('item:2', { itemId: '2', lastSeenAt: Date.now() });
  JSON.parse(fs.readFileSync(writeHistoryFile, 'utf8'));
  results.shopee.atomicWrites = true;

  const duplicateHistoryFile = path.join(tempDir, 'duplicate', 'shopee_seen_products.json');
  const duplicateRun = await runWithHistoryFile(duplicateHistoryFile, mockFetcher);
  assert(duplicateRun.telemetry.duplicatesRejected >= 1, 'Duplicado no mesmo payload não foi removido');
  results.shopee.duplicatePayload = duplicateRun.telemetry.duplicatesRejected;

  const repeatHistoryFile = path.join(tempDir, 'repeat', 'shopee_seen_products.json');
  const repeatStore = createShopeeHistoryStore(repeatHistoryFile);
  const repeatFetcher = async () => ({
    products: [makeShopeeProduct(201, { category: 'Eletrônicos' })],
    categories: ['Eletrônicos'],
    duplicatesRejected: 0,
    categoryStats: {
      Eletrônicos: { requested: 'Eletrônicos', received: 1, uniqueAfterFetch: 1, approved: 0 }
    },
    officialShopField: null
  });
  const firstRepeat = await runShopeeOfficialPipeline('Todas', 50, { mode: 'manual_review', historyStore: repeatStore, fetcher: repeatFetcher });
  const secondRepeat = await runShopeeOfficialPipeline('Todas', 50, { mode: 'auto', historyStore: repeatStore, fetcher: repeatFetcher });
  assert(firstRepeat.candidates.length >= 1, 'Primeira execução deveria aceitar produto novo');
  assert(secondRepeat.telemetry.historyFilteredOut >= 1, 'Produto já no history não foi bloqueado');
  results.shopee.historyBlocksOld = true;

  const originalForceFlag = process.env.SHOPEE_OFFICIAL_FORCE_ERROR;
  process.env.SHOPEE_OFFICIAL_FORCE_ERROR = '1';
  const forcedFailure = await scrapeStore('Shopee');
  if (originalForceFlag === undefined) delete process.env.SHOPEE_OFFICIAL_FORCE_ERROR;
  else process.env.SHOPEE_OFFICIAL_FORCE_ERROR = originalForceFlag;
  assert(Array.isArray(forcedFailure) && forcedFailure.length === 0, 'Falha forçada ainda caiu no V4');
  results.shopee.v4BlockedOnFailure = true;

  const realHistoryFile = path.join(tempDir, 'real', 'shopee_seen_products.json');
  const realStore = createShopeeHistoryStore(realHistoryFile);
  let realPipeline = null;
  let realPipelineError = null;
  try {
    realPipeline = await runShopeeOfficialPipeline('Todas', 500, {
      mode: 'manual_review',
      historyStore: realStore,
      fetcher: (options) => fetchShopeeOfficialDiscovery({
        ...options,
        sortTypes: [2],
        pages: [1],
        limit: 10
      })
    });
    assert(realPipeline.telemetry.received > 0, 'API oficial não retornou produtos reais');
    results.shopee.officialApiWorking = true;
  } catch (error) {
    realPipelineError = error.message;
    results.shopee.officialApiWorking = false;
  }

  const amazonDirect = canonicalizeAmazonProductUrl('https://www.amazon.com.br/dp/B0C1234567?tag=abc');
  const amazonGpProduct = canonicalizeAmazonProductUrl('https://www.amazon.com.br/gp/product/B0C1234567/ref=something');
  const amazonGpAw = canonicalizeAmazonProductUrl('https://www.amazon.com.br/gp/aw/d/B0C1234567?psc=1');
  const amazonSponsored = canonicalizeAmazonProductUrl('https://sponsored-ads.amazon.com.br/clk?url=https%3A%2F%2Fwww.amazon.com.br%2Fgp%2Fproduct%2FB0C1234567%2Fref%3Dabc');
  const amazonSanitized = sanitizeAmazonProductsBeforeLlm([
    { product_url: 'https://www.amazon.com.br/dp/B0C1234567?tag=abc' },
    { product_url: 'https://www.amazon.com.br/gp/product/B0C1234567/ref=something' },
    { product_url: 'https://www.amazon.com.br/gp/aw/d/B0C1234567?psc=1' },
    { product_url: 'https://sponsored-ads.amazon.com.br/clk?url=https%3A%2F%2Fwww.amazon.com.br%2Fgp%2Fproduct%2FB0C1234567%2Fref%3Dabc' },
    { product_url: 'https://sponsored-ads.amazon.com.br/clk?foo=bar' }
  ]);

  assert.strictEqual(amazonDirect.url, 'https://www.amazon.com.br/dp/B0C1234567');
  assert.strictEqual(amazonGpProduct.url, 'https://www.amazon.com.br/dp/B0C1234567');
  assert.strictEqual(amazonGpAw.url, 'https://www.amazon.com.br/dp/B0C1234567');
  assert.strictEqual(amazonSponsored.url, 'https://www.amazon.com.br/dp/B0C1234567');
  assert.strictEqual(amazonSanitized.stats.sponsoredRejected, 1);
  assert.strictEqual(amazonSanitized.products.some((product) => String(product.product_url).includes('sponsored-ads.amazon.com.br')), false);

  results.amazon.canonicalization = true;
  results.amazon.received = amazonSanitized.stats.received;
  results.amazon.sentToLLM = amazonSanitized.stats.sentToLLM;
  results.amazon.sponsoredRejected = amazonSanitized.stats.sponsoredRejected;

  const report = {
    generatedAt: new Date().toISOString(),
    comparedFlow: {
      productionEntry: 'scrapeStore("Shopee")',
      testEntry: 'runShopeeOfficialPipeline("Todas", 50)',
      sameOfficialFunction: true,
      productionDifferenceFound: true,
      exactDifference: 'Produção chamava mesmo pipeline oficial, mas em erro caía no V4 legado; teste controlado permanece no pipeline oficial completo.'
    },
    shopee: {
      historyMissing: results.shopee.historyMissing,
      historyEmpty: results.shopee.historyEmpty,
      historyCorrupt: results.shopee.historyCorrupt,
      atomicWrites: results.shopee.atomicWrites,
      duplicatePayloadRejected: results.shopee.duplicatePayload,
      historyBlocksOld: results.shopee.historyBlocksOld,
      v4BlockedOnFailure: results.shopee.v4BlockedOnFailure,
      officialApiWorking: results.shopee.officialApiWorking,
      officialApiError: realPipelineError,
      categoriesRequested: realPipeline?.telemetry?.categoryStats ? Object.keys(realPipeline.telemetry.categoryStats) : [],
      categoryStats: realPipeline?.telemetry?.categoryStats || {},
      productsReceived: realPipeline?.telemetry?.received ?? 0,
      candidatesReturned: realPipeline?.telemetry?.returned ?? 0,
      duplicatesRejected: realPipeline?.telemetry?.duplicatesRejected ?? duplicateRun.telemetry.duplicatesRejected,
      historyRejected: realPipeline?.telemetry?.historyFilteredOut ?? 0,
      officialShopField: realPipeline?.telemetry?.officialShopField || null
    },
    amazon: results.amazon
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    fatal: true,
    message: error.message,
    stack: error.stack
  }, null, 2));
  process.exit(1);
});
