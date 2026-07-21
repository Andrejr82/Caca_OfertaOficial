'use strict';

const fs = require('node:fs');
const path = require('node:path');
const scenarioConfig = require('./shopee-scenario-config.cjs');

const CATALOG_PATH = path.join(__dirname, 'shopee-native-categories.json');
const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_MAX_PAGES_PER_KEYWORD = 3;
const SCORE_RULES = {
  sales: [[10000, 30], [5000, 22], [1000, 15]],
  discount: [[50, 25], [40, 20], [25, 15]],
  price: [[300, 12], [100, 10], [30, 8], [15, 3]],
  rating: [[4.9, 15], [4.7, 10], [4.5, 5]],
  commission: [[15, 12], [10, 8], [7, 5]]
};

function loadCertifiedCatalog(catalogPath = CATALOG_PATH) {
  // Legacy method. No longer used for real discovery, kept for backward compatibility in scraper initialization.
  try {
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    return catalog;
  } catch {
    return { categories: [] };
  }
}

function productFields() {
  return 'itemId productName priceMin priceMax imageUrl productLink offerLink sales commissionRate sellerCommissionRate shopeeCommissionRate ratingStar priceDiscountRate shopId shopName productCatIds';
}

function buildProductOfferPayload(keyword = null, productCatId = null, page = 1, limit = DEFAULT_PAGE_SIZE) {
  return {
    operationName: 'ShopeePromotionOffers',
    query: `query ShopeePromotionOffers($keyword: String, $productCatId: Int, $page: Int, $limit: Int, $sortType: Int, $isAMSOffer: Boolean) { productOfferV2(keyword: $keyword, productCatId: $productCatId, page: $page, limit: $limit, sortType: $sortType, isAMSOffer: $isAMSOffer) { nodes { ${productFields()} } pageInfo { page limit hasNextPage } } }`,
    variables: { keyword, productCatId, page, limit, sortType: 2, isAMSOffer: true }
  };
}

function number(value) {
  const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value));
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return String(value).trim().replace(/\/$/, '');
  }
}

function sanitizeProduct(node, category) {
  const price = number(node?.priceMin) || number(node?.priceMax);
  if (!node?.itemId || !String(node?.productName || '').trim() || !node?.productLink || price <= 0) return null;
  return {
    itemId: String(node.itemId),
    shopId: node.shopId == null ? null : String(node.shopId),
    productName: String(node.productName).trim(),
    productLink: String(node.productLink),
    offerLink: node.offerLink || node.productLink,
    imageUrl: node.imageUrl || null,
    price,
    originalPrice: number(node.priceMax) > price ? number(node.priceMax) : null,
    discount: number(node.priceDiscountRate),
    sales: number(node.sales),
    rating: number(node.ratingStar),
    commissionRate: number(node.commissionRate),
    sellerCommissionRate: number(node.sellerCommissionRate),
    shopeeCommissionRate: number(node.shopeeCommissionRate),
    seller: node.shopName || null,
    productCatIds: Array.isArray(node.productCatIds) ? node.productCatIds.map(String) : [],
    productCatId: category.productCatId,
    category: category.name,
    categoryOrder: category.order,
    normalizedUrl: normalizeUrl(node.productLink),
    status: 'pending_manual_review'
  };
}

function points(value, rules) {
  return rules.find(([threshold]) => value >= threshold)?.[1] || 0;
}

function calculateObjectiveScore(product) {
  let commission = product.commissionRate || product.sellerCommissionRate || product.shopeeCommissionRate || 0;
  if (commission > 0 && commission <= 1) commission *= 100;
  let score = points(product.sales, SCORE_RULES.sales)
    + points(product.discount, SCORE_RULES.discount)
    + points(product.price, SCORE_RULES.price)
    + points(product.rating, SCORE_RULES.rating)
    + points(commission, SCORE_RULES.commission);
  if (product.sales < 100) score -= 15;
  if (!product.discount) score -= 8;
  if (product.price < 15) score -= 40;
  if (product.rating > 0 && product.rating < 4.3) score -= 20;
  return score;
}

function validateShopeeV5Contract(product) {
  const errors = [];
  const numericId = value => /^\d+$/.test(String(value ?? ''));
  const nullableNumber = value => value == null || (typeof value === 'number' && Number.isFinite(value));
  const category = String(product?.category ?? '').trim();

  if (!numericId(product?.itemId)) errors.push('itemId_required');
  if (!numericId(product?.productCatId)) errors.push('productCatId_required');
  if (!category || category.toLowerCase() === 'geral') errors.push('native_category_required');
  if (product?.rating != null && (!nullableNumber(product.rating) || product.rating < 0 || product.rating > 5)) errors.push('rating_invalid');
  for (const field of ['sales', 'discount', 'commissionRate', 'score']) {
    if (!nullableNumber(product?.[field])) errors.push(`${field}_invalid`);
  }
  if (!['pending_manual_review', 'selected', 'rejected', 'posted'].includes(product?.status)) errors.push('status_invalid');
  return { valid: errors.length === 0, errors };
}

function dedupeGlobally(products) {
  const seen = new Set();
  return products.filter((product) => {
    const keys = [
      product.itemId && `item:${product.itemId}`,
      product.itemId && product.shopId && `shopItem:${product.shopId}:${product.itemId}`,
      product.normalizedUrl && `url:${product.normalizedUrl}`
    ].filter(Boolean);
    if (keys.some((key) => seen.has(key))) return false;
    keys.forEach((key) => seen.add(key));
    return true;
  });
}

function applyNovelty(products, isNovel = () => true) {
  return products.filter(isNovel);
}

function compareProducts(a, b) {
  return b.score - a.score
    || b.sales - a.sales
    || b.discount - a.discount
    || b.rating - a.rating
    || b.commissionRate - a.commissionRate
    || a.itemId.localeCompare(b.itemId);
}

function rankTop20ByCategory(products, categories, limit = 20) {
  return categories.map((category) => ({
    ...category,
    products: products
      .filter((product) => product.productCatId === category.productCatId)
      .sort(compareProducts)
      .slice(0, limit)
      .map((product, index) => ({ ...product, position: index + 1 }))
  }));
}

function getShopeeMaxOffersPerCycle() {
  const configured = Number(process.env.SHOPEE_MAX_OFFERS_PER_CYCLE || 100);
  return Number.isFinite(configured) && configured > 0 ? Math.min(Math.floor(configured), 1000) : 100;
}

async function runNativeDiscovery({
  fetchProducts,
  isNovel = () => true,
  persistFinalists,
  dryRun = false,
  scenario,
  categories = null,
  pageSize = DEFAULT_PAGE_SIZE,
  maxPagesPerKeyword = DEFAULT_MAX_PAGES_PER_KEYWORD,
  maxFinalists = 20,
}) {
  const currentHour = scenarioConfig.getSaoPauloHour();
  const activeScenario = scenario || scenarioConfig.getActiveScenario(currentHour);
  
  // Combina as chamadas de categoria e chamadas de keyword
  const apiCategories = activeScenario.apiCategories || [];
  const keywords = activeScenario.keywords || [];
  
  const explicitCategories = Array.isArray(categories) && categories.length > 0 ? categories : null;
  const categoryIds = explicitCategories ? explicitCategories.map((category) => category.productCatId) : apiCategories;
  const queries = [];
  categoryIds.forEach(catId => queries.push({ type: 'category', value: catId }));
  // Para não explodir o tempo, a gente sorteia 10 keywords caso seja uma execução agendada (se o array for muito grande)
  const keywordsToFetch = explicitCategories ? [] : scenarioConfig.getRandomItems(keywords, 10);
  keywordsToFetch.forEach(kw => queries.push({ type: 'keyword', value: kw }));

  console.log(`[Shopee V5] Cenário ativo para ${currentHour}h: ${activeScenario.name}`);
  console.log(`[Shopee V5] Categorias API: ${apiCategories.join(', ') || 'Nenhuma'}`);
  console.log(`[Shopee V5] Keywords sorteadas: ${keywordsToFetch.join(' | ')}`);

  const categoryMock = {
    productCatId: activeScenario.productCatId || apiCategories[0] || 0,
    name: activeScenario.name,
    order: 1,
    active: true
  };

  const categoryResults = explicitCategories
    ? explicitCategories.map((category) => ({ ...category, products: [], error: null }))
    : (categoryIds.length ? categoryIds : [categoryMock.productCatId]).map((productCatId, index) => ({
        productCatId,
        name: activeScenario.name,
        order: index + 1,
        active: true,
        products: [],
        error: null
      }));
  const raw = [];
  let calls = 0;
  let pagesFetched = 0;
  let emptyResponses = 0;
  let apiErrors = 0;
  let rateLimited = false;

  for (const q of queries) {
    for (let page = 1; page <= maxPagesPerKeyword; page += 1) {
      const keywordArg = q.type === 'keyword' ? q.value : null;
      const catArg = q.type === 'category' ? q.value : null;
      let payload;
      let currentCatId = activeScenario.productCatId || apiCategories[0] || 0;
      
      if (q.type === 'category') {
        currentCatId = q.value;
        payload = buildProductOfferPayload(null, q.value, page, 20);
      } else {
        payload = buildProductOfferPayload(q.value, null, page, 20);
      }
      
      const dynamicCategoryMock = {
        productCatId: currentCatId,
        name: activeScenario.name,
        order: 1,
        active: true
      };
      
      console.log(`[Shopee V5] Buscando... type=${q.type}, value=${q.value}, page=${page}`);
      calls++;
      pagesFetched++;
      
      const startTime = Date.now();
      const response = await fetchProducts(dynamicCategoryMock, payload);
      const elapsed = Date.now() - startTime;
      console.log(`[Shopee V5] Retornou em ${elapsed}ms com HTTP ${response.http} | itens: ${Array.isArray(response.nodes) ? response.nodes.length : 0}`);
      
      if (response.http === 429) {
        categoryResults[0].error = { http: 429, retryAfter: response.retryAfter || null };
        rateLimited = true;
        break;
      }
      if (response.http !== 200 || response.error) apiErrors++;
      const nodes = Array.isArray(response.nodes) ? response.nodes : [];
      if (!nodes.length) emptyResponses++;
      nodes.forEach((node) => raw.push({ node, category: dynamicCategoryMock }));
      const hasNextPage = response.pageInfo?.hasNextPage === true;
      if (!hasNextPage) break;
    }
    if (rateLimited) break;
    // Evitar Rate Limit da API Oficial
    await new Promise(r => setTimeout(r, 1500));
  }

  const sanitized = raw.map(({ node, category }) => sanitizeProduct(node, category)).filter(Boolean);
  const deduplicated = dedupeGlobally(sanitized);
  const novel = applyNovelty(deduplicated, isNovel).map((product) => ({ ...product, score: calculateObjectiveScore(product) }));
  
  // Opcional: penalizar levemente itens muito repetidos se houver, mas a API já retornou o top de cada keyword.
  const ranked = rankTop20ByCategory(novel, categoryResults, maxFinalists);
  const finalists = ranked
    .flatMap((category) => category.products)
    .sort(compareProducts)
    .slice(0, maxFinalists)
    .map((product, index) => ({ ...product, position: index + 1 }));
  
  if (!dryRun && typeof persistFinalists === 'function') {
    await persistFinalists(finalists);
  }

  return {
    categories: ranked,
    calls,
    metrics: {
      raw: raw.length,
      sanitized: sanitized.length,
      deduplicated: deduplicated.length,
      invalid: raw.length - sanitized.length,
      duplicates: sanitized.length - deduplicated.length,
      novel: novel.length,
      final: finalists.length,
      pagesFetched,
      emptyResponses,
      apiErrors,
      rateLimited
    },
    aiCalled: false,
    postsCreated: 0
  };
}

module.exports = {
  CATALOG_PATH,
  DEFAULT_PAGE_SIZE,
  DEFAULT_MAX_PAGES_PER_KEYWORD,
  loadCertifiedCatalog,
  buildProductOfferPayload,
  sanitizeProduct,
  validateShopeeV5Contract,
  calculateObjectiveScore,
  dedupeGlobally,
  applyNovelty,
  rankTop20ByCategory,
  getShopeeMaxOffersPerCycle,
  runNativeDiscovery
};
