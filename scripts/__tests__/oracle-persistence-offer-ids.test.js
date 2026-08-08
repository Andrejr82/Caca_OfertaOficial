'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolvePersistedOfferIds } = require('../oracle-scraper.cjs');

function createSupabase(rows) {
  return {
    from(table) {
      assert.equal(table, 'offers');
      return {
        select() { return this; },
        eq(column, value) { this.filters = [...(this.filters || []), [column, value]]; return this; },
        maybeSingle: async function () {
          const row = rows.find((candidate) => (this.filters || []).every(([column, value]) => candidate[column] === value));
          return { data: row ? { id: row.id } : null, error: null };
        },
      };
    },
  };
}

test('recovers updated Shopee offers when the RPC returns no offer_ids', async () => {
    const ids = await resolvePersistedOfferIds({
      marketplace: 'Shopee',
      rows: [{ user_id: 'tenant', platform: 'Shopee', shopee_item_id: 'item-1' }],
      rpcOfferIds: [],
      supabase: createSupabase([{ id: 'offer-1', user_id: 'tenant', platform: 'Shopee', shopee_item_id: 'item-1' }]),
    });
    assert.deepEqual(ids, ['offer-1']);
});

test('keeps all RPC ids and resolves missing identities for every marketplace', async () => {
    const ids = await resolvePersistedOfferIds({
      marketplace: 'Amazon',
      rows: [{ user_id: 'tenant', platform: 'Amazon', product_id: 'ASIN-1' }],
      rpcOfferIds: ['offer-existing'],
      supabase: createSupabase([{ id: 'offer-2', user_id: 'tenant', platform: 'Amazon', product_id: 'ASIN-1' }]),
    });
    assert.deepEqual(ids, ['offer-existing', 'offer-2']);
});
