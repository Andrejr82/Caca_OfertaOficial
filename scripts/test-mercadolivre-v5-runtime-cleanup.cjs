const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('tsx/cjs');

const root = path.join(__dirname, '..');
const scraper = fs.readFileSync(path.join(root, 'src/lib/affiliates/scraper.ts'), 'utf8');
const aiRoute = fs.readFileSync(path.join(root, 'src/app/api/ai/generate/route.ts'), 'utf8');
const { assertMercadoLivreSelected } = require(path.join(root, 'src/lib/offers/mercadolivre-manual-curation.ts'));

function testLegacyRuntimeDisconnected() {
  for (const marker of [
    'export async function fetchTrendingProductsFromLanding',
    'async function scrapeMercadoLivreProductDetails',
    'source === "Mercado Livre"',
    'return scrapeMercadoLivreProductDetails'
  ]) {
    assert.equal(scraper.includes(marker), false, `legado ainda presente: ${marker}`);
  }
}

function testAiGateIsFailClosed() {
  for (const status of ['pending_manual_review', 'rejected', 'posted', 'draft', 'unknown', null]) {
    assert.throws(
      () => assertMercadoLivreSelected({ platform: 'Mercado Livre', status }),
      /seleção manual/i
    );
  }
  assert.doesNotThrow(() => assertMercadoLivreSelected({ platform: 'Mercado Livre', status: 'selected' }));
  for (const platform of ['mercado livre', 'MERCADO LIVRE', 'mercado-livre', 'mercadolivre']) {
    assert.throws(
      () => assertMercadoLivreSelected({ platform, status: 'pending_manual_review' }),
      /seleção manual/i
    );
  }
  assert.throws(
    () => assertMercadoLivreSelected({ platform: undefined, status: 'selected' }),
    /marketplace/i
  );
  assert.doesNotThrow(() => assertMercadoLivreSelected({ platform: 'Shopee', status: 'pending_manual_review' }));
  assert.equal(aiRoute.includes('assertMercadoLivreSelected'), true);
}

for (const test of [testLegacyRuntimeDisconnected, testAiGateIsFailClosed]) {
  try {
    test();
    console.log(`PASS ${test.name}`);
  } catch (error) {
    console.error(`FAIL ${test.name}: ${error.message}`);
    process.exitCode = 1;
  }
}
