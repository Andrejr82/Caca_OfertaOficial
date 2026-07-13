'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { runMercadoLivreNativeTop20, writeMercadoLivreNativeTop20Reports, parseOffersSsrData, fetchOffersHtmlViaCertifiedTransport } = require('./mercadolivre-native-top20-v5.cjs');

function response(html) {
  return { ok: true, status: 200, headers: new Headers(), text: async () => html };
}

function page(data) {
  const images = (data.items || []).map((item) => `<img src="https://http2.mlstatic.com/${item.card.pictures.pictures[0].id}.webp">`).join('');
  return `<script id="__NORDIC_RENDERING_CTX__">_n.ctx.r=${JSON.stringify({ appProps: { pageProps: { data } } })};</script>${images}`;
}

function card(position, id, categoryId) {
  return {
    position,
    type: 'ORGANIC_ITEM',
    card: {
      metadata: { id, product_id: `MLBPRODUCT${position}`, url: `www.mercadolivre.com.br/item-${id}`, url_params: '', url_fragments: '' },
      pictures: { pictures: [{ id: `image-${id}` }] },
      components: [
        { id: 'title', title: { text: `Produto ${id}` } },
        { id: 'price_v2', price: { current_price: { value: 100 }, price_labels: [] } },
        { id: 'shipping_v2', shipping_v2: [] }
      ],
      categoryId
    }
  };
}

test('V5 carrega categorias da landing, usa somente URLs de ofertas e limita cada categoria a vinte cards', async () => {
  const landing = page({
    availableFilters: [{ id: 'category', values: [
      { id: 'MLB1', name: 'Categoria Um', results: 22 },
      { id: 'MLB2', name: 'Categoria Dois', results: 6 }
    ] }]
  });
  const first = page({ items: Array.from({ length: 22 }, (_, index) => card(index + 1, `MLB${index + 1}`, 'MLB1')) });
  const short = page({ items: Array.from({ length: 6 }, (_, index) => card(index + 1, `MLB${index + 1}`, 'MLB2')) });
  const calls = [];
  const result = await runMercadoLivreNativeTop20({
    fetchImpl: async (url) => {
      calls.push(url);
      if (url === 'https://www.mercadolivre.com.br/ofertas') return response(landing);
      if (url === 'https://www.mercadolivre.com.br/ofertas?category=MLB1') return response(first);
      if (url === 'https://www.mercadolivre.com.br/ofertas?category=MLB2') return response(short);
      throw new Error(`URL proibida: ${url}`);
    },
    now: () => '2026-07-12T00:00:00.000Z'
  });

  assert.deepEqual(calls, [
    'https://www.mercadolivre.com.br/ofertas',
    'https://www.mercadolivre.com.br/ofertas?category=MLB1',
    'https://www.mercadolivre.com.br/ofertas?category=MLB2'
  ]);
  assert.equal(result.categories.length, 2);
  assert.equal(result.by_category.MLB1.collected, 20);
  assert.equal(result.by_category.MLB2.collected, 6);
  assert.equal(result.raw_products, 26);
  assert.equal(result.duplicates, 6);
  assert.equal(result.products.length, 20);
  assert.equal(result.products[0].platform, 'Mercado Livre');
  assert.equal(result.products[0].source, 'mercadolivre_offers_ssr');
  assert.equal(result.products[0].category_id, 'MLB1');
  assert.equal(result.products[0].item_id, 'MLB1');
  assert.equal(result.products[0].status, 'pending_manual_review');
});

test('dry-run escreve somente relatórios V5 sem banco, IA ou publicação', () => {
  const writes = [];
  writeMercadoLivreNativeTop20Reports({ categories: [], products: [], calls: 1 }, {
    writeFileSync: (file, content) => writes.push({ file, content }),
    now: () => '2026-07-12T00:00:00.000Z'
  });
  assert.deepEqual(writes.map((entry) => entry.file), [
    'reports/mercadolivre-native-top20-latest.json',
    'reports/mercadolivre-native-top20-latest.md'
  ]);
  assert.match(writes[0].content, /"calls": 1/);
  assert.match(writes[1].content, /Mercado Livre Native Top 20/);
});

test('parser recupera categorias e cards de JSON SSR inline sem appProps', () => {
  const html = '<script>window.payload={"availableFilters":[{"id":"category","values":[{"id":"MLB5672","name":"Acessórios para Veículos","results":642}]}],"items":[{"position":1,"type":"ORGANIC_ITEM"}]};</script>';
  const data = parseOffersSsrData(html);
  assert.deepEqual(data.availableFilters[0].values[0], { id: 'MLB5672', name: 'Acessórios para Veículos', results: 642 });
  assert.equal(data.items[0].position, 1);
});

test('transporte certificado devolve HTML SSR sem Browser', () => {
  const expected = '<script>"availableFilters":[]</script>';
  const html = fetchOffersHtmlViaCertifiedTransport('https://www.mercadolivre.com.br/ofertas', {
    execFileSync: () => Buffer.from(expected).toString('base64')
  });
  assert.equal(html, expected);
});
