'use strict';

process.env.ORACLE_SCRAPER_DISABLE_AUTORUN = '1';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'dummy';
process.env.CEREBRAS_API_KEY = 'dummy';
process.env.SCRAPEDO_API_KEY = 'dummy';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const oracle = require('./oracle-scraper.cjs');

const RAW_ENDPOINT = 'https://api.scrape.do/plugin/amazon/';
const SOURCE_HTML = {
  'https://www.amazon.com.br/gp/new-releases/electronics': `
    <div id="gridItemRoot" data-asin="B0AAAAAAA1"><span class="zg-bdg-text">#1</span><a href="/dp/B0AAAAAAA1"><img src="https://m.media-amazon.com/images/I/a.jpg" alt="Produto Novo A"></a><span class="a-price"><span class="a-offscreen">R$ 100,00</span></span><span class="a-icon-alt">4,7 de 5 estrelas</span></div>
    <div id="gridItemRoot" data-asin="B0AAAAAAA2"><span class="zg-bdg-text">#2</span><a href="/dp/B0AAAAAAA2"><img src="https://m.media-amazon.com/images/I/b.jpg" alt="Produto Novo B"></a><span class="a-price"><span class="a-offscreen">R$ 200,00</span></span></div>`,
  'https://www.amazon.com.br/gp/most-wished-for/electronics': `
    <div id="gridItemRoot" data-asin="B0AAAAAAA2"><span class="zg-bdg-text">#1</span><a href="/dp/B0AAAAAAA2"><img src="https://m.media-amazon.com/images/I/b2.jpg" alt="Produto Novo B Duplicado"></a><span class="a-price"><span class="a-offscreen">R$ 210,00</span></span></div>
    <div id="gridItemRoot" data-asin="B0AAAAAAA3"><span class="zg-bdg-text">#2</span><a href="/dp/B0AAAAAAA3"><img src="https://m.media-amazon.com/images/I/c.jpg" alt="Produto Desejado C"></a><span class="a-price"><span class="a-offscreen">R$ 300,00</span></span><span class="a-icon-alt">4,9 de 5 estrelas</span></div>`,
  'https://www.amazon.com.br/gp/most-gifted/electronics': `
    <div id="gridItemRoot" data-asin="B0AAAAAAA4"><span class="zg-bdg-text">#1</span><a href="/dp/B0AAAAAAA4"><img src="https://m.media-amazon.com/images/I/d.jpg" alt="Produto Presente D"></a><span class="a-price"><span class="a-offscreen">R$ 400,00</span></span><span class="a-icon-alt">6,0 de 5 estrelas</span></div>`,
  'https://www.amazon.com.br/b?ie=UTF8&node=20967360011': `
    <li class="a-carousel-card"><div class="dcl-product-wrapper" data-csa-c-item-id="amzn1.asin.B0AAAAAAA5"><a href="/Produto-Outlet-E/dp/B0AAAAAAA5"><img src="https://m.media-amazon.com/images/I/e.jpg"></a><a href="/Produto-Outlet-E/dp/B0AAAAAAA5">Produto Outlet E50% offOfertaR$ 50,00De:R$ 100,00</a><span class="a-price"><span class="a-offscreen">R$ 50,00</span></span><span class="a-icon-alt">4,5 de 5 estrelas</span></div></li>
    <li class="a-carousel-card"><div class="dcl-product-wrapper"><a href="/Produto-Outlet-F/dp/B0AAAAAAA6"><img src="https://m.media-amazon.com/images/I/f.jpg"></a><a href="/Produto-Outlet-F/dp/B0AAAAAAA6">Produto Outlet FOfertaR$ 60,00De:R$ 120,00</a><span class="a-price"><span class="a-offscreen">R$ 60,00</span></span></div></li>`
};

function fakeHttpGetFactory(calls) {
  return async (url, options = {}) => {
    if (url === 'https://api.scrape.do/info') return { status: 200, data: { IsActive: true, RemainingMonthlyRequest: 100 } };
    calls.push({ url, params: options.params || {} });
    return { status: 200, headers: { 'content-type': 'text/html' }, data: SOURCE_HTML[options.params.url] || '<html></html>' };
  };
}

const noExistingOffers = async () => [];

function candidate(productId, source, ranking, score = 100) {
  return {
    marketplace: 'Amazon',
    productId,
    title: `Produto ${productId}`,
    price: 100,
    imageUrl: `https://m.media-amazon.com/images/I/${productId}.jpg`,
    url: `https://www.amazon.com.br/dp/${productId}`,
    source,
    ranking,
    score
  };
}

function assertNoRemovedRuntime() {
  const source = fs.readFileSync(require.resolve('./oracle-scraper.cjs'), 'utf8');
  for (const forbidden of [
    '/plugin/amazon/movers',
    '/plugin/amazon/deals',
    '/plugin/amazon/new-releases',
    '/plugin/amazon/bestsellers',
    'fetchAmazonProductsFromScrapedoApi',
    'fetchAmazonProductsFromScrapedoSearch',
    'normalizeAmazonOfficialRankingHtml',
    'normalizeScrapedoAmazonSearchProducts',
    'normalizeAmazonBestSellersRawHtmlV2',
    'fetchAmazonBestSellersV2',
    'fetchAmazonDiscoveryV2',
    'AMAZON_BEST_SELLERS_ELECTRONICS_URL',
    'normalizeAmazonV2Json',
    'AMAZON_DISCOVERY_GENERIC_FALLBACK',
    'playWithBrowser'
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
}

async function v3ExecutaSomenteFontesCertificadas() {
  const calls = [];
  const result = await oracle.fetchAmazonDiscoveryV3(10, { httpGet: fakeHttpGetFactory(calls), findOffers: noExistingOffers });
  assert.deepEqual(calls.map((call) => call.params.url), Object.keys(SOURCE_HTML));
  assert.equal(calls.every((call) => call.url === RAW_ENDPOINT), true);
  for (const call of calls) {
    assert.equal(call.params.geocode, 'br');
    assert.equal(call.params.device, 'desktop');
    for (const forbidden of ['render', 'super', 'include_html', 'keyword', 'node_id', 'playWithBrowser']) {
      assert.equal(forbidden in call.params, false, forbidden);
    }
  }
  assert.equal(result.candidates.length, 6);
  assert.equal(result.telemetry.httpCalls, 4);
}

async function v3DeduplicaEOrdena() {
  const result = await oracle.fetchAmazonDiscoveryV3(10, { httpGet: fakeHttpGetFactory([]), findOffers: noExistingOffers });
  assert.deepEqual(result.candidates.map((product) => product.productId), ['B0AAAAAAA1', 'B0AAAAAAA3', 'B0AAAAAAA4', 'B0AAAAAAA5', 'B0AAAAAAA2', 'B0AAAAAAA6']);
  assert.equal(result.telemetry.duplicates, 1);
  assert.equal(result.telemetry.averagePrice, 185);
  assert.equal(result.telemetry.averageRating, 4.7);
}

async function outletUsaParserCertificado() {
  const parsed = oracle.normalizeAmazonOutletRawHtmlV3(SOURCE_HTML['https://www.amazon.com.br/b?ie=UTF8&node=20967360011'], 10);
  assert.equal(parsed.products.length, 2);
  assert.equal(parsed.products[0].productId, 'B0AAAAAAA5');
  assert.equal(parsed.products[0].title, 'Produto Outlet E');
  assert.equal(parsed.products[0].price, 50);
  assert.equal(parsed.products[0].imageUrl, 'https://m.media-amazon.com/images/I/e.jpg');
  assert.equal(parsed.products[0].url, 'https://www.amazon.com.br/dp/B0AAAAAAA5');
}

async function dryRunUsaSomenteAmazonV3() {
  const result = await oracle.runAmazonOfficialDryRun({ minCandidates: 1, httpGet: fakeHttpGetFactory([]), findOffers: noExistingOffers });
  assert.equal(result.store, 'Amazon');
  assert.equal(result.calls, 4);
  assert.equal(result.products, 6);
  assert.equal(result.uniqueAsins, 6);
}

async function noveltyGateClassificaSemEscrever() {
  const queried = [];
  const products = [
    candidate('B0AAAAAAA1', 'amazon_v3_new_releases', 1),
    candidate('B0AAAAAAA1', 'amazon_v3_new_releases', 1),
    candidate('B0AAAAAAA2', 'amazon_v3_most_wished', 1),
    candidate('B0AAAAAAA3', 'amazon_v3_gift_ideas', 1),
    candidate('INVALID', 'amazon_v3_amazon_outlet', 1)
  ];
  const result = await oracle.applyAmazonNoveltyGate(products, {
    findOffers: async (asins) => {
      queried.push(...asins);
      return [
        { original_url: 'https://www.amazon.com.br/dp/B0AAAAAAA2', status: 'posted' },
        { original_url: 'https://www.amazon.com.br/dp/B0AAAAAAA3?tag=x', status: 'draft' }
      ];
    }
  });

  assert.deepEqual(queried, ['B0AAAAAAA1', 'B0AAAAAAA2', 'B0AAAAAAA3']);
  assert.deepEqual(result.newProducts.map((product) => product.productId), ['B0AAAAAAA1']);
  assert.equal(result.telemetry.NEW, 1);
  assert.equal(result.telemetry.EXISTING_POSTED, 1);
  assert.equal(result.telemetry.EXISTING_DRAFT, 1);
  assert.equal(result.telemetry.INVALID_ASIN, 1);
  assert.equal(result.telemetry.duplicates, 1);
}

function diversityRoundRobinPreservaRankingELimite() {
  const products = [
    candidate('B0AAAAAAA1', 'amazon_v3_new_releases', 1, 99),
    candidate('B0AAAAAAA2', 'amazon_v3_new_releases', 2, 90),
    candidate('B0AAAAAAA3', 'amazon_v3_most_wished', 1, 98),
    candidate('B0AAAAAAA4', 'amazon_v3_most_wished', 2, 89),
    candidate('B0AAAAAAA5', 'amazon_v3_gift_ideas', 1, 97),
    candidate('B0AAAAAAA6', 'amazon_v3_amazon_outlet', null, 96),
    candidate('B0AAAAAAA7', 'amazon_v3_amazon_outlet', null, 88)
  ];
  const selected = oracle.selectAmazonDiverseFinalists(products, 6);
  assert.deepEqual(selected.map((product) => product.productId), [
    'B0AAAAAAA1', 'B0AAAAAAA3', 'B0AAAAAAA5', 'B0AAAAAAA6', 'B0AAAAAAA2', 'B0AAAAAAA4'
  ]);
  assert.equal(new Set(selected.map((product) => product.source)).size, 4);
  assert.equal(selected.length, 6);
}

async function poucosNovosNaoReutilizaExistentes() {
  const result = await oracle.applyAmazonNoveltyGate([
    candidate('B0AAAAAAA1', 'amazon_v3_new_releases', 1),
    candidate('B0AAAAAAA2', 'amazon_v3_most_wished', 1),
    candidate('B0AAAAAAA3', 'amazon_v3_gift_ideas', 1)
  ], {
    findOffers: async () => [
      { original_url: 'https://www.amazon.com.br/dp/B0AAAAAAA2', status: 'posted' },
      { original_url: 'https://www.amazon.com.br/dp/B0AAAAAAA3', status: 'other' }
    ]
  });
  const selected = oracle.selectAmazonDiverseFinalists(result.newProducts, 6);
  assert.deepEqual(selected.map((product) => product.productId), ['B0AAAAAAA1']);
  assert.equal(result.telemetry.EXISTING_POSTED, 1);
  assert.equal(result.telemetry.EXISTING_OTHER_STATUS, 1);
}

async function fetchAplicaGateAntesDosFinalistas() {
  const result = await oracle.fetchAmazonDiscoveryV3(6, {
    httpGet: fakeHttpGetFactory([]),
    findOffers: async () => [
      { original_url: 'https://www.amazon.com.br/dp/B0AAAAAAA1', status: 'posted' },
      { original_url: 'https://www.amazon.com.br/dp/B0AAAAAAA2', status: 'draft' }
    ]
  });
  assert.deepEqual(result.candidates.map((product) => product.productId), [
    'B0AAAAAAA3', 'B0AAAAAAA4', 'B0AAAAAAA5', 'B0AAAAAAA6'
  ]);
  assert.equal(result.telemetry.novelty.EXISTING_POSTED, 1);
  assert.equal(result.telemetry.novelty.EXISTING_DRAFT, 1);
  assert.deepEqual(result.telemetry.representedSources, [
    'amazon_v3_most_wished', 'amazon_v3_gift_ideas', 'amazon_v3_amazon_outlet'
  ]);
}

async function consultaOffersEhSomenteLeitura() {
  const operations = [];
  const query = {
    select(columns) { operations.push(['select', columns]); return this; },
    eq(column, value) { operations.push(['eq', column, value]); return this; },
    async or(filter) { operations.push(['or', filter]); return { data: [], error: null }; }
  };
  const client = {
    from(table) { operations.push(['from', table]); return query; }
  };
  await oracle.findAmazonOffersByAsins(['B0AAAAAAA1'], client);
  assert.deepEqual(operations.map(([operation]) => operation), ['from', 'select', 'eq', 'or']);
  assert.equal(operations.some(([operation]) => ['insert', 'update', 'upsert', 'delete'].includes(operation)), false);
}

const tests = [
  assertNoRemovedRuntime,
  v3ExecutaSomenteFontesCertificadas,
  v3DeduplicaEOrdena,
  outletUsaParserCertificado,
  dryRunUsaSomenteAmazonV3,
  noveltyGateClassificaSemEscrever,
  diversityRoundRobinPreservaRankingELimite,
  poucosNovosNaoReutilizaExistentes,
  fetchAplicaGateAntesDosFinalistas,
  consultaOffersEhSomenteLeitura
];

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
