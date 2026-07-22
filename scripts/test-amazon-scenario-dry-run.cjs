const assert = require('node:assert/strict');
const { parseSearchPage, runAmazonScenarioDryRun } = require('./amazon-native-top20-v5.cjs');

const html = `
<div data-component-type="s-search-result" data-asin="B000000001">
  <h2>Air Fryer Mondial 5L 220V</h2><a href="/dp/B000000001">produto</a>
  <img src="https://images.example/1.jpg" alt="Air Fryer Mondial 5L 220V"><span class="a-price"><span class="a-offscreen">R$ 199,90</span></span>
</div>
<div data-component-type="s-search-result" data-asin="B000000002">
  <h2>Cesto de silicone para Air Fryer</h2><a href="/dp/B000000002">produto</a>
  <img src="https://images.example/2.jpg" alt="Cesto de silicone para Air Fryer"><span class="a-price"><span class="a-offscreen">R$ 29,90</span></span>
</div>`;

assert.equal(parseSearchPage(html, { keyword: 'air fryer', source_url: 'https://www.amazon.com.br/s?k=air%20fryer', node_id: '900000', parent_node_id: '999999' }).length, 2);

runAmazonScenarioDryRun({ scenario: { label: 'Fixture', keywords: ['air fryer'] }, minDelayMs: 0, retryDelayMs: 0, fetchImpl: async () => new Response(html, { status: 200 }) })
  .then((result) => {
    assert.equal(result.products.length, 2);
    assert.equal(result.raw_products, 2);
    assert.equal(result.http_calls, 1);
    let attempts = 0;
    return runAmazonScenarioDryRun({
      scenario: { label: 'Retry fixture', keywords: ['air fryer'] },
      minDelayMs: 0,
      retryDelayMs: 0,
      maxRetries: 1,
      fetchImpl: async () => new Response(attempts++ === 0 ? '<html></html>' : html, { status: 200 })
    });
  })
  .then((result) => {
    assert.equal(result.products.length, 2);
    assert.equal(result.queries[0].status, 'ok');
    assert.equal(result.queries[0].retry_count, 1);
    assert.equal(result.http_calls, 2);
    console.log('PASS Amazon scenario dry-run fixture and bounded retry');
  })
  .catch((error) => { console.error(error); process.exitCode = 1; });
