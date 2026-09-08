'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildTrendShadowComparison } = require('../trend-shadow-comparison.cjs');

function candidate(overrides = {}) {
  return {
    marketplace: 'Shopee',
    sourceItemId: '123',
    sourceUrl: 'https://shopee.com.br/product/123',
    title: 'Fone Bluetooth M90 Pro 5.3 TWS',
    currentPrice: 49.9,
    marketplaceMetrics: { itemId: '123' },
    monetization: { valid: true },
    freshness: { status: 'accepted' },
    curation: { eligible: true, score: 8.5 },
    opportunityMatch: { status: 'matched' },
    publication: { approved: true, clicks: 4 },
    ...overrides,
  };
}

function arm(candidates) {
  return { candidates };
}

test('compares legacy and Radar arms across the shadow decision dimensions', () => {
  const result = buildTrendShadowComparison({
    radarRunId: 'run-1',
    legacy: arm([
      candidate({ sourceItemId: 'l1', curation: { eligible: true, score: 7 } }),
      candidate({ sourceItemId: 'l2', currentPrice: null, monetization: { valid: false }, freshness: { status: 'rejected' }, curation: { eligible: false, score: 4 }, opportunityMatch: { status: 'no_match' }, publication: { approved: false, clicks: 0 } }),
    ]),
    radar: arm([
      candidate({ sourceItemId: 'r1', curation: { eligible: true, score: 9 }, publication: { approved: true, clicks: 6 } }),
      candidate({ sourceItemId: 'r2', marketplace: 'Mercado Livre', marketplaceMetrics: { itemId: 'MLB123' }, sourceUrl: 'https://www.mercadolivre.com.br/p/MLB123', curation: { eligible: true, score: 8 }, opportunityMatch: { status: 'no_match' }, publication: { approved: false, clicks: 0 } }),
    ]),
  });

  assert.equal(result.radarRunId, 'run-1');
  assert.equal(result.legacy.totalCandidates, 2);
  assert.equal(result.radar.totalCandidates, 2);
  assert.equal(result.legacy.validPrice, 1);
  assert.equal(result.radar.validPrice, 2);
  assert.equal(result.legacy.monetized, 1);
  assert.equal(result.radar.monetized, 2);
  assert.equal(result.legacy.freshAccepted, 1);
  assert.equal(result.radar.freshAccepted, 2);
  assert.equal(result.legacy.unmatchedOpportunities, 1);
  assert.equal(result.radar.unmatchedOpportunities, 1);
  assert.equal(result.legacy.approvedPublicationClicks, 4);
  assert.equal(result.radar.approvedPublicationClicks, 6);
  assert.equal(result.delta.validPrice, 1);
  assert.equal(result.delta.monetized, 1);
  assert.equal(result.delta.approvedPublicationClicks, 2);
  assert.equal(result.delta.averageQualityScore, 3);
});

test('does not infer freshness, clicks or quality when observational fields are absent', () => {
  const result = buildTrendShadowComparison({
    legacy: arm([candidate({ freshness: undefined, curation: undefined, publication: undefined })]),
    radar: arm([candidate({ freshness: undefined, curation: undefined, publication: undefined })]),
  });

  assert.equal(result.legacy.freshObserved, 0);
  assert.equal(result.legacy.freshAccepted, 0);
  assert.equal(result.legacy.averageQualityScore, null);
  assert.equal(result.legacy.approvedPublicationClicks, 0);
  assert.equal(result.delta.averageQualityScore, null);
});

test('counts identity and URL validity using Oracle validators', () => {
  const result = buildTrendShadowComparison({
    legacy: arm([
      candidate({ sourceItemId: '', marketplaceMetrics: {}, sourceUrl: 'not-a-url' }),
    ]),
    radar: arm([
      candidate({ sourceItemId: 'ok', marketplaceMetrics: { itemId: 'ok' }, sourceUrl: 'https://shopee.com.br/product/ok' }),
    ]),
  });

  assert.equal(result.legacy.validIdentity, 0);
  assert.equal(result.legacy.validOfferUrl, 0);
  assert.equal(result.radar.validIdentity, 1);
  assert.equal(result.radar.validOfferUrl, 1);
  assert.equal(result.delta.validIdentity, 1);
  assert.equal(result.delta.validOfferUrl, 1);
});

test('only counts clicks from approved publications', () => {
  const result = buildTrendShadowComparison({
    legacy: arm([candidate({ publication: { approved: false, clicks: 100 } })]),
    radar: arm([candidate({ publication: { approved: true, clicks: 3 } })]),
  });

  assert.equal(result.legacy.approvedPublicationClicks, 0);
  assert.equal(result.radar.approvedPublicationClicks, 3);
});
