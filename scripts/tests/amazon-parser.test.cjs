'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { parseRankingPage, parseSearchPage, runAmazonScenarioDryRun } = require('../amazon-native-top20-v5.cjs');
const { SCENARIOS: AMAZON_SCENARIOS } = require('../amazon-scenario-config.cjs');
const { getMarketplaceScenarioContract } = require('../marketplace-scenario-contracts.cjs');

test('Discovery por browse node usa URL pública e não gera IDs sintéticos', async () => {
  const requests = [];
  const html = `
    <div data-component-type="s-search-result" data-asin="B08F2XQ36M">
      <h2><a href="/dp/B08F2XQ36M">Cafeteira Elétrica Teste</a></h2>
      <img src="https://m.media-amazon.com/images/I/teste.jpg" alt="Cafeteira Elétrica Teste" />
      <span class="a-price"><span class="a-offscreen">R$ 99,90</span></span>
    </div>`;
  const result = await runAmazonScenarioDryRun({
    scenario: { label: 'Eletros de Cozinha', keywords: ['cafeteira'], browseNodeIds: ['17124722011'] },
    fetchImpl: async (url) => {
      requests.push(url);
      return { ok: true, status: 200, text: async () => html };
    },
    minDelayMs: 0,
    maxRetries: 0,
  });
  assert.equal(requests[0], 'https://www.amazon.com.br/s?k=cafeteira&rh=n:17124722011');
  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].node_id, '17124722011');
  assert.equal(result.products[0].parent_node_id, null);
  assert.match(result.products[0].source_url, /rh=n:17124722011/);
});

test('todos os cenários Amazon executam consulta categorizada com contrato válido', async () => {
  const html = `<div data-component-type="s-search-result" data-asin="B08F2XQ36M"><h2>Produto Amazon Teste</h2><img src="https://m.media-amazon.com/images/teste.jpg" alt="Produto Amazon Teste" /><span class="a-price"><span class="a-offscreen">R$ 99,90</span></span></div>`;
  for (const scenarioId of Object.keys(AMAZON_SCENARIOS)) {
    if (['grandes_ofertas_editorial', 'cupons_aprovados_editorial'].includes(scenarioId)) continue;
    const contract = getMarketplaceScenarioContract(scenarioId, 'Amazon');
    const requests = [];
    const result = await runAmazonScenarioDryRun({
      scenario: contract,
      fetchImpl: async (url) => { requests.push(url); return { ok: true, status: 200, text: async () => html }; },
      minDelayMs: 0,
      maxRetries: 0,
    });
    assert.equal(requests.length, contract.keywords.length, `${scenarioId} não consultou todos os aliases`);
    assert.ok(requests.every((url) => /(?:rh=n:|rh=n%3A)\d{6,}/.test(url)), `${scenarioId} sem filtro de browse node`);
    assert.equal(result.products.length, 1, `${scenarioId} não deduplicou produto de teste`);
  }
});

test('Parser Amazon: HTML com Prime, desconto, rating e coupon', () => {
  const html = `
    <div data-asin="B08F2XQ36M">
      <span class="zg-bdg-text"># 1</span>
      <a href="/dp/B08F2XQ36M">Smart TV Samsung</a>
      <img src="tv.jpg" alt="Smart TV Samsung" />
      <span class="a-price"><span class="a-offscreen">R$ 2.000,00</span></span>
      <span class="a-text-price"><span class="a-offscreen">R$ 2.500,00</span></span>
      <i class="a-icon-prime"></i>
      <span class="s-coupon-highlight-color">Cupom R$ 100</span>
      <i class="a-icon-star-small">4,5 de 5 estrelas</i>
      <a href="#customerReviews"><span class="a-size-small">1.234 avaliações</span></a>
    </div>
  `;
  const source = { category: 'Eletrônicos', subcategory: 'TV', node_id: '123', parent_node_id: '456', source_url: 'http' };
  
  const results = parseRankingPage(html, source);
  assert.equal(results.length, 1);
  const p = results[0];
  
  assert.equal(p.price, 2000);
  assert.equal(p.original_price, 2500);
  assert.equal(p.discount, 20); // ((2500 - 2000) / 2500) * 100
  
  assert.equal(p.marketplaceMetrics.prime, true);
  assert.equal(p.marketplaceMetrics.coupon, true);
  assert.equal(p.marketplaceMetrics.rating, 4.5);
  assert.equal(p.marketplaceMetrics.reviewCount, 1234);
});

test('Parser Amazon: HTML sem dados comerciais disponíveis', () => {
  const html = `
    <div data-asin="B08F2XQ36X">
      <span class="zg-bdg-text"># 2</span>
      <a href="/dp/B08F2XQ36X">Livro Teste</a>
      <img src="livro.jpg" alt="Livro Teste" />
      <span class="a-price"><span class="a-offscreen">R$ 50,00</span></span>
    </div>
  `;
  const source = { category: 'Livros', subcategory: 'Teste', node_id: '123', parent_node_id: '456', source_url: 'http' };
  
  const results = parseRankingPage(html, source);
  assert.equal(results.length, 1);
  const p = results[0];
  
  assert.equal(p.price, 50);
  assert.equal(p.original_price, null);
  assert.equal(p.discount, null);
  
  assert.equal(p.marketplaceMetrics.prime, false);
  assert.equal(p.marketplaceMetrics.coupon, false);
  assert.equal(p.marketplaceMetrics.rating, null);
  assert.equal(p.marketplaceMetrics.reviewCount, null);
});

test('Parser Amazon: original_price menor ou igual ao price (não calcular desconto)', () => {
  const html = `
    <div data-asin="B08F2XQ36Y">
      <span class="zg-bdg-text"># 3</span>
      <a href="/dp/B08F2XQ36Y">Produto Inconsistente</a>
      <img src="prod.jpg" alt="Prod" />
      <span class="a-price"><span class="a-offscreen">R$ 100,00</span></span>
      <span class="a-text-price"><span class="a-offscreen">R$ 100,00</span></span>
    </div>
  `;
  const source = { category: 'A', subcategory: 'B', node_id: '1', parent_node_id: '2', source_url: 'http' };
  
  const results = parseRankingPage(html, source);
  assert.equal(results.length, 1);
  const p = results[0];
  
  assert.equal(p.price, 100);
  assert.equal(p.original_price, null); // Deve ser anulado se <= current
  assert.equal(p.discount, null);
});
