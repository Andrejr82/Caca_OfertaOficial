'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  runMercadoLivreOfficialIntentCoverage,
  canUseMercadoLivreV1Fallback,
  evaluateV1ItemAgainstConfig,
  evaluateStrictExploratoryItem,
} = require('../mercadolivre-official-intents-v5.cjs');
const { getMercadoLivreFamilyConfig } = require('../mercadolivre-domain-category-map-v1.cjs');

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'content-type': 'application/json' },
});

function productResponse({ id = 'MLBPRODUCT1', itemId = 'MLBITEM1', title = 'Air Fryer Fritadeira Sem Óleo 4L', price = 299.9, domainId = 'MLB-AIR_FRYERS', categoryId = 'MLB456045' } = {}) {
  return {
    catalogItems: { results: [{ item_id: itemId, price }] },
    productMeta: {
      name: title,
      pictures: [{ url: 'https://img.example/airfryer.jpg' }],
      permalink: `https://www.mercadolivre.com.br/p/${id}`,
    },
    details: [{
      code: 200,
      body: {
        id: itemId,
        title,
        price,
        original_price: price * 1.2,
        seller_id: 123,
        shipping: { free_shipping: true },
        thumbnail: 'https://img.example/airfryer-item.jpg',
        permalink: `https://produto.mercadolivre.com.br/${itemId}`,
        domain_id: domainId,
        category_id: categoryId,
      },
    }],
  };
}

function mlSearchItem({ id, title, price = 899.9, domainId = 'MLB-MONITORS', categoryId = 'MLB1658' }) {
  return {
    id,
    title,
    price,
    domain_id: domainId,
    category_id: categoryId,
    thumbnail: `https://img.example/${id}.jpg`,
    permalink: `https://produto.mercadolivre.com.br/${id}`,
    shipping: { free_shipping: true },
  };
}

test('1. Helper puro canUseMercadoLivreV1Fallback valida contratos com precisão', () => {
  const airFryerConfig = getMercadoLivreFamilyConfig('air fryer');
  assert.equal(canUseMercadoLivreV1Fallback(airFryerConfig), true);
  assert.equal(canUseMercadoLivreV1Fallback(null), false);
  assert.equal(canUseMercadoLivreV1Fallback({ safeForAutomaticSearch: false, domainIds: ['MLB-AIR_FRYERS'], bestExtractionRoute: 'domain_discovery_products_search' }), false);
  assert.equal(canUseMercadoLivreV1Fallback({ safeForAutomaticSearch: true, domainIds: [], bestExtractionRoute: 'domain_discovery_products_search' }), false);
});

test('2. Flag false preserva fluxo legado', async () => {
  const fixture = productResponse({ title: 'Cafeteira Tradicional', domainId: 'MLB-COFFEE_MAKERS' });
  const result = await runMercadoLivreOfficialIntentCoverage({
    accessToken: 'fixture-token',
    keywords: ['cafeteira'],
    maxPerIntent: 20,
    delayMs: 0,
    env: { MERCADOLIVRE_DOMAIN_CATEGORY_SEARCH_V1_ENABLED: 'false' },
    fetchImpl: async (url) => {
      const value = String(url);
      if (value.includes('/domain_discovery/search')) return json([{ domain_id: 'MLB-COFFEE_MAKERS', category_id: 'MLB1576', category_name: 'Cafeteiras' }]);
      if (value.includes('/products/search?')) return json({ results: [{ id: 'MLBPROD1' }] });
      if (value.includes('/products/MLBPROD1/items')) return json(fixture.catalogItems);
      if (value.endsWith('/products/MLBPROD1')) return json(fixture.productMeta);
      if (value.includes('/items?ids=')) return json(fixture.details);
      if (value.includes('/reviews/item/')) return json({ rating_average: 4.8, paging: { total: 50 } });
      throw new Error(`URL inesperada: ${value}`);
    },
  });
  assert.equal(result.mercadolivreDomainCategorySearchV1, undefined);
  assert.equal(result.source, 'official_api');
  assert.equal(result.products.length, 1);
});

test('3. Família certificada continua usando mapa antes do fallback profundo', async () => {
  const fixture = productResponse({
    id: 'MLBPROD_AIRFRYER', itemId: 'MLBITEM_AIRFRYER',
    title: 'Fritadeira Elétrica Air Fryer 4L Inox', price: 349.9,
    domainId: 'MLB-AIR_FRYERS', categoryId: 'MLB456045'
  });
  const calls = [];
  const result = await runMercadoLivreOfficialIntentCoverage({
    accessToken: 'fixture-token', keywords: ['air fryer'], maxPerIntent: 20, delayMs: 0,
    env: { MERCADOLIVRE_DOMAIN_CATEGORY_SEARCH_V1_ENABLED: 'true' },
    fetchImpl: async (url) => {
      const value = String(url); calls.push(value);
      if (value.includes('/products/search?') && value.includes('domain_id=MLB-AIR_FRYERS')) return json({ results: [{ id: 'MLBPROD_AIRFRYER' }] });
      if (value.includes('/products/MLBPROD_AIRFRYER/items')) return json(fixture.catalogItems);
      if (value.endsWith('/products/MLBPROD_AIRFRYER')) return json(fixture.productMeta);
      if (value.includes('/items?ids=')) return json(fixture.details);
      if (value.includes('/sites/MLB/search?')) return json({ results: [] });
      throw new Error(`URL inesperada: ${value}`);
    },
  });
  assert.equal(result.mercadolivreDomainCategorySearchV1.familiesAvailable, 30);
  assert.deepEqual(result.mercadolivreDomainCategorySearchV1.selectedFamilies, ['air fryer']);
  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].title, 'Fritadeira Elétrica Air Fryer 4L Inox');
  assert.ok(calls.some((url) => url.includes('domain_id=MLB-AIR_FRYERS')));
  assert.equal(result.queries[0].source_strategy, 'mercadolivre_v1_domain_discovery_products_search_deep');
});

test('4. Família editorial não certificada usa fallback oficial estrito e aceita produto principal', async () => {
  const monitor = mlSearchItem({ id: 'MLB_MONITOR_1', title: 'Monitor Gamer 24 Full HD 180Hz IPS' });
  const result = await runMercadoLivreOfficialIntentCoverage({
    accessToken: 'fixture-token', keywords: ['monitor'], scenarioId: 'informatica_editorial', maxPerIntent: 20, delayMs: 0,
    env: { MERCADOLIVRE_DOMAIN_CATEGORY_SEARCH_V1_ENABLED: 'true' },
    fetchImpl: async (url) => String(url).includes('/sites/MLB/search?') ? json({ results: [monitor] }) : json({}),
  });
  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].title, monitor.title);
  assert.equal(result.mercadolivreDomainCategorySearchV1.exploratoryFamiliesUsed, 1);
  assert.ok(result.mercadolivreDomainCategorySearchV1.exploratoryAccepted >= 1);
  assert.ok(result.mercadolivreDomainCategorySearchV1.fallbackOpenCalls >= 1);
  assert.equal(result.queries[0].source_strategy, 'mercadolivre_v1_strict_exploratory');
});

test('5. Fallback exploratório rejeita acessório mesmo quando a busca é da família correta', async () => {
  const support = mlSearchItem({ id: 'MLB_SUPPORT_1', title: 'Suporte para Monitor Articulado de Mesa' });
  const direct = evaluateStrictExploratoryItem(support, 'monitor', 'informatica_editorial');
  assert.equal(direct.accepted, false);
  assert.match(direct.reason, /ACCESSORY_ONLY_PRODUCT|NICHE_BLOCKED_TERM/);

  const result = await runMercadoLivreOfficialIntentCoverage({
    accessToken: 'fixture-token', keywords: ['monitor'], scenarioId: 'informatica_editorial', maxPerIntent: 20, delayMs: 0,
    env: { MERCADOLIVRE_DOMAIN_CATEGORY_SEARCH_V1_ENABLED: 'true' },
    fetchImpl: async (url) => String(url).includes('/sites/MLB/search?') ? json({ results: [support] }) : json({}),
  });
  assert.equal(result.products.length, 0);
  assert.ok(result.mercadolivreDomainCategorySearchV1.exploratoryRejected >= 1);
});

test('6. Fallback exploratório rejeita domínio globalmente proibido', async () => {
  const spoof = mlSearchItem({ id: 'MLB_SPOOF_1', title: 'Monitor Gamer 24 Full HD', domainId: 'MLB-MINERAL_WATERS' });
  const direct = evaluateStrictExploratoryItem(spoof, 'monitor', 'informatica_editorial');
  assert.deepEqual(direct, { accepted: false, reason: 'FORBIDDEN_DOMAIN', forbidden: true });

  const result = await runMercadoLivreOfficialIntentCoverage({
    accessToken: 'fixture-token', keywords: ['monitor'], scenarioId: 'informatica_editorial', maxPerIntent: 20, delayMs: 0,
    env: { MERCADOLIVRE_DOMAIN_CATEGORY_SEARCH_V1_ENABLED: 'true' },
    fetchImpl: async (url) => String(url).includes('/sites/MLB/search?') ? json({ results: [spoof] }) : json({}),
  });
  assert.equal(result.products.length, 0);
  assert.ok(result.mercadolivreDomainCategorySearchV1.forbiddenDomainsRejected >= 1);
});

test('7. Busca profunda avança para offset 30 quando a primeira página só contém acessórios', async () => {
  const calls = [];
  const weakPage = Array.from({ length: 30 }, (_, index) => mlSearchItem({
    id: `MLB_SUPPORT_${index}`,
    title: `Suporte para Monitor Articulado Modelo ${index}`,
  }));
  const winner = mlSearchItem({ id: 'MLB_MONITOR_DEEP', title: 'Monitor Gamer 27 QHD 165Hz IPS' });

  const result = await runMercadoLivreOfficialIntentCoverage({
    accessToken: 'fixture-token', keywords: ['monitor'], scenarioId: 'informatica_editorial', maxPerIntent: 20, delayMs: 0,
    env: { MERCADOLIVRE_DOMAIN_CATEGORY_SEARCH_V1_ENABLED: 'true' },
    fetchImpl: async (url) => {
      const value = String(url); calls.push(value);
      if (value.includes('/sites/MLB/search?') && value.includes('offset=0')) return json({ results: weakPage });
      if (value.includes('/sites/MLB/search?') && value.includes('offset=30')) return json({ results: [winner] });
      return json({ results: [] });
    },
  });

  assert.ok(calls.some((url) => url.includes('offset=30')), 'deve aprofundar para a segunda página');
  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].item_id, 'MLB_MONITOR_DEEP');
  assert.ok(result.mercadolivreDomainCategorySearchV1.exploratoryRejected >= 30);
});

test('8. Família certificada mantém whitelist e rejeita acessórios/peças', () => {
  const config = getMercadoLivreFamilyConfig('air fryer');
  assert.equal(evaluateV1ItemAgainstConfig({ title: 'Air Fryer 4L Digital', price: 299, domain_id: 'MLB-AIR_FRYERS' }, config).accepted, true);
  assert.equal(evaluateV1ItemAgainstConfig({ title: 'Forma de Silicone para Air Fryer', price: 39, domain_id: 'MLB-AIR_FRYERS' }, config).accepted, false);
  assert.equal(evaluateV1ItemAgainstConfig({ title: 'Air Fryer Fake', price: 299, domain_id: 'MLB-MINERAL_WATERS' }, config).accepted, false);
});

test('9. minConfidence alta não usa a rota certificada média', async () => {
  const result = await runMercadoLivreOfficialIntentCoverage({
    accessToken: 'fixture-token', keywords: ['tênis feminino'], scenarioId: 'moda_editorial', maxPerIntent: 20, delayMs: 0,
    minConfidence: 'alta',
    env: { MERCADOLIVRE_DOMAIN_CATEGORY_SEARCH_V1_ENABLED: 'true' },
    fetchImpl: async () => json({ results: [] }),
  });
  assert.equal(result.products.length, 0);
  assert.equal(result.mercadolivreDomainCategorySearchV1.selectedFamilies.includes('tênis feminino'), false);
});
