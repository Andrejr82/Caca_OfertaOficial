'use strict';

const fs = require('node:fs');
const cheerio = require('cheerio');

const BEST_SELLERS_ROOT = 'https://www.amazon.com.br/gp/bestsellers';
const REPORT_PATH = 'reports/amazon-native-top20-v5-dry-run.json';
const DEFAULT_CATEGORY_LIMIT = 2;
const DEFAULT_SUBCATEGORY_LIMIT = 1;
const PRODUCT_KEYS = [
  'marketplace',
  'category',
  'subcategory',
  'node_id',
  'parent_node_id',
  'source_url',
  'rank',
  'asin',
  'title',
  'image',
  'canonical_url',
  'price',
  'original_price',
  'seller',
  'discount',
  'score',
  'novelty'
];

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function escapePattern(value) {
  return String(value).replace(/[.*+^${}()|[\]\\]/g, '\\$&');
}

function parseBrazilPrice(value) {
  const match = cleanText(value).match(/R\$\s*([\d.]+(?:,\d{2})?)/i);
  if (!match) return null;
  const parsed = Number(match[1].replaceAll('.', '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseRootCategories(html) {
  const $ = cheerio.load(String(html ?? ''));
  const categories = [];
  const seen = new Set();
  $('a[href*="/gp/bestsellers/"]').each((_, element) => {
    const href = String($(element).attr('href') ?? '');
    const match = href.match(/^\/gp\/bestsellers\/([a-z0-9-]+)(?:\/ref=.*)?(?:[/?#].*)?$/i);
    if (!match) return;
    const slug = match[1].toLowerCase();
    const name = cleanText($(element).text());
    if (!name || seen.has(slug)) return;
    seen.add(slug);
    categories.push({ slug, name, url: `${BEST_SELLERS_ROOT}/${slug}` });
  });
  return categories;
}

function findParentNodeId($, slug) {
  const exact = $(`a[data-csa-c-content-id="nav_cs_${slug}"]`).first().attr('href') ?? '';
  const contextual = $(`#nav-progressive-subnav[data-category="${slug}"] a[href*="node="]`).first().attr('href') ?? '';
  return String(exact || contextual).match(/[?&]node=(\d{6,})/i)?.[1] ?? null;
}

function parseCategoryTree(html, category) {
  const $ = cheerio.load(String(html ?? ''));
  const parentNodeId = findParentNodeId($, category.slug);
  const children = [];
  const seen = new Set();
  const childPattern = new RegExp(`^/gp/bestsellers/${escapePattern(category.slug)}/(\\d{6,})(?:/ref=.*)?(?:[?#].*)?$`, 'i');

  $('a[href*="/gp/bestsellers/"]').each((_, element) => {
    const href = String($(element).attr('href') ?? '');
    const match = href.match(childPattern);
    if (!match || seen.has(match[1])) return;
    const name = cleanText($(element).text());
    if (!name) return;
    seen.add(match[1]);
    children.push({
      category: category.name,
      subcategory: name,
      node_id: match[1],
      parent_node_id: parentNodeId,
      source_url: `${BEST_SELLERS_ROOT}/${category.slug}/${match[1]}`
    });
  });

  return {
    category: category.name,
    slug: category.slug,
    node_id: parentNodeId,
    source_url: category.url,
    subcategories: children
  };
}

function parseRankingPage(html, source) {
  const $ = cheerio.load(String(html ?? ''));
  const byRank = new Map();

  $('div[data-asin]').each((_, element) => {
    const root = $(element);
    const asin = String(root.attr('data-asin') ?? '').trim().toUpperCase();
    const rankMatch = cleanText(root.find('.zg-bdg-text').first().text()).match(/^#\s*(\d{1,2})$/);
    const rank = rankMatch ? Number(rankMatch[1]) : null;
    if (!rank || rank > 20 || byRank.has(rank)) return;

    const productLink = root.find(`a[href*="/dp/${asin}"]`).first().attr('href') ?? '';
    if (/Patrocinado|Sponsored/i.test(cleanText(root.text())) || /\/sspa\//i.test(productLink)) return;

    const picture = root.find('img[src]').first();
    const title = cleanText(
      picture.attr('alt')
      || root.find('[class*="line-clamp"], .p13n-sc-truncate').first().text()
      || root.find(`a[href*="/dp/${asin}"]`).first().text()
    );

    byRank.set(rank, {
      marketplace: 'Amazon',
      category: source.category,
      subcategory: source.subcategory,
      node_id: source.node_id,
      parent_node_id: source.parent_node_id,
      source_url: source.source_url,
      rank,
      asin,
      title,
      image: cleanText(picture.attr('src')) || null,
      canonical_url: /^[A-Z0-9]{10}$/.test(asin) ? `https://www.amazon.com.br/dp/${asin}` : null,
      price: parseBrazilPrice(root.find('.p13n-sc-price, .a-price .a-offscreen').first().text()),
      original_price: null,
      seller: null,
      discount: null,
      score: null,
      novelty: null
    });
  });

  return [...byRank.values()].sort((left, right) => left.rank - right.rank);
}

function validateProduct(product) {
  const reasons = [];
  if (!cleanText(product.category)) reasons.push('category');
  if (!cleanText(product.subcategory)) reasons.push('subcategory');
  if (!/^\d{6,}$/.test(String(product.node_id ?? ''))) reasons.push('node_id');
  if (!/^\d{6,}$/.test(String(product.parent_node_id ?? ''))) reasons.push('parent_node_id');
  if (!Number.isInteger(product.rank) || product.rank < 1 || product.rank > 20) reasons.push('rank');
  if (!/^[A-Z0-9]{10}$/.test(String(product.asin ?? ''))) reasons.push('asin');
  if (!cleanText(product.title)) reasons.push('title');
  if (!/^https?:\/\//i.test(String(product.image ?? ''))) reasons.push('image');
  if (!/^https:\/\/www\.amazon\.com\.br\/dp\/[A-Z0-9]{10}$/i.test(String(product.canonical_url ?? ''))) reasons.push('canonical_url');
  if (!/^https:\/\/www\.amazon\.com\.br\/gp\/bestsellers\//i.test(String(product.source_url ?? ''))) reasons.push('source_url');
  if (Object.keys(product).length !== PRODUCT_KEYS.length || PRODUCT_KEYS.some((key) => !(key in product))) reasons.push('contract');
  return reasons;
}

function validateFinalContract(product) {
  const reasons = validateProduct(product);
  if (!Number.isFinite(product.score)) reasons.push('score');
  if (product.novelty !== 'NEW') reasons.push('novelty');
  return reasons;
}

function sanitizeProducts(products) {
  const valid = [];
  const discarded = [];
  for (const product of products) {
    const reasons = validateProduct(product);
    if (reasons.length) discarded.push({ node_id: product?.node_id ?? null, asin: product?.asin ?? null, rank: product?.rank ?? null, reasons });
    else valid.push(product);
  }
  return { products: valid, discarded };
}

function deduplicate(products) {
  const seen = new Set();
  const unique = [];
  let duplicates = 0;
  for (const product of products) {
    const key = `${product.node_id}:${product.asin}`;
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    unique.push(product);
  }
  return { products: unique, duplicates };
}

function applyNovelty(products, knownAsins = new Set()) {
  const known = knownAsins instanceof Set ? knownAsins : new Set(knownAsins ?? []);
  const novel = products.filter((product) => !known.has(product.asin)).map((product) => ({ ...product, novelty: 'NEW' }));
  return { products: novel, existing: products.length - novel.length };
}

// Fórmula V1 existente, mantida sem alteração.
function calculateDeterministicScore(product) {
  const price = product.price || 0;
  const oldPrice = product.original_price || 0;
  let discountScore = 0;
  if (oldPrice > price) {
    const pct = (oldPrice - price) / oldPrice;
    if (price >= 1500 && pct >= 0.10) discountScore = 10;
    else if (pct >= 0.05 && pct <= 0.80) discountScore = Math.min((pct / 0.5) * 10, 10);
    else if (pct > 0.80) discountScore = 2;
  }
  const priceScore = price <= 90 ? 10 : (price <= 300 ? 8 : (price <= 700 ? 5 : 2));
  const impulseScore = price <= 90 ? 10 : (price <= 150 ? 8 : (price <= 300 ? 5 : 2));
  const ratingScore = 5;
  return Number(((discountScore * 0.35) + (priceScore * 0.30) + (impulseScore * 0.20) + (ratingScore * 0.15)).toFixed(2));
}

async function fetchHtml(url, fetchImpl) {
  const response = await fetchImpl(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'pt-BR,pt;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36'
    },
    redirect: 'follow'
  });
  if (!response.ok || response.status !== 200) throw new Error(`HTTP ${response.status} ${url}`);
  const html = await response.text();
  if (/Robot Check|Digite os caracteres/i.test(html)) throw new Error(`HTTP 200 com desafio anti-automação: ${url}`);
  return html;
}

async function runAmazonNativeTop20({
  fetchImpl = global.fetch,
  maxCategories = DEFAULT_CATEGORY_LIMIT,
  maxSubcategoriesPerCategory = DEFAULT_SUBCATEGORY_LIMIT,
  knownAsins = new Set()
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('Transporte HTTP indisponível');
  const rootHtml = await fetchHtml(BEST_SELLERS_ROOT, fetchImpl);
  const discovered = parseRootCategories(rootHtml);
  if (!discovered.length) throw new Error('Nenhum departamento público descoberto');

  const tree = [];
  const collected = [];
  const rankings = [];
  let httpCalls = 1;

  for (const category of discovered) {
    if (tree.length >= maxCategories) break;
    const categoryHtml = await fetchHtml(category.url, fetchImpl);
    httpCalls += 1;
    const categoryTree = parseCategoryTree(categoryHtml, category);
    if (!categoryTree.node_id || !categoryTree.subcategories.length) continue;
    tree.push(categoryTree);

    for (const subcategory of categoryTree.subcategories.slice(0, maxSubcategoriesPerCategory)) {
      const rankingHtml = await fetchHtml(subcategory.source_url, fetchImpl);
      httpCalls += 1;
      const parsed = parseRankingPage(rankingHtml, subcategory);
      const sanitized = sanitizeProducts(parsed);
      rankings.push({
        category: subcategory.category,
        subcategory: subcategory.subcategory,
        node_id: subcategory.node_id,
        parent_node_id: subcategory.parent_node_id,
        source_url: subcategory.source_url,
        collected: parsed.length,
        valid: sanitized.products.length,
        discarded: sanitized.discarded.length,
        http_status: 200
      });
      if (sanitized.products.length !== 20) throw new Error(`Top 20 incompleto em ${subcategory.subcategory}: ${sanitized.products.length}/20`);
      collected.push(...sanitized.products);
    }
  }

  if (tree.length < maxCategories) throw new Error(`Categorias com árvore pública insuficientes: ${tree.length}/${maxCategories}`);
  const unique = deduplicate(collected);
  const novelty = applyNovelty(unique.products, knownAsins);
  const products = novelty.products.map((product) => ({ ...product, score: calculateDeterministicScore(product) }));
  const contractErrors = products.flatMap((product) => validateFinalContract(product));
  if (contractErrors.length) throw new Error(`Contrato V5 inválido: ${[...new Set(contractErrors)].join(',')}`);

  return {
    pipeline: 'Amazon Discovery V5',
    dry_run: true,
    discovered_categories: discovered.length,
    discovered_subcategories: tree.reduce((total, category) => total + category.subcategories.length, 0),
    tree,
    rankings,
    products,
    raw_products: collected.length,
    duplicates: unique.duplicates,
    novelty_existing: novelty.existing,
    scores_calculated: products.length,
    http_calls: httpCalls
  };
}

function writeDryRunJson(result, { writeFileSync = fs.writeFileSync } = {}) {
  writeFileSync(REPORT_PATH, `${JSON.stringify(result, null, 2)}\n`);
  return REPORT_PATH;
}

function readPositiveLimit(args, name, fallback) {
  const raw = args.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1];
  const parsed = Number(raw ?? fallback);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function main() {
  if (!process.argv.includes('--dry-run')) throw new Error('Execução permitida somente com --dry-run');
  const args = process.argv.slice(2);
  const result = await runAmazonNativeTop20({
    maxCategories: readPositiveLimit(args, 'max-categories', DEFAULT_CATEGORY_LIMIT),
    maxSubcategoriesPerCategory: readPositiveLimit(args, 'max-subcategories', DEFAULT_SUBCATEGORY_LIMIT)
  });
  writeDryRunJson(result);
  process.stdout.write(`${JSON.stringify({
    file: REPORT_PATH,
    discovered_categories: result.discovered_categories,
    tree_categories: result.tree.length,
    subcategories: result.rankings.length,
    products: result.products.length,
    http_calls: result.http_calls
  })}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  BEST_SELLERS_ROOT,
  PRODUCT_KEYS,
  applyNovelty,
  calculateDeterministicScore,
  deduplicate,
  parseCategoryTree,
  parseRankingPage,
  parseRootCategories,
  runAmazonNativeTop20,
  sanitizeProducts,
  validateFinalContract,
  writeDryRunJson
};
