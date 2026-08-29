'use strict';

const fs = require('node:fs');
const cheerio = require('cheerio');

const BEST_SELLERS_ROOT = 'https://www.amazon.com.br/gp/bestsellers';
const REPORT_PATH = 'reports/amazon-native-top20-v5-dry-run.json';
const DEFAULT_CATEGORY_LIMIT = 10;
const DEFAULT_SUBCATEGORY_LIMIT = 3;
const DEFAULT_MAX_PER_KEYWORD = 50;
const SEARCH_ROOT = 'https://www.amazon.com.br/s';
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
  'novelty',
  'marketplaceMetrics'
];

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function escapePattern(value) {
  return String(value).replace(/[.*+^${}()|[\]\\]/g, '\\$&');
}

function parseBrazilPrice(value) {
  const text = cleanText(value).replace(/\u00a0/g, ' ');
  if (/\d+\s*x\s*R\$/i.test(text)) return null;
  const match = text.match(/(?:R\$\s*)?([\d.]+(?:,\d{2})?|\d+(?:,\d{2})?)/i);
  if (!match) return null;
  const parsed = Number(match[1].replaceAll('.', '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function extractProductPrice(root) {
  for (const selector of ['.a-price .a-offscreen', '.p13n-sc-price', '[class*="p13n-sc-price"]']) {
    const price = parseBrazilPrice(root.find(selector).first().text());
    if (price != null) return price;
  }
  const whole = cleanText(root.find('.a-price-whole').first().text());
  const fraction = cleanText(root.find('.a-price-fraction').first().text());
  if (whole) return parseBrazilPrice(fraction ? `${whole},${fraction}` : whole);
  return null;
}

function extractProductCommercials(root, price) {
  let original_price = parseBrazilPrice(root.find('.a-text-price .a-offscreen').first().text());
  if (original_price <= price) original_price = null;
  const discount = original_price ? ((original_price - price) / original_price) * 100 : null;

  const textLower = cleanText(root.text()).toLowerCase();
  const prime = root.find('.a-icon-prime').length > 0 || /\bprime\b/i.test(textLower);
  const coupon = root.find('.s-coupon-highlight-color, .s-coupon-unclipped').length > 0;
  const promotion = root.find('.savingPriceOverride, .promoPrice').length > 0;

  // Rating: cascata de seletores por especificidade decrescente.
  // Seletores alternativos cobrem layouts de Best Sellers e Search.
  let rating = null;
  const RATING_SELECTORS = [
    '.a-icon-star-small .a-icon-alt',   // Best Sellers — texto dentro do ícone
    '.a-icon-star-small',                // variação compacta sem span interno
    '.a-icon-alt',                       // Search — span direto com "4,5 de 5 estrelas"
    '[data-hook="average-star-rating"] .a-icon-alt',
    'i.a-star-small .a-icon-alt',
  ];
  for (const sel of RATING_SELECTORS) {
    const text = root.find(sel).first().text();
    const match = text.match(/(\d+[.,]\d+)/);
    if (match) {
      rating = Number(match[1].replace(',', '.'));
      if (rating >= 1 && rating <= 5) break;
      rating = null;
    }
  }

  // reviewCount: prioriza link #customerReviews antes dos seletores genéricos.
  let reviewCount = null;
  const REVIEW_SELECTORS = [
    'a[href*="#customerReviews"] > span.a-size-small',
    'a[href*="#customerReviews"] .a-size-small',
    'a[href*="customerReviews"] span',
    '.a-size-small.a-link-normal',
  ];
  for (const sel of REVIEW_SELECTORS) {
    const text = root.find(sel).first().text().replace(/\./g, '').replace(/,/g, '');
    const match = text.match(/^(\d+)/);
    if (match) {
      reviewCount = Number(match[1]);
      if (reviewCount > 0) break;
      reviewCount = null;
    }
  }

  return {
    original_price,
    discount: discount !== null ? Math.max(0, Math.min(100, discount)) : null,
    marketplaceMetrics: { prime, coupon, promotion, rating, reviewCount }
  };
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

    const price = extractProductPrice(root);
    const commercials = extractProductCommercials(root, price);

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
      price,
      original_price: commercials.original_price,
      seller: null,
      discount: commercials.discount,
      score: null,
      novelty: null,
      marketplaceMetrics: commercials.marketplaceMetrics
    });
  });

  return [...byRank.values()].sort((left, right) => left.rank - right.rank);
}

function parseSearchPage(html, source) {
  const $ = cheerio.load(String(html ?? ''));
  const products = [];
  $('div[data-component-type="s-search-result"][data-asin]').each((index, element) => {
    if (products.length >= 20) return;
    const root = $(element);
    const asin = String(root.attr('data-asin') ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(asin) || /Patrocinado|Sponsored/i.test(cleanText(root.text()))) return;
    const link = root.find(`a[href*="/dp/${asin}"]`).first().attr('href') ?? '';
    if (/\/sspa\//i.test(link)) return;
    const image = root.find('img[src]').first();
    const title = cleanText(root.find('h2').first().text() || image.attr('alt'));
    const price = extractProductPrice(root);
    const commercials = extractProductCommercials(root, price);
    products.push({
      marketplace: 'Amazon', category: source.category || 'Cenário Amazon', subcategory: source.subcategory || source.keyword,
      node_id: source.node_id, parent_node_id: source.parent_node_id, source_url: source.source_url,
      rank: products.length + 1, asin, title, image: cleanText(image.attr('src')) || null,
      canonical_url: `https://www.amazon.com.br/dp/${asin}`, price,
      original_price: commercials.original_price, seller: null, discount: commercials.discount, score: null, novelty: null,
      marketplaceMetrics: commercials.marketplaceMetrics
    });
  });
  return products;
}

function validateProduct(product) {
  const reasons = [];
  if (!cleanText(product.category)) reasons.push('category');
  if (!cleanText(product.subcategory)) reasons.push('subcategory');
  if (!/^\d{6,}$/.test(String(product.node_id ?? ''))) reasons.push('node_id');
  if (product.parent_node_id !== null && product.parent_node_id !== undefined && !/^\d{6,}$/.test(String(product.parent_node_id))) reasons.push('parent_node_id');
  if (!Number.isInteger(product.rank) || product.rank < 1 || product.rank > 20) reasons.push('rank');
  if (!/^[A-Z0-9]{10}$/.test(String(product.asin ?? ''))) reasons.push('asin');
  if (!cleanText(product.title)) reasons.push('title');
  if (!/^https?:\/\//i.test(String(product.image ?? ''))) reasons.push('image');
  if (!Number.isFinite(Number(product.price)) || Number(product.price) <= 0) reasons.push('PRECO_INVALIDO');
  if (!/^https:\/\/www\.amazon\.com\.br\/dp\/[A-Z0-9]{10}$/i.test(String(product.canonical_url ?? ''))) reasons.push('canonical_url');
  if (!/^https:\/\/www\.amazon\.com\.br\/(?:gp\/bestsellers\/|s\?(?:k=[^&]+(?:&rh=n%3A|&rh=n:)|rh=n:))/i.test(String(product.source_url ?? ''))) reasons.push('source_url');
  if (Object.keys(product).length !== PRODUCT_KEYS.length || PRODUCT_KEYS.some((key) => !(key in product))) reasons.push('contract');
  return reasons;
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function runAmazonScenarioDryRun({
  scenario,
  fetchImpl = global.fetch,
  maxPerKeyword = DEFAULT_MAX_PER_KEYWORD,
  minDelayMs = 2000,
  retryDelayMs = 10000,
  maxRetries = 1,
  correlationId = null,
  schedulerSource = 'unknown',
  releaseId = 'unknown'
} = {}) {
  if (!scenario || ((!Array.isArray(scenario.keywords) || scenario.keywords.length === 0) && (!Array.isArray(scenario.browseNodeIds) || scenario.browseNodeIds.length === 0))) throw new Error('Cenário Amazon sem termos ou browse nodes');
  const collected = [];
  const queries = [];
  let httpCalls = 0;
  const browseNodeIds = [...new Set((scenario.browseNodeIds || scenario.apiCategories || []).map(String).filter((id) => /^\d{6,}$/.test(id)))];
  const keywords = scenario.keywords || [];
  const querySpecs = browseNodeIds.length && keywords.length
    // Cada alias é consultado pelo menos uma vez; os browse nodes são
    // distribuídos em round-robin para cobrir toda a intenção sem multiplicar
    // todas as combinações termo × categoria.
    ? keywords.map((keyword, index) => ({ browseNodeId: browseNodeIds[index % browseNodeIds.length], keyword }))
    : browseNodeIds.length
      ? browseNodeIds.map((browseNodeId) => ({ browseNodeId, keyword: '' }))
    : (scenario.keywords || []).map((keyword) => ({ keyword }));
  for (let index = 0; index < querySpecs.length; index += 1) {
    const { keyword, browseNodeId } = querySpecs[index];
    const url = browseNodeId
      ? `${SEARCH_ROOT}?${keyword ? `k=${encodeURIComponent(keyword)}&` : ''}rh=n:${encodeURIComponent(browseNodeId)}`
      : `${SEARCH_ROOT}?k=${encodeURIComponent(keyword)}`;
    const source = {
      keyword,
      category: scenario.label || scenario.id || 'Cenário Amazon',
      subcategory: browseNodeId ? `browse_node:${browseNodeId}` : keyword,
      source_url: url,
      node_id: browseNodeId || null,
      parent_node_id: null
    };
    if (index > 0 && minDelayMs > 0) await sleep(minDelayMs);
    let queryResult = null;
    const attempts = [];
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const attemptStartedAt = Date.now();
      try {
        const html = await fetchHtml(url, fetchImpl);
        httpCalls += 1;
        const parsed = parseSearchPage(html, source).slice(0, maxPerKeyword);
        const sanitized = sanitizeProducts(parsed);
        const responseBytes = Buffer.byteLength(String(html ?? ''), 'utf8');
        const status = sanitized.products.length > 0
          ? 'ok'
          : responseBytes === 0 ? 'empty_response' : 'parse_empty';
        const attemptResult = {
          attempt,
          http_status: 200,
          retry_count: attempt,
          latency_ms: Date.now() - attemptStartedAt,
          response_bytes: responseBytes,
          parser_count: parsed.length,
          structurally_valid_count: sanitized.products.length,
          status,
        };
        attempts.push(attemptResult);
        queryResult = {
          keyword: keyword || null,
          browse_node_id: browseNodeId || null,
          request_url: url,
          fetch_path: 'global.fetch',
          provider: 'amazon_public_search',
          correlation_id: correlationId,
          scenario: scenario.id || scenario.scenarioId || scenario.label || null,
          attempt,
          collected: parsed.length,
          valid: sanitized.products.length,
          discarded: sanitized.discarded.length,
          http_status: 200,
          retry_count: attempt,
          latency_ms: attemptResult.latency_ms,
          response_bytes: responseBytes,
          parser_count: parsed.length,
          structurally_valid_count: sanitized.products.length,
          status,
          attempts,
        };
        if (sanitized.products.length > 0 || attempt >= maxRetries) {
          collected.push(...sanitized.products);
          break;
        }
      } catch (error) {
        const status = classifyAmazonQueryError(error);
        const attemptResult = {
          attempt,
          http_status: Number.isInteger(error?.httpStatus) ? error.httpStatus : null,
          retry_count: attempt,
          latency_ms: Date.now() - attemptStartedAt,
          response_bytes: Number.isFinite(error?.responseBytes) ? error.responseBytes : null,
          parser_count: 0,
          structurally_valid_count: 0,
          status,
          error_code: String(error?.code || 'AMAZON_FETCH_ERROR').slice(0, 80),
          error_message: sanitizeAmazonError(error),
        };
        attempts.push(attemptResult);
        queryResult = {
          keyword: keyword || null,
          browse_node_id: browseNodeId || null,
          request_url: url,
          fetch_path: 'global.fetch',
          provider: 'amazon_public_search',
          correlation_id: correlationId,
          scenario: scenario.id || scenario.scenarioId || scenario.label || null,
          attempt,
          collected: 0,
          valid: 0,
          discarded: 0,
          http_status: attemptResult.http_status,
          retry_count: attempt,
          latency_ms: attemptResult.latency_ms,
          response_bytes: attemptResult.response_bytes,
          parser_count: 0,
          structurally_valid_count: 0,
          status,
          error_code: attemptResult.error_code,
          error_message: attemptResult.error_message,
          attempts,
        };
        if (attempt >= maxRetries) break;
      }
      if (retryDelayMs > 0) await sleep(retryDelayMs);
    }
    queries.push(queryResult ?? { keyword: keyword || null, browse_node_id: browseNodeId || null, request_url: url, fetch_path: 'global.fetch', provider: 'amazon_public_search', correlation_id: correlationId, scenario: scenario.id || scenario.scenarioId || scenario.label || null, attempt: maxRetries, collected: 0, valid: 0, discarded: 0, http_status: null, retry_count: maxRetries, latency_ms: 0, response_bytes: null, parser_count: 0, structurally_valid_count: 0, status: 'transport_error', error_code: 'AMAZON_FETCH_ERROR', error_message: 'No query result', attempts });
  }
  const unique = deduplicate(collected);
  const novelty = applyNovelty(unique.products);
  const products = novelty.products.map((product) => ({ ...product, score: calculateDeterministicScore(product) }));
  const contractErrors = products.flatMap((product) => validateFinalContract(product));
  if (contractErrors.length) throw new Error(`Contrato V5 inválido: ${[...new Set(contractErrors)].join(',')}`);
  const telemetryTotals = {
    attempted: queries.length,
    succeeded: queries.filter((query) => query.status === 'ok').length,
    failed: queries.filter((query) => ['http_error', 'transport_error'].includes(query.status)).length,
    empty: queries.filter((query) => ['empty_response', 'parse_empty'].includes(query.status)).length,
  };
  const sourceStatus = telemetryTotals.failed > 0
    ? telemetryTotals.succeeded > 0 || telemetryTotals.empty > 0 ? 'partial' : 'failed'
    : telemetryTotals.succeeded > 0 ? 'completed'
      : queries.every((query) => query.status === 'parse_empty') ? 'parse_zero' : 'empty';
  const telemetry = {
    contract_version: 'pmav5.amazon-query-telemetry/v1',
    correlation_id: correlationId,
    scenario: scenario.id || scenario.scenarioId || scenario.label || null,
    release_id: releaseId || 'unknown',
    schedulerSource: schedulerSource || 'unknown',
    fetch_path: 'global.fetch',
    provider: 'amazon_public_search',
    config: {
      keywords: [...keywords],
      browse_node_ids: [...browseNodeIds],
      max_retries: maxRetries,
      retry_delay_ms: retryDelayMs,
      inter_query_delay_ms: minDelayMs,
      max_per_keyword: maxPerKeyword,
    },
    queries,
    total_queries_attempted: telemetryTotals.attempted,
    total_queries_succeeded: telemetryTotals.succeeded,
    total_queries_failed: telemetryTotals.failed,
    total_queries_empty: telemetryTotals.empty,
  };
  return { pipeline: 'Amazon Scenario Discovery V5', dry_run: true, scenario: scenario.label, keywords: scenario.keywords || [], browse_node_ids: browseNodeIds, queries, products, raw_products: collected.length, duplicates: unique.duplicates, http_calls: httpCalls, queryTelemetry: queries, telemetryTotals, sourceStatus, telemetry };
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
    // O ASIN identifica o mesmo produto independentemente do browse node em
    // que a Amazon o exibiu; não permitir duplicata por categoria.
    const key = product.asin || `${product.node_id}:${product.canonical_url}`;
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
  if (!response.ok || response.status !== 200) {
    const error = new Error(`HTTP ${response.status}`);
    error.code = 'AMAZON_HTTP_ERROR';
    error.httpStatus = response.status;
    try {
      const body = await response.text();
      error.responseBytes = Buffer.byteLength(String(body ?? ''), 'utf8');
    } catch {}
    throw error;
  }
  const html = await response.text();
  if (/Robot Check|Digite os caracteres/i.test(html)) {
    const error = new Error('Amazon anti-automation challenge');
    error.code = 'AMAZON_CHALLENGE';
    error.httpStatus = 200;
    error.responseBytes = Buffer.byteLength(html, 'utf8');
    throw error;
  }
  return html;
}

function sanitizeAmazonError(error) {
  return String(error?.message || error || 'unknown error')
    .replace(/([?&](?:token|api[_-]?key|secret|authorization)=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/\b(token|api[_-]?key|secret|authorization)\s*[:=]\s*[^\s,]+/gi, '$1=[REDACTED]')
    .slice(0, 300);
}

function classifyAmazonQueryError(error) {
  if (error?.code === 'AMAZON_HTTP_ERROR' || error?.code === 'AMAZON_CHALLENGE') return 'http_error';
  return 'transport_error';
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
      if (sanitized.products.length === 0) {
        console.warn('[Amazon Top20 vazio] ' + JSON.stringify({
          categoria: subcategory.subcategory,
          cardsEncontrados: parsed.length,
          produtosValidos: sanitized.products.length,
          produtosRejeitados: sanitized.discarded.length,
          motivos: [...new Set(sanitized.discarded.flatMap((entry) => entry.reasons))],
        }));
        continue;
      }
      if (sanitized.products.length < 20) {
        const reasons = [...new Set(sanitized.discarded.flatMap((entry) => entry.reasons))];
        const asins = sanitized.discarded.map((entry) => entry.asin).filter(Boolean);
        console.warn('[Amazon Top20 incompleto] ' + JSON.stringify({
          categoria: subcategory.subcategory,
          cardsEncontrados: parsed.length,
          produtosValidos: sanitized.products.length,
          produtosRejeitados: sanitized.discarded.length,
          motivos: reasons,
          asinsRejeitados: asins,
        }));
      }
      collected.push(...sanitized.products);
    }
  }

  // A página pública da Amazon pode devolver uma árvore parcial durante
  // throttling/desafio. Catálogo parcial válido ainda é útil para a fila;
  // só falhe quando nenhuma categoria pôde ser lida.
  if (tree.length === 0) throw new Error('Nenhuma árvore pública de categorias disponível');
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
  fs.mkdirSync('reports', { recursive: true });
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
  const scenarioId = args.find((arg) => arg.startsWith('--scenario='))?.split('=')[1] || (args.includes('--scenario') ? args[args.indexOf('--scenario') + 1] : null);
  if (scenarioId) {
    const { SCENARIOS } = require('./amazon-scenario-config.cjs');
    const baseScenario = SCENARIOS[scenarioId];
    if (!baseScenario) throw new Error(`Cenário Amazon não encontrado: ${scenarioId}`);
    const { getMarketplaceScenarioContract } = require('./marketplace-scenario-contracts.cjs');
    const scenario = getMarketplaceScenarioContract(scenarioId, 'Amazon') || baseScenario;
    const result = await runAmazonScenarioDryRun({
      scenario,
      minDelayMs: readPositiveLimit(args, 'delay-ms', 2000),
      retryDelayMs: readPositiveLimit(args, 'retry-delay-ms', 10000),
      maxRetries: Math.max(0, readPositiveLimit(args, 'max-retries', 2) - 1)
    });
    writeDryRunJson(result);
    process.stdout.write(`${JSON.stringify({ file: REPORT_PATH, scenario: scenarioId, keywords: result.keywords.length, products: result.products.length, raw_products: result.raw_products, duplicates: result.duplicates, http_calls: result.http_calls, blocked_or_empty: result.queries.filter((query) => query.status !== 'ok').length })}\n`);
    return;
  }
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
  DEFAULT_CATEGORY_LIMIT,
  DEFAULT_SUBCATEGORY_LIMIT,
  DEFAULT_MAX_PER_KEYWORD,
  PRODUCT_KEYS,
  applyNovelty,
  calculateDeterministicScore,
  deduplicate,
  extractProductPrice,
  parseCategoryTree,
  parseBrazilPrice,
  parseRankingPage,
  parseSearchPage,
  parseRootCategories,
  runAmazonNativeTop20,
  runAmazonScenarioDryRun,
  sanitizeProducts,
  validateFinalContract,
  writeDryRunJson
};
