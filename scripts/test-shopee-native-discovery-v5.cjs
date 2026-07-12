'use strict';

const assert = require('node:assert/strict');
const {
  buildProductOfferPayload,
  loadCertifiedCatalog,
  runNativeDiscovery
} = require('./shopee-native-discovery-v5.cjs');

function product(itemId, overrides = {}) {
  return {
    itemId: String(itemId),
    shopId: '10',
    productName: `Produto ${itemId}`,
    productLink: `https://shopee.com.br/product-i.10.${itemId}`,
    offerLink: `https://s.shopee.com.br/${itemId}`,
    imageUrl: `https://cf.shopee.com.br/${itemId}.jpg`,
    priceMin: '99.90',
    priceMax: '129.90',
    priceDiscountRate: '35',
    sales: 1000 + Number(itemId),
    ratingStar: '4.8',
    commissionRate: '12',
    sellerCommissionRate: '7',
    shopeeCommissionRate: '5',
    shopName: 'Loja Oficial',
    productCatIds: ['100001'],
    ...overrides
  };
}

async function catalogHasExactly30CertifiedCategories() {
  const catalog = loadCertifiedCatalog();
  assert.equal(catalog.categories.length, 30);
  assert.ok(catalog.certifiedAt);
  assert.deepEqual(catalog.categories.map((category) => category.order), Array.from({ length: 30 }, (_, i) => i + 1));
  assert.ok(catalog.categories.every((category) => category.productCatId && category.name && category.active === true));
}

async function payloadUsesProductCatIdAndNeverKeyword() {
  const payload = buildProductOfferPayload('100001');
  assert.equal(payload.variables.productCatId, 100001);
  assert.match(payload.query, /\$productCatId: Int!/);
  assert.equal(payload.variables.sortType, 2);
  assert.equal(payload.variables.page, 1);
  assert.equal(payload.variables.limit, 50);
  assert.doesNotMatch(payload.query, /keyword/i);
  assert.equal(Object.hasOwn(payload.variables, 'keyword'), false);
}

async function pipelineSanitizesDeduplicatesRanksAndAppliesNovelty() {
  const categories = loadCertifiedCatalog().categories.slice(0, 2);
  const duplicate = product(1);
  const calls = [];
  const result = await runNativeDiscovery({
    categories,
    fetchProducts: async (category, payload) => {
      calls.push({ category, payload });
      if (category.productCatId === categories[0].productCatId) {
        return { http: 200, nodes: [duplicate, product(2), product(3, { productName: '' })] };
      }
      return { http: 200, nodes: [duplicate, product(4), product(5)] };
    },
    isNovel: (candidate) => candidate.itemId !== '5'
  });

  assert.equal(calls.length, 2);
  assert.ok(calls.every(({ payload }) => !JSON.stringify(payload).toLowerCase().includes('keyword')));
  assert.equal(result.metrics.raw, 6);
  assert.equal(result.metrics.sanitized, 5);
  assert.equal(result.metrics.deduplicated, 4);
  assert.equal(result.metrics.final, 3);
  assert.equal(result.categories[0].products.length, 2);
  assert.equal(result.categories[1].products.length, 1);
  assert.ok(result.categories.flatMap((category) => category.products).every((candidate) => candidate.status === 'pending_manual_review'));
  assert.ok(result.categories.flatMap((category) => category.products).every((candidate) => Number.isFinite(candidate.score)));
  assert.equal(result.aiCalled, false);
  assert.equal(result.postsCreated, 0);
}

async function pipelineKeepsOnlyTop20PerCategory() {
  const [category] = loadCertifiedCatalog().categories;
  const nodes = Array.from({ length: 50 }, (_, index) => product(index + 1, { sales: index + 1 }));
  const result = await runNativeDiscovery({
    categories: [category],
    fetchProducts: async () => ({ http: 200, nodes }),
    isNovel: () => true
  });
  assert.equal(result.metrics.raw, 50);
  assert.equal(result.metrics.final, 20);
  assert.equal(result.categories[0].products.length, 20);
  assert.ok(result.categories[0].products[0].sales >= result.categories[0].products[19].sales);
}

async function http429StopsCategoryWithoutRetry() {
  const [category] = loadCertifiedCatalog().categories;
  let calls = 0;
  const result = await runNativeDiscovery({
    categories: [category],
    fetchProducts: async () => {
      calls++;
      return { http: 429, retryAfter: '120', nodes: [] };
    },
    isNovel: () => true
  });
  assert.equal(calls, 1);
  assert.equal(result.categories[0].error.http, 429);
  assert.equal(result.categories[0].error.retryAfter, '120');
  assert.equal(result.calls, 1);
}

async function persistenceReceivesOnlyFinalistsAndNeverRunsOnDryRun() {
  const [category] = loadCertifiedCatalog().categories;
  const nodes = Array.from({ length: 50 }, (_, index) => product(index + 1));
  const persisted = [];
  await runNativeDiscovery({
    categories: [category],
    fetchProducts: async () => ({ http: 200, nodes }),
    isNovel: () => true,
    persistFinalists: async (products) => persisted.push(...products)
  });
  assert.equal(persisted.length, 20);
  assert.ok(persisted.every((candidate) => candidate.status === 'pending_manual_review'));

  let dryRunWrites = 0;
  await runNativeDiscovery({
    categories: [category],
    fetchProducts: async () => ({ http: 200, nodes }),
    isNovel: () => true,
    dryRun: true,
    persistFinalists: async () => dryRunWrites++
  });
  assert.equal(dryRunWrites, 0);
}

const tests = [
  catalogHasExactly30CertifiedCategories,
  payloadUsesProductCatIdAndNeverKeyword,
  pipelineSanitizesDeduplicatesRanksAndAppliesNovelty,
  pipelineKeepsOnlyTop20PerCategory,
  http429StopsCategoryWithoutRetry,
  persistenceReceivesOnlyFinalistsAndNeverRunsOnDryRun
];

(async () => {
  let failures = 0;
  for (const test of tests) {
    try {
      await test();
      console.log(`PASS ${test.name}`);
    } catch (error) {
      failures++;
      console.error(`FAIL ${test.name}: ${error.stack || error.message}`);
    }
  }
  process.exitCode = failures ? 1 : 0;
})();
