'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const {
  createMercadoLivreRoundRobin,
  deduplicateMercadoLivreCandidates,
  normalizeHighlightsProducts,
  parseMercadoLivreSsr,
  mergeMercadoLivreProductOffers,
  runMercadoLivreDiscoveryV4
} = require('./mercadolivre-discovery-v4.cjs');

const card = ({ href, title = 'Produto', current = 90, old = 120, discount = 25 }) => `
  <div class="poly-card">
    <a href="${href}" title="${title}">
      <img src="https://http2.mlstatic.com/image.webp" alt="${title}">
      <span class="poly-component__title">${title}</span>
      <span class="andes-money-amount andes-money-amount--previous" data-andes-money-amount="${old}"></span>
      <span class="poly-price__current"><span class="andes-money-amount" data-andes-money-amount="${current}"></span></span>
      <span>${discount}% OFF</span>
      <span>Frete grátis</span>
    </a>
  </div>`;

test('round-robin deterministico percorre paginas 1 a 10', () => {
  const rotation = createMercadoLivreRoundRobin();
  for(let i = 1; i <= 10; i++) assert.equal(rotation.next().page, i);
  assert.equal(rotation.next().page, 1);
});

test('SSR usa wid como ITEM e preserva PRODUCT do mesmo card', () => {
  const [candidate] = parseMercadoLivreSsr({
    source: 'offers_page_1',
    sourceUrl: 'https://www.mercadolivre.com.br/ofertas?page=1',
    html: card({ href: 'https://www.mercadolivre.com.br/produto/p/MLB999#wid=MLB123&tracking_id=x' })
  });
  assert.equal(candidate.identity_type, 'ITEM');
  assert.equal(candidate.item_id, 'MLB123');
  assert.equal(candidate.catalog_product_id, 'MLB999');
  assert.equal(candidate.current_price, 90);
  assert.equal(candidate.old_price, 120);
  assert.equal(candidate.discount_percent, 25);
});

test('SSR nunca usa campaign ou tracking como identidade', () => {
  const candidates = parseMercadoLivreSsr({
    source: 'lightning',
    sourceUrl: 'https://www.mercadolivre.com.br/ofertas?promotion_type=lightning',
    html: card({ href: 'https://www.mercadolivre.com.br/x?deal=MLB779362-1&tracking_id=MLB123' })
  });
  assert.equal(candidates.length, 0);
});

test('deduplicacao usa item_id e secundariamente catalog_product_id', () => {
  const result = deduplicateMercadoLivreCandidates([
    { item_id: 'MLB1', catalog_product_id: 'MLB10', source: 'a' },
    { item_id: 'MLB1', catalog_product_id: 'MLB10', source: 'b' },
    { item_id: null, catalog_product_id: 'MLB20', source: 'a' },
    { item_id: null, catalog_product_id: 'MLB20', source: 'b' }
  ]);
  assert.equal(result.candidates.length, 2);
  assert.equal(result.duplicates, 2);
  assert.deepEqual(result.candidates[0].discovery_sources, ['a', 'b']);
});

test('Highlights aceita PRODUCT e converte somente USER_PRODUCT com catalog_product_id', () => {
  const result = normalizeHighlightsProducts([
    { id: 'MLB100', type: 'PRODUCT', position: 1 },
    { id: 'MLBU200', type: 'USER_PRODUCT', catalog_product_id: 'MLB200', position: 2 },
    { id: 'MLBU300', type: 'USER_PRODUCT', position: 3 },
    { id: 'MLB4000', type: 'ITEM', position: 4 }
  ]);
  assert.deepEqual(result.products.map(row => row.catalog_product_id), ['MLB100', 'MLB200']);
  assert.equal(result.discarded_user_products, 1);
  assert.equal(result.discarded_items, 1);
});

test('Product Offers vira contrato Candidate unico usando dados Product', () => {
  const result = mergeMercadoLivreProductOffers({
    source: 'highlights_product',
    productId: 'MLB100',
    product: {
      id: 'MLB100',
      name: 'Produto Catalogo',
      permalink: 'https://www.mercadolivre.com.br/produto/p/MLB100',
      pictures: [{ url: 'https://http2.mlstatic.com/p.webp' }],
      domain_id: 'MLB-TEST'
    },
    offers: {
      results: [
        { item_id: 'MLB500', seller_id: 7, price: 80, original_price: 100, shipping: { free_shipping: true }, status: 'active' },
        { item_id: 'MLB501', seller_id: null, price: 70, status: 'active' }
      ]
    }
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].item_id, 'MLB500');
  assert.equal(result[0].catalog_product_id, 'MLB100');
  assert.equal(result[0].title, 'Produto Catalogo');
  assert.equal(result[0].current_price, 80);
  assert.equal(result[0].shipping_free, true);
});

test('pipeline V4 usa fontes oficiais, respeita teto e nao possui efeitos externos', async () => {
  const requests = [];
  const html = card({ href: 'https://www.mercadolivre.com.br/produto/p/MLB100#wid=MLB500' });
  const fetchImpl = async url => {
    requests.push(url);
    if (url.includes('/highlights/')) return response({ content: [{ id: 'MLB100', type: 'PRODUCT', position: 1 }] });
    if (url.endsWith('/products/MLB100')) return response({ id: 'MLB100', name: 'Produto Catalogo', permalink: 'https://www.mercadolivre.com.br/produto/p/MLB100', pictures: [{ url: 'img' }] });
    if (url.endsWith('/products/MLB100/items')) return response({ results: [{ item_id: 'MLB501', seller_id: 9, price: 75, status: 'active' }] });
    return responseText(html);
  };
  const result = await runMercadoLivreDiscoveryV4({ fetchImpl, accessToken: 'token', maxProducts: 1 });
  assert.equal(result.calls.total, 9);
  assert.equal(result.calls.ssr, 6);
  assert.equal(result.calls.highlights, 1);
  assert.equal(result.calls.product, 1);
  assert.equal(result.calls.product_offers, 1);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.db_writes, 0);
  assert.equal(result.ai_calls, 0);
  assert.ok(result.products_by_source.offers_page_1 >= 1);
  assert.ok(requests.every(url => !url.includes('/search') && !url.includes('/items/')));
});

test('Oracle elimina Discovery Mercado Livre legado e registra dry run V4', () => {
  const oracle = fs.readFileSync(require.resolve('./oracle-scraper.cjs'), 'utf8');
  assert.doesNotMatch(oracle, /ML_PROVIDER|ML_DISCOVERY_MODE|ML_SIGNAL_URLS|fetchMercadoLivreViaScrapedo/);
  assert.doesNotMatch(oracle, /lista\.mercadolivre\.com\.br/);
  assert.match(oracle, /--mercadolivre-official-dry-run/);
  assert.match(oracle, /runMercadoLivreDiscoveryV4/);
});

test('Highlights PRODUCT tem prioridade no teto de enriquecimento', async () => {
  const requests = [];
  const html = card({ href: 'https://www.mercadolivre.com.br/outro/p/MLB200#wid=MLB500' });
  const fetchImpl = async url => {
    requests.push(url);
    if (url.includes('/highlights/')) return response({ content: [{ id: 'MLB100', type: 'PRODUCT', position: 1 }] });
    if (url.endsWith('/products/MLB100')) return response({ id: 'MLB100', name: 'Highlight', permalink: 'https://www.mercadolivre.com.br/p/MLB100', pictures: [{ url: 'img' }] });
    if (url.endsWith('/products/MLB100/items')) return response({ results: [{ item_id: 'MLB501', seller_id: 9, price: 75 }] });
    if (url.includes('/products/MLB200')) throw new Error('SSR consumiu teto antes de Highlights');
    return responseText(html);
  };
  await runMercadoLivreDiscoveryV4({ fetchImpl, accessToken: 'token', maxProducts: 1 });
  assert.ok(requests.some(url => url.endsWith('/products/MLB100')));
  assert.ok(requests.every(url => !url.includes('/products/MLB200')));
});

test('pipeline limita Candidates finais por fonte', async () => {
  const html = card({ href: 'https://www.mercadolivre.com.br/outro/p/MLB200#wid=MLB500' });
  const manyOffers = Array.from({ length: 20 }, (_, index) => ({ item_id: `MLB${600 + index}`, seller_id: index + 1, price: 50 + index }));
  const fetchImpl = async url => {
    if (url.includes('/highlights/')) return response({ content: [{ id: 'MLB100', type: 'PRODUCT', position: 1 }] });
    if (url.endsWith('/products/MLB100')) return response({ id: 'MLB100', name: 'Highlight', permalink: 'https://www.mercadolivre.com.br/p/MLB100', pictures: [{ url: 'img' }] });
    if (url.endsWith('/products/MLB100/items')) return response({ results: manyOffers });
    return responseText(html);
  };
  const result = await runMercadoLivreDiscoveryV4({ fetchImpl, accessToken: 'token', maxProducts: 1, maxCandidatesPerSource: 12 });
  assert.equal(result.candidates.filter(row => row.source === 'highlights_product').length, 12);
});

test('Pipeline obriga Product API e elimina candidates diretos (directItems) que bypassam arquitetura', async () => {
  const requests = [];
  // Este link gera apenas item_id (MLB500) e NÃO gera catalog_product_id
  const html = card({ href: 'https://www.mercadolivre.com.br/produto/MLB-500-produto_JM' });
  const fetchImpl = async url => {
    requests.push(url);
    if (url.includes('/highlights/')) return response({ content: [] });
    return responseText(html);
  };
  const result = await runMercadoLivreDiscoveryV4({ fetchImpl, accessToken: 'token', maxProducts: 1 });
  
  // Como o item não tem catalog_product_id, não pode ir para Product API.
  // Pela nova regra, não pode haver directItems. Logo, ele deve ser descartado.
  assert.equal(result.candidates.length, 0);
  // Garante que a API não foi chamada pois não havia catalog_product_id
  assert.ok(requests.every(url => !url.includes('/products/')));
});

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}

function responseText(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => body, json: async () => JSON.parse(body) };
}
