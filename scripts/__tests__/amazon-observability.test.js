'use strict';

const assert = require('node:assert/strict');
const { runAmazonScenarioDryRun } = require('../amazon-native-top20-v5.cjs');
const { runDiscoveryOnlyCycle } = require('../oracle-worker-discovery-only.cjs');

const scenario = {
  id: 'ferramentas_editorial',
  label: 'Ferramentas — Amazon Brasil',
  keywords: ['furadeira'],
  browseNodeIds: ['165793011'],
};

const productHtml = `
  <div data-component-type="s-search-result" data-asin="B08F2XQ36M">
    <h2>Furadeira Teste</h2>
    <img src="https://m.media-amazon.com/images/teste.jpg" alt="Furadeira Teste" />
    <span class="a-price"><span class="a-offscreen">R$ 99,90</span></span>
  </div>`;

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, text: async () => body };
}

async function run(fetchImpl, options = {}) {
  return runAmazonScenarioDryRun({
    scenario,
    fetchImpl,
    minDelayMs: 0,
    retryDelayMs: 0,
    maxRetries: 1,
    correlationId: 'correlation-test',
    schedulerSource: 'test',
    releaseId: 'commit-test',
    ...options,
  });
}

it('HTTP 200 com produtos registra query ok e contagens', async () => {
  const result = await run(async () => response(200, productHtml));
  const query = result.queryTelemetry[0];
  assert.equal(query.status, 'ok');
  assert.equal(query.http_status, 200);
  assert.equal(query.parser_count, 1);
  assert.equal(query.structurally_valid_count, 1);
  assert.equal(query.retry_count, 0);
  assert.ok(query.response_bytes > 0);
  assert.deepEqual(result.telemetryTotals, { attempted: 1, succeeded: 1, failed: 0, empty: 0 });
});

it('HTTP 200 com HTML sem matches registra parse_empty', async () => {
  const result = await run(async () => response(200, '<html><body>Amazon</body></html>'));
  assert.equal(result.queryTelemetry[0].status, 'parse_empty');
  assert.equal(result.telemetryTotals.empty, 1);
  assert.equal(result.sourceStatus, 'parse_zero');
});

it('HTTP 200 com corpo vazio registra empty_response', async () => {
  const result = await run(async () => response(200, ''));
  assert.equal(result.queryTelemetry[0].status, 'empty_response');
  assert.equal(result.sourceStatus, 'empty');
});

it('HTTP 403, 429 e 5xx registram http_error sem vazar detalhes', async () => {
  for (const status of [403, 429, 503]) {
    const result = await run(async () => response(status, 'blocked'));
    const query = result.queryTelemetry[0];
    assert.equal(query.status, 'http_error');
    assert.equal(query.http_status, status);
    assert.equal(query.response_bytes, Buffer.byteLength('blocked', 'utf8'));
    assert.equal(result.telemetryTotals.failed, 1);
    assert.equal(query.error_code, 'AMAZON_HTTP_ERROR');
  }
});

it('transport error registra transport_error', async () => {
  const result = await run(async () => { throw Object.assign(new Error('socket reset'), { code: 'ECONNRESET' }); });
  assert.equal(result.queryTelemetry[0].status, 'transport_error');
  assert.equal(result.queryTelemetry[0].error_code, 'ECONNRESET');
  assert.equal(result.telemetryTotals.failed, 1);
});

it('retry success registra tentativa final e retry_count', async () => {
  let calls = 0;
  const result = await run(async () => {
    calls += 1;
    if (calls === 1) throw new Error('temporary network error');
    return response(200, productHtml);
  });
  assert.equal(calls, 2);
  assert.equal(result.queryTelemetry[0].status, 'ok');
  assert.equal(result.queryTelemetry[0].attempt, 1);
  assert.equal(result.queryTelemetry[0].retry_count, 1);
  assert.equal(result.queryTelemetry[0].attempts.length, 2);
});

it('retry exhausted registra erro técnico, não empty', async () => {
  const result = await run(async () => { throw new Error('upstream unavailable'); });
  assert.equal(result.queryTelemetry[0].status, 'transport_error');
  assert.equal(result.queryTelemetry[0].retry_count, 1);
  assert.equal(result.sourceStatus, 'failed');
  assert.notEqual(result.sourceStatus, 'empty');
});

it('mixed queries registra sucesso e falha, com sourceStatus parcial', async () => {
  let calls = 0;
  const result = await run(async () => {
    calls += 1;
    if (calls === 1) return response(200, productHtml);
    throw new Error('one query failed');
  }, { scenario: { ...scenario, keywords: ['furadeira', 'trena'] } });
  assert.equal(result.telemetryTotals.attempted, 2);
  assert.equal(result.telemetryTotals.succeeded, 1);
  assert.equal(result.telemetryTotals.failed, 1);
  assert.equal(result.sourceStatus, 'partial');
});

it('global empty só ocorre quando todas queries executam sem erro e retornam zero real', async () => {
  const result = await run(async () => response(200, ''));
  assert.equal(result.products.length, 0);
  assert.equal(result.sourceStatus, 'empty');
  assert.equal(result.telemetryTotals.failed, 0);
  assert.equal(result.telemetryTotals.empty, 1);
});

it('telemetry não expõe secrets', async () => {
  const secret = 'super-secret-token';
  const result = await run(async () => { throw new Error(`request failed token=${secret}`); });
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(secret), false);
  assert.equal(result.queryTelemetry[0].fetch_path, 'global.fetch');
  assert.equal(result.queryTelemetry[0].provider, 'amazon_public_search');
});

it('discovery funnel persiste telemetry Amazon e marca erro técnico como partial', async () => {
  let metadata;
  const result = await runDiscoveryOnlyCycle({
    tenantId: 'tenant-test',
    correlationId: 'correlation-cycle',
    requestedAt: '2026-08-09T00:00:00.000Z',
    marketplaces: ['Amazon'],
    discover: async () => runAmazonScenarioDryRun({
      scenario,
      fetchImpl: async () => response(503, 'unavailable'),
      minDelayMs: 0,
      retryDelayMs: 0,
      maxRetries: 1,
      correlationId: 'correlation-cycle',
      schedulerSource: 'oracle-node-cron',
      releaseId: 'commit-cycle',
    }).then((discovery) => {
      const products = discovery.products;
      Object.defineProperty(products, '__discoveryFunnelMeta', { enumerable: false, value: { scenario: scenario.id, sourceStatus: discovery.sourceStatus, amazonTelemetry: discovery.telemetry } });
      return products;
    }),
    persist: async () => ({ accepted: 0, inserted: 0, updated: 0, offerIds: [] }),
    persistV2Metadata: async (value) => { metadata = value; },
    loadHistory: async () => [],
    loadDeferred: async () => [],
    scenarioResolver: () => scenario.id,
  });
  assert.equal(result.marketplaces[0].funnelContract.terminalStatus, 'partial_success');
  assert.equal(metadata.funnel.sourceTelemetry.total_queries_attempted, 1);
  assert.equal(metadata.funnel.sourceTelemetry.schedulerSource, 'oracle-node-cron');
});
