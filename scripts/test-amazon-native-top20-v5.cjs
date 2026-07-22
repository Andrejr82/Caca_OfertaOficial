'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const {
  BEST_SELLERS_ROOT,
  applyNovelty,
  calculateDeterministicScore,
  deduplicate,
  parseBrazilPrice,
  parseCategoryTree,
  parseRankingPage,
  parseRootCategories,
  runAmazonNativeTop20,
  sanitizeProducts,
  validateFinalContract,
  writeDryRunJson
} = require('./amazon-native-top20-v5.cjs');

const CONTRACT_KEYS = [
  'marketplace', 'category', 'subcategory', 'node_id', 'parent_node_id',
  'source_url', 'rank', 'asin', 'title', 'image', 'canonical_url', 'price',
  'original_price', 'seller', 'discount', 'score', 'novelty'
].sort();

function productCard(rank, asin, title = `Produto ${rank}`) {
  return `<div data-asin="${asin}"><span class="zg-bdg-text">#${rank}</span><a href="/${title}/dp/${asin}/ref=zg_bs_${rank}"><img alt="${title}" src="https://images-na.ssl-images-amazon.com/images/I/${asin}.jpg"></a><span class="p13n-sc-price">R$ ${rank},90</span></div>`;
}

function categoryPage(slug, parentNode, children) {
  const links = children.map((child) => `<a href="/gp/bestsellers/${slug}/${child.node_id}">${child.name}</a>`).join('');
  return `<a href="/b/?node=${parentNode}&ref_=nav_cs_${slug}" data-csa-c-content-id="nav_cs_${slug}">${slug}</a>${links}`;
}

function rankingPage(count = 20) {
  return Array.from({ length: count }, (_, index) => productCard(index + 1, `B${String(index + 1).padStart(9, '0')}`)).join('');
}

function rankingCardWithPrice(priceMarkup, extraMarkup = '') {
  return `<div data-asin="B000000001"><span class="zg-bdg-text">#1</span><a href="/Produto/dp/B000000001"><img alt="Produto" src="https://images.example.com/product.jpg"></a>${priceMarkup}${extraMarkup}</div>`;
}

const SOURCE = {
  category: 'Categoria Alpha', subcategory: 'Subcategoria Um', node_id: '22222222',
  parent_node_id: '11111111', source_url: `${BEST_SELLERS_ROOT}/alpha/22222222`
};

test('normaliza preços brasileiros completos e sem centavos', () => {
  assert.equal(parseBrazilPrice('R$ 1.299,90'), 1299.9);
  assert.equal(parseBrazilPrice('R$ 89,99'), 89.99);
  assert.equal(parseBrazilPrice('1.299,90'), 1299.9);
  assert.equal(parseBrazilPrice('89'), 89);
  assert.equal(parseBrazilPrice('12x R$ 7,99'), null);
});

test('parser usa preço acessível atual antes de legado e parcela', () => {
  const products = parseRankingPage(
    rankingCardWithPrice('<span class="a-price"><span class="a-offscreen">R$ 89,99</span></span><span class="p13n-sc-price">R$ 9,99</span>', '<span class="installment">12x R$ 7,99</span>'),
    SOURCE,
  );
  assert.equal(products[0].price, 89.99);
});

test('parser suporta seletor legado e classe dinâmica comprovada', () => {
  const legacy = parseRankingPage(rankingCardWithPrice('<span class="p13n-sc-price">R$ 1.299,90</span>'), SOURCE);
  const dynamic = parseRankingPage(rankingCardWithPrice('<span class="_cDEzb_p13n-sc-price_3mJ9Z">R$\u00a09,30</span>'), SOURCE);
  assert.equal(legacy[0].price, 1299.9);
  assert.equal(dynamic[0].price, 9.3);
});

test('parser suporta preço composto por inteiro e fração', () => {
  const products = parseRankingPage(rankingCardWithPrice('<span class="a-price"><span class="a-price-whole">1.299</span><span class="a-price-fraction">90</span></span>'), SOURCE);
  assert.equal(products[0].price, 1299.9);
});

test('preço vazio rejeitado explicitamente pelo validator', () => {
  const product = parseRankingPage(rankingCardWithPrice('<span class="a-price"><span class="a-price-whole"></span></span>'), SOURCE)[0];
  assert.deepEqual(sanitizeProducts([product]), { products: [], discarded: [{ node_id: '22222222', asin: 'B000000001', rank: 1, reasons: ['PRECO_INVALIDO'] }] });
});

function response(html, status = 200) {
  return { ok: status === 200, status, text: async () => html };
}

test('raiz pública descobre todos os departamentos presentes sem allowlist fixa', () => {
  const html = `
    <a href="/gp/bestsellers/alpha">Categoria Alpha</a>
    <a href="/gp/bestsellers/beta/ref=zg_bs_nav_beta_0">Categoria Beta</a>
    <a href="/gp/bestsellers/alpha/ref=duplicate">Categoria Alpha</a>`;
  assert.deepEqual(parseRootCategories(html), [
    { slug: 'alpha', name: 'Categoria Alpha', url: 'https://www.amazon.com.br/gp/bestsellers/alpha' },
    { slug: 'beta', name: 'Categoria Beta', url: 'https://www.amazon.com.br/gp/bestsellers/beta' }
  ]);
});

test('página do departamento constrói filhos com node_id e parent_node_id públicos', () => {
  const category = { slug: 'alpha', name: 'Categoria Alpha', url: `${BEST_SELLERS_ROOT}/alpha` };
  const tree = parseCategoryTree(categoryPage('alpha', '11111111', [
    { node_id: '22222222', name: 'Subcategoria Um' },
    { node_id: '33333333', name: 'Subcategoria Dois' }
  ]), category);
  assert.equal(tree.node_id, '11111111');
  assert.deepEqual(tree.subcategories, [
    {
      category: 'Categoria Alpha', subcategory: 'Subcategoria Um', node_id: '22222222',
      parent_node_id: '11111111', source_url: `${BEST_SELLERS_ROOT}/alpha/22222222`
    },
    {
      category: 'Categoria Alpha', subcategory: 'Subcategoria Dois', node_id: '33333333',
      parent_node_id: '11111111', source_url: `${BEST_SELLERS_ROOT}/alpha/33333333`
    }
  ]);
});

test('parser do ranking entrega Top20 com contrato completo antes dos calculados', () => {
  const source = {
    category: 'Categoria Alpha', subcategory: 'Subcategoria Um', node_id: '22222222',
    parent_node_id: '11111111', source_url: `${BEST_SELLERS_ROOT}/alpha/22222222`
  };
  const products = parseRankingPage(rankingPage(), source);
  assert.equal(products.length, 20);
  assert.deepEqual(Object.keys(products[0]).sort(), CONTRACT_KEYS);
  assert.equal(products[0].category, 'Categoria Alpha');
  assert.equal(products[0].subcategory, 'Subcategoria Um');
  assert.equal(products[0].node_id, '22222222');
  assert.equal(products[0].parent_node_id, '11111111');
  assert.equal(products[0].image, 'https://images-na.ssl-images-amazon.com/images/I/B000000001.jpg');
  assert.equal(products[0].score, null);
  assert.equal(products[0].novelty, null);
});

test('sanitização exige árvore, identidade, rank, título, imagem e URL', () => {
  const source = {
    category: 'Categoria Alpha', subcategory: 'Subcategoria Um', node_id: '22222222',
    parent_node_id: '11111111', source_url: `${BEST_SELLERS_ROOT}/alpha/22222222`
  };
  const base = parseRankingPage(rankingPage(1), source)[0];
  const invalid = [
    { ...base, category: '' }, { ...base, subcategory: '' }, { ...base, node_id: '' },
    { ...base, parent_node_id: null }, { ...base, asin: 'INVALID' }, { ...base, rank: 21 },
    { ...base, title: '' }, { ...base, image: null }, { ...base, canonical_url: null }
  ];
  const result = sanitizeProducts([base, ...invalid]);
  assert.deepEqual(result.products, [base]);
  assert.equal(result.discarded.length, 9);
});

test('deduplicação mantém o mesmo ASIN em nodes diferentes', () => {
  const source = {
    category: 'Categoria Alpha', subcategory: 'Subcategoria Um', node_id: '22222222',
    parent_node_id: '11111111', source_url: `${BEST_SELLERS_ROOT}/alpha/22222222`
  };
  const first = parseRankingPage(rankingPage(1), source)[0];
  const otherNode = { ...first, node_id: '33333333', subcategory: 'Subcategoria Dois' };
  const result = deduplicate([first, first, otherNode]);
  assert.equal(result.products.length, 2);
  assert.equal(result.duplicates, 1);
});

test('novelty e score são serializados por produto', () => {
  const source = {
    category: 'Categoria Alpha', subcategory: 'Subcategoria Um', node_id: '22222222',
    parent_node_id: '11111111', source_url: `${BEST_SELLERS_ROOT}/alpha/22222222`
  };
  const products = parseRankingPage(rankingPage(2), source);
  const novelty = applyNovelty(products, new Set(['B000000001']));
  assert.equal(novelty.products.length, 1);
  assert.equal(novelty.products[0].novelty, 'NEW');
  novelty.products[0].score = calculateDeterministicScore(novelty.products[0]);
  assert.equal(typeof novelty.products[0].score, 'number');
  assert.deepEqual(validateFinalContract(novelty.products[0]), []);
});

test('pipeline descobre árvore dinamicamente e coleta Top20 por subcategoria', async () => {
  const root = '<a href="/gp/bestsellers/alpha">Categoria Alpha</a><a href="/gp/bestsellers/beta">Categoria Beta</a>';
  const calls = [];
  const result = await runAmazonNativeTop20({
    maxCategories: 2,
    maxSubcategoriesPerCategory: 1,
    fetchImpl: async (url) => {
      calls.push(url);
      if (url === BEST_SELLERS_ROOT) return response(root);
      if (url.endsWith('/alpha')) return response(categoryPage('alpha', '11111111', [{ node_id: '22222222', name: 'Sub A' }]));
      if (url.endsWith('/beta')) return response(categoryPage('beta', '33333333', [{ node_id: '44444444', name: 'Sub B' }]));
      if (url.endsWith('/22222222') || url.endsWith('/44444444')) return response(rankingPage());
      throw new Error(`URL não homologada: ${url}`);
    }
  });
  assert.deepEqual(calls, [
    BEST_SELLERS_ROOT,
    `${BEST_SELLERS_ROOT}/alpha`, `${BEST_SELLERS_ROOT}/alpha/22222222`,
    `${BEST_SELLERS_ROOT}/beta`, `${BEST_SELLERS_ROOT}/beta/44444444`
  ]);
  assert.equal(result.discovered_categories, 2);
  assert.equal(result.tree.length, 2);
  assert.equal(result.tree.flatMap((entry) => entry.subcategories).length, 2);
  assert.equal(result.products.length, 40);
  assert.ok(result.products.every((product) => product.score != null && product.novelty === 'NEW'));
  assert.ok(result.products.every((product) => validateFinalContract(product).length === 0));
});

test('pipeline interrompe diante de HTTP diferente de 200', async () => {
  await assert.rejects(
    runAmazonNativeTop20({ fetchImpl: async () => response('bloqueado', 503), maxCategories: 1, maxSubcategoriesPerCategory: 1 }),
    /HTTP 503/
  );
});

test('dry-run escreve somente JSON local', () => {
  const writes = [];
  writeDryRunJson({ products: [], tree: [] }, { writeFileSync: (file, content) => writes.push({ file, content }) });
  assert.deepEqual(writes.map((entry) => entry.file), ['reports/amazon-native-top20-v5-dry-run.json']);
  assert.deepEqual(JSON.parse(writes[0].content), { products: [], tree: [] });
});

test('módulo não contém allowlist de categorias nem tecnologias proibidas', () => {
  const source = fs.readFileSync(require.resolve('./amazon-native-top20-v5.cjs'), 'utf8');
  for (const forbidden of [
    'CATEGORY_PRIORITY', 'electronics', 'computers', 'automotive', 'playwright', 'crawlee',
    'puppeteer', 'supabase', 'oracle', 'groq', 'openai'
  ]) assert.doesNotMatch(source, new RegExp(forbidden.replace(/[?]/g, '\\?'), 'i'));
});
