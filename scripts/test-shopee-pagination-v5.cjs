'use strict';

const assert = require('node:assert/strict');
const {
  buildProductOfferPayload,
  runNativeDiscovery,
} = require('./shopee-native-discovery-v5.cjs');

function product(itemId) {
  return {
    itemId: String(itemId),
    shopId: '10',
    productName: `Produto ${itemId}`,
    productLink: `https://shopee.com.br/product-i.10.${itemId}`,
    imageUrl: `https://cf.shopee.com.br/${itemId}.jpg`,
    priceMin: '99.90',
    priceMax: '129.90',
    priceDiscountRate: '35',
    sales: 1000,
    ratingStar: '4.8',
    commissionRate: '12',
  };
}

async function payloadRequestsTwentyProducts() {
  const payload = buildProductOfferPayload('ração premium');
  assert.equal(payload.variables.page, 1);
  assert.equal(payload.variables.limit, 20);
  assert.equal(payload.variables.sortType, 2);
  assert.equal(payload.variables.isAMSOffer, true);
}

async function discoveryPaginatesAndKeepsTopTwenty() {
  const scenario = {
    productCatId: 100002,
    name: 'Dono de Pet',
    keywords: ['ração premium'],
  };
  const calls = [];
  const result = await runNativeDiscovery({
    scenario,
    fetchProducts: async (_category, payload) => {
      calls.push(payload.variables.page);
      if (payload.variables.page === 1) {
        return {
          http: 200,
          nodes: Array.from({ length: 20 }, (_, index) => product(index + 1)),
          pageInfo: { hasNextPage: true },
        };
      }
      return {
        http: 200,
        nodes: Array.from({ length: 5 }, (_, index) => product(index + 21)),
        pageInfo: { hasNextPage: false },
      };
    },
    isNovel: () => true,
    maxPagesPerKeyword: 2,
  });

  assert.deepEqual(calls, [1, 2]);
  assert.equal(result.metrics.raw, 25);
  assert.equal(result.metrics.deduplicated, 25);
  assert.equal(result.metrics.final, 20);
  assert.equal(result.metrics.pagesFetched, 2);
  assert.equal(result.metrics.emptyResponses, 0);
  assert.equal(result.categories[0].products.length, 20);
}

const tests = [payloadRequestsTwentyProducts, discoveryPaginatesAndKeepsTopTwenty];

(async () => {
  let failures = 0;
  for (const test of tests) {
    try {
      await test();
      console.log(`PASS ${test.name}`);
    } catch (error) {
      failures += 1;
      console.error(`FAIL ${test.name}: ${error.stack || error.message}`);
    }
  }
  process.exitCode = failures ? 1 : 0;
})();
