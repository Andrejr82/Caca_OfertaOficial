'use strict';

process.env.ORACLE_SCRAPER_DISABLE_AUTORUN = '1';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'dummy';
process.env.CEREBRAS_API_KEY = 'dummy';
process.env.SCRAPEDO_API_KEY = 'dummy';

const assert = require('node:assert/strict');
const oracle = require('./oracle-scraper.cjs');

const EXTERNAL_ID = Buffer.from('Shopee_21235699753_711418084').toString('base64');
const OFFER_UUID = '12345678-aaaa-4bbb-8ccc-123456789000';
const EXISTING_UUID = '87654321-aaaa-4bbb-8ccc-123456789000';

function shopeeCandidate(overrides = {}) {
  return {
    id: EXTERNAL_ID,
    candidateId: EXTERNAL_ID,
    store: 'Shopee',
    affiliateUrl: 'https://s.shopee.com.br/teste',
    score: 77,
    product: {
      product_name: 'Produto Shopee Oficial',
      current_price: 99.9,
      old_price: null,
      image_url: 'https://cf.shopee.com.br/file/image.jpg',
      category: 'Computadores e Acessórios',
      rating: 4.8
    },
    ...overrides
  };
}

async function externalIdNeverReachesUuidLink() {
  assert.equal(typeof oracle.ensureShopeeOfferIdentity, 'function');

  const calls = [];
  const item = shopeeCandidate();
  const result = await oracle.ensureShopeeOfferIdentity(item, {
    upsertOffer: async (product, store, affiliateUrl) => {
      calls.push({ product, store, affiliateUrl });
      return { id: OFFER_UUID, isNew: true, score: 81 };
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.offerId, OFFER_UUID);
  assert.equal(item.id, OFFER_UUID);
  assert.equal(item.offerId, OFFER_UUID);
  assert.equal(item.externalProductId, EXTERNAL_ID);
  assert.equal(item.candidateId, EXTERNAL_ID);
  assert.equal(item.score, 81);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].store, 'Shopee');

  const subId = oracle.createSubId('telegram', item.id);
  assert.equal(subId, 'tg_12345678');
  assert.doesNotMatch(subId, /U2hvcGVl/);
}

async function existingOfferUuidIsReusedWithoutDuplicateUpsert() {
  assert.equal(typeof oracle.ensureShopeeOfferIdentity, 'function');

  let upsertCalls = 0;
  const item = shopeeCandidate({ id: EXISTING_UUID, offerId: EXISTING_UUID });
  const result = await oracle.ensureShopeeOfferIdentity(item, {
    upsertOffer: async () => {
      upsertCalls++;
      throw new Error('upsert should not run for existing UUID');
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.offerId, EXISTING_UUID);
  assert.equal(item.id, EXISTING_UUID);
  assert.equal(item.externalProductId, EXTERNAL_ID);
  assert.equal(upsertCalls, 0);
}

const tests = [externalIdNeverReachesUuidLink, existingOfferUuidIsReusedWithoutDuplicateUpsert];
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
