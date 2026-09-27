'use strict';

/**
 * ============================================================================
 * MOTOR OFICIAL AMAZON BRASIL (MOTOR ÚNICO E AUTORITATIVO)
 * ============================================================================
 *
 * Consolida e substitui de forma limpa:
 * - amazon-native-top20-v5.cjs (705 linhas com bestsellers desatualizados)
 * - amazon-diagnostic.cjs
 * - amazon-scenario-config.cjs
 *
 * Características:
 * 1. Busca direta via Amazon Search (HTML público /s?k={termo}&rh=n:{browseNode})
 * 2. Extração sem ruído de ASIN, Título, Preço, Desconto, Prime, Avaliações e Imagem
 * 3. Enriquecimento com Partner Tag de Afiliado (cacaofertas-20)
 * 4. Deduplicação e ranqueamento inteligente por qualidade e atratividade
 * 5. Telemetria e compatibilidade total com o ciclo de ingestão do Oracle Scraper
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const cheerio = require('cheerio');
const { validateProductTitle } = require('./product-title-quality.cjs');
const { extractProductFamily, selectDiversePortfolio } = require('./product-diversity-engine.cjs');
const { EDITORIAL_SCENARIOS } = require('./editorial-scenario-config.cjs');
const { buildCommercialScenarioMap } = require('./commercial-niche-scenario-bridge.cjs');

const BEST_SELLERS_ROOT = 'https://www.amazon.com.br/gp/bestsellers';
const AMAZON_SEARCH_ROOT = 'https://www.amazon.com.br/s';
const REPORT_PATH = 'reports/amazon-native-top20-v5-dry-run.json';
const DEFAULT_TENANT_USER_ID = '7a9ca7b7-f464-46e0-a9de-9b322c73628a';
const DEFAULT_PARTNER_TAG = process.env.AMAZON_PARTNER_TAG || 'cacaofertas-20';

const DEFAULT_CATEGORY_LIMIT = 10;
const DEFAULT_SUBCATEGORY_LIMIT = 3;
const DEFAULT_MAX_PER_KEYWORD = 50;

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

// Aliases para os cenários editoriais
const AMAZON_ALIASES = Object.freeze({
  casa_cozinha_editorial: ['jogo de cama', 'toalha de banho', 'cafeteira elétrica', 'air fryer', 'batedeira', 'aspirador vertical', 'forno elétrico', 'grill elétrico', 'chaleira elétrica', 'mixer', 'máquina de café'],
  ferramentas_editorial: ['furadeira', 'parafusadeira', 'kit ferramentas', 'ferramenta elétrica', 'trena', 'esmerilhadeira', 'martelete', 'serra circular', 'serra tico-tico', 'chave de impacto', 'lixadeira'],
  informatica_editorial: ['notebook', 'computador', 'monitor', 'impressora', 'ssd', 'roteador', 'mini pc', 'all in one', 'scanner', 'nobreak', 'switch de rede'],
  beleza_editorial: ['protetor solar facial', 'hidratante facial', 'shampoo', 'secador', 'perfume', 'maquiagem', 'aparador', 'máquina de cortar cabelo', 'modelador', 'escova alisadora', 'depilador'],
  moda_editorial: ['camiseta masculina', 'camisa', 'calça jeans', 'tênis masculino', 'bolsa', 'relógio', 'jaqueta', 'vestido', 'mochila', 'tênis feminino', 'calça social'],
  pet_editorial: ['ração para cachorro', 'ração para gato', 'cama pet', 'brinquedo pet', 'areia para gato', 'coleira', 'bebedouro automático', 'comedouro automático', 'fonte pet', 'arranhador', 'caixa de areia fechada', 'casinha pet'],
  eletrodomesticos_editorial: ['geladeira', 'freezer', 'fogão', 'cooktop', 'micro-ondas', 'máquina de lavar', 'aspirador', 'forno elétrico', 'coifa', 'depurador', 'frigobar', 'adega climatizada'],
  cupons_aprovados_editorial: [],
});

const AMAZON_GENERIC_PROMO_QUERIES = new Set(['oferta', 'desconto', 'promoção', 'mais vendido', 'frete grátis']);
const COMMERCIAL_SCENARIOS = buildCommercialScenarioMap(EDITORIAL_SCENARIOS, 'Amazon');

const SCENARIOS = Object.fromEntries(Object.entries(COMMERCIAL_SCENARIOS).map(([id, source]) => {
  const isCommercialNiche = Boolean(source.commercialNiche);
  const sourceKeywords = id === 'grandes_ofertas_editorial'
    ? source.keywords.filter((keyword) => !AMAZON_GENERIC_PROMO_QUERIES.has(String(keyword).trim().toLowerCase()))
    : source.keywords;

  const keywords = isCommercialNiche
    ? sourceKeywords
    : [...new Set([...(AMAZON_ALIASES[id] || []), ...sourceKeywords])];

  return [id, {
    ...source,
    label: `${source.name} — Amazon Brasil`,
    keywords: [...new Set(keywords)],
    apiCategories: [...(source.amazonBrowseNodes || source.browseNodeIds || [])],
    browseNodeIds: [...(source.amazonBrowseNodes || source.browseNodeIds || [])],
    allowedProductTerms: [...source.allowedProductTerms],
  }];
}));

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
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
  let originalPrice = parseBrazilPrice(root.find('.a-text-price .a-offscreen').first().text());
  if (originalPrice && originalPrice <= price) originalPrice = null;
  const discount = (originalPrice && price) ? Math.max(0, Math.min(100, Math.round(((originalPrice - price) / originalPrice) * 100))) : null;

  const textLower = cleanText(root.text()).toLowerCase();
  const prime = root.find('.a-icon-prime').length > 0 || /\bprime\b/i.test(textLower);
  const coupon = root.find('.s-coupon-highlight-color, .s-coupon-unclipped').length > 0;
  const promotion = root.find('.savingPriceOverride, .promoPrice').length > 0;

  let rating = null;
  const RATING_SELECTORS = [
    '.a-icon-star-small .a-icon-alt',
    '.a-icon-star-small',
    '.a-icon-alt',
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
    original_price: originalPrice,
    discount,
    marketplaceMetrics: {
      prime,
      coupon,
      promotion,
      rating,
      reviewCount,
    },
  };
}

function parseRankingPage(html, source = {}) {
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
      category: source.category || 'Amazon',
      subcategory: source.subcategory || 'Bestsellers',
      node_id: source.node_id || '0',
      parent_node_id: source.parent_node_id || null,
      source_url: source.source_url || `https://www.amazon.com.br/dp/${asin}`,
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
      marketplaceMetrics: commercials.marketplaceMetrics,
    });
  });

  return [...byRank.values()].sort((a, b) => a.rank - b.rank);
}

function parseSearchPage(html, source = {}) {
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
      marketplace: 'Amazon',
      category: source.category || 'Cenário Amazon',
      subcategory: source.subcategory || source.keyword || 'Busca',
      node_id: source.node_id || '0',
      parent_node_id: source.parent_node_id || null,
      source_url: source.source_url || `https://www.amazon.com.br/dp/${asin}`,
      rank: products.length + 1,
      asin,
      title,
      image: cleanText(image.attr('src')) || null,
      canonical_url: `https://www.amazon.com.br/dp/${asin}`,
      price,
      original_price: commercials.original_price,
      seller: null,
      discount: commercials.discount,
      score: null,
      novelty: null,
      marketplaceMetrics: commercials.marketplaceMetrics,
    });
  });
  return products;
}

function parseAmazonSearchHtml(html, options = {}) {
  const $ = cheerio.load(String(html ?? ''));
  const products = [];
  const tag = options.partnerTag || DEFAULT_PARTNER_TAG;

  $('div[data-component-type="s-search-result"][data-asin]').each((index, element) => {
    const root = $(element);
    const asin = String(root.attr('data-asin') ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(asin)) return;

    if (/Patrocinado|Sponsored/i.test(cleanText(root.text()))) return;
    const linkHref = root.find(`a[href*="/dp/${asin}"]`).first().attr('href') ?? '';
    if (/\/sspa\//i.test(linkHref)) return;

    const imgEl = root.find('img[src]').first();
    const imageUrl = cleanText(imgEl.attr('src')) || null;
    const title = cleanText(root.find('h2').first().text() || imgEl.attr('alt'));
    const price = extractProductPrice(root);
    if (!price || price <= 0) return;

    const commercials = extractProductCommercials(root, price);
    const canonicalUrl = `https://www.amazon.com.br/dp/${asin}`;
    const affiliateUrl = `https://www.amazon.com.br/dp/${asin}?tag=${tag}`;

    products.push({
      marketplace: 'Amazon',
      asin,
      productName: title,
      title,
      currentPrice: price,
      price,
      originalPrice: commercials.original_price,
      original_price: commercials.original_price,
      discountPercent: commercials.discount || 0,
      discount: commercials.discount,
      ratingStar: commercials.marketplaceMetrics.rating || 4.5,
      reviewCount: commercials.marketplaceMetrics.reviewCount || 100,
      isPrime: commercials.marketplaceMetrics.prime,
      hasCoupon: commercials.marketplaceMetrics.coupon,
      imageUrl,
      image: imageUrl,
      canonical_url: canonicalUrl,
      sourceUrl: canonicalUrl,
      affiliateUrl,
      offerLink: affiliateUrl,
      node_id: options.browseNodeId || '17124722011',
      parent_node_id: null,
      source_url: options.sourceUrl || canonicalUrl,
      rank: products.length + 1,
      seller: null,
      marketplaceMetrics: commercials.marketplaceMetrics,
    });
  });

  return products;
}

function calculateDeterministicScore(product) {
  const price = product.price || product.currentPrice || 0;
  const oldPrice = product.original_price || product.originalPrice || 0;
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

function calculateAmazonScore(product) {
  let score = 50;
  const discount = product.discountPercent || product.discount || 0;
  score += Math.min(discount * 0.6, 30);

  const rating = product.ratingStar || product.marketplaceMetrics?.rating || 0;
  if (rating >= 4.7) score += 15;
  else if (rating >= 4.4) score += 10;
  else if (rating >= 4.0) score += 5;

  if (product.isPrime || product.marketplaceMetrics?.prime) score += 5;
  if (product.hasCoupon || product.marketplaceMetrics?.coupon) score += 5;

  const price = product.currentPrice || product.price || 0;
  if (price > 15 && price <= 250) score += 10;
  else if (price <= 600) score += 5;

  return Math.min(Math.round(score), 100);
}

function validateProduct(product) {
  const reasons = [];
  if (!cleanText(product.category)) reasons.push('category');
  if (!cleanText(product.subcategory)) reasons.push('subcategory');
  if (!/^\d{6,}$/.test(String(product.node_id ?? ''))) reasons.push('node_id');
  if (product.parent_node_id !== null && product.parent_node_id !== undefined && !/^\d{6,}$/.test(String(product.parent_node_id))) reasons.push('parent_node_id');
  if (!Number.isInteger(product.rank) || product.rank < 1 || product.rank > 20) reasons.push('rank');
  if (!/^[A-Z0-9]{10}$/.test(String(product.asin ?? ''))) reasons.push('asin');
  if (!cleanText(product.title || product.productName)) reasons.push('title');
  if (!/^https?:\/\//i.test(String((product.image || product.imageUrl) ?? ''))) reasons.push('image');
  if (!Number.isFinite(Number(product.price ?? product.currentPrice)) || Number(product.price ?? product.currentPrice) <= 0) reasons.push('PRECO_INVALIDO');
  if (!/^https:\/\/www\.amazon\.com\.br\/dp\/[A-Z0-9]{10}$/i.test(String(product.canonical_url ?? ''))) reasons.push('canonical_url');
  if (!/^https:\/\/www\.amazon\.com\.br\/(?:gp\/bestsellers\/|s\?(?:k=[^&]+(?:&rh=n%3A|&rh=n:)|rh=n:))/i.test(String(product.source_url ?? ''))) reasons.push('source_url');
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

function isEligibleAmazonCandidate(product, scenarioAllowedTerms = []) {
  const title = product.productName || product.title || '';
  const titleVal = validateProductTitle(title);
  if (!titleVal.valid) return false;

  const price = product.currentPrice || product.price || 0;
  if (price < 10 || price > 15000) return false;

  const textLower = title.toLowerCase();
  const JUNK_TERMS = ['adesivo', 'capinha', 'pelicula', 'manual impresso', 'parafuso avulso', 'suporte plastico'];
  if (JUNK_TERMS.some((term) => textLower.includes(term))) return false;

  if (scenarioAllowedTerms && scenarioAllowedTerms.length > 0) {
    const matchesAllowed = scenarioAllowedTerms.some((term) => textLower.includes(term.toLowerCase()));
    if (!matchesAllowed) return false;
  }

  return true;
}

function sanitizeAmazonError(error) {
  return String(error?.message || error || 'unknown error')
    .replace(/([?&](?:token|api[_-]?key|secret|authorization)=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/\b(token|api[_-]?key|secret|authorization)\s*[:=]\s*[^\s,]+/gi, '$1=[REDACTED]')
    .slice(0, 300);
}

async function fetchAmazonHtml(url, { fetchImpl = global.fetch } = {}) {
  const res = await fetchImpl(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
    },
  });

  if (!res.ok || res.status !== 200) {
    const error = new Error(`HTTP ${res.status}`);
    error.code = 'AMAZON_HTTP_ERROR';
    error.httpStatus = res.status;
    try {
      const body = await res.text();
      error.responseBytes = Buffer.byteLength(String(body ?? ''), 'utf8');
    } catch {}
    throw error;
  }

  const html = await res.text();
  if (/Robot Check|Digite os caracteres/i.test(html)) {
    const error = new Error('Amazon anti-automation challenge');
    error.code = 'AMAZON_CHALLENGE';
    error.httpStatus = 200;
    error.responseBytes = Buffer.byteLength(html, 'utf8');
    throw error;
  }

  return html;
}

async function searchAmazonOffers({ keyword, browseNodeId, partnerTag, fetchImpl = global.fetch, limit = 50 }) {
  let url = `${AMAZON_SEARCH_ROOT}?k=${encodeURIComponent(keyword)}`;
  if (browseNodeId) {
    url += `&rh=n:${browseNodeId}`;
  }

  const html = await fetchAmazonHtml(url, { fetchImpl });
  const rawProducts = parseAmazonSearchHtml(html, { partnerTag, browseNodeId, sourceUrl: url });

  const eligible = rawProducts
    .filter((p) => isEligibleAmazonCandidate(p))
    .map((p) => ({
      ...p,
      score: calculateAmazonScore(p),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return {
    keyword,
    browseNodeId,
    url,
    rawCount: rawProducts.length,
    eligibleCount: eligible.length,
    products: eligible,
  };
}

async function discoverAmazonScenarioOffers(scenarioId, options = {}) {
  const scenario = SCENARIOS[scenarioId] || EDITORIAL_SCENARIOS[scenarioId];
  if (!scenario) {
    throw new Error(`Cenário desconhecido para Amazon: ${scenarioId}`);
  }

  const keywords = scenario.keywords || ['ofertas'];
  const browseNodes = scenario.browseNodeIds || scenario.apiCategories || [];
  const primaryBrowseNode = browseNodes[0] || null;
  const targetTotal = options.targetTotal || 25;

  const calls = [];
  const seenAsins = new Set();
  const collected = [];

  for (const keyword of keywords) {
    try {
      const res = await searchAmazonOffers({
        keyword,
        browseNodeId: primaryBrowseNode,
        partnerTag: options.partnerTag,
        fetchImpl: options.fetchImpl,
        limit: 30,
      });

      calls.push({ keyword, rawCount: res.rawCount, eligibleCount: res.eligibleCount, ok: true });

      for (const prod of res.products) {
        if (!seenAsins.has(prod.asin)) {
          seenAsins.add(prod.asin);
          collected.push(prod);
        }
      }
    } catch (err) {
      calls.push({ keyword, ok: false, error: err.message });
    }
  }

  collected.sort((a, b) => b.score - a.score);
  const topProducts = selectDiversePortfolio(collected, {
    maxPerFamily: options.maxPerFamily || 3,
    targetTotal,
  });

  return {
    scenarioId,
    scenarioName: scenario.name || scenario.label,
    totalDiscovered: collected.length,
    topCount: topProducts.length,
    top: topProducts,
    calls,
  };
}

function stableId(prefix, seed) {
  return `${prefix}_${crypto.createHash('sha256').update(String(seed)).digest('hex').slice(0, 24)}`;
}

function buildAmazonIngestions(products, scenarioId, options = {}) {
  const tenantId = options.tenantId || DEFAULT_TENANT_USER_ID;
  const correlationId = options.correlationId || `corr_amazon_${Date.now()}`;
  const requestedAt = options.requestedAt || new Date().toISOString();

  return products.map((product, index) => {
    const idempotencyKey = `amazon_${product.asin}_${scenarioId}_${requestedAt.slice(0, 10)}`;

    const candidate = {
      marketplace: 'Amazon',
      sourceItemId: product.asin,
      sourceUrl: product.canonical_url || product.sourceUrl,
      title: product.productName || product.title,
      imageUrl: product.imageUrl || product.image,
      currentPrice: product.currentPrice || product.price,
      originalPrice: product.originalPrice || product.original_price,
      category: { id: 'amazon_editorial', name: scenarioId, source: 'Amazon Public Search' },
      marketplaceMetrics: {
        sourcePosition: index + 1,
        asin: product.asin,
        rating: product.ratingStar || product.marketplaceMetrics?.rating,
        reviewCount: product.reviewCount || product.marketplaceMetrics?.reviewCount,
        discount: product.discountPercent || product.discount,
        isPrime: product.isPrime || product.marketplaceMetrics?.prime,
        hasCoupon: product.hasCoupon || product.marketplaceMetrics?.coupon,
      },
      deterministicScore: Number(((product.score || 50) / 10).toFixed(1)),
      discoveryEvidence: { position: index + 1, category: scenarioId, provider: 'Amazon Public Search', discoveredAt: requestedAt },
      discoveredAt: requestedAt,
      rawPayload: product,
      monetization: { valid: true, affiliateUrl: product.affiliateUrl || product.offerLink },
    };

    return {
      contractVersion: 'pmav5.ingestion/v1',
      ingestionId: stableId('ingestion', idempotencyKey),
      idempotencyKey,
      correlationId,
      sourceType: 'oracle_amazon_engine',
      tenantId,
      actor: { type: 'service', id: 'amazon-engine' },
      candidate,
      requestedAt,
    };
  });
}

async function runAmazonScenarioDryRun({
  scenario,
  fetchImpl = global.fetch,
  minDelayMs = 0,
  retryDelayMs = 0,
  maxRetries = 1,
  maxPerKeyword = DEFAULT_MAX_PER_KEYWORD,
  correlationId = null,
  schedulerSource = null,
  releaseId = null
} = {}) {
  const scenarioObj = typeof scenario === 'string' ? SCENARIOS[scenario] || EDITORIAL_SCENARIOS[scenario] : scenario;
  if (!scenarioObj) throw new Error(`Cenário Amazon não informado ou inválido: ${scenario}`);

  const keywords = Array.isArray(scenarioObj.keywords) && scenarioObj.keywords.length > 0
    ? scenarioObj.keywords
    : [scenarioObj.label || 'ofertas'];

  const browseNodeIds = Array.isArray(scenarioObj.browseNodeIds) && scenarioObj.browseNodeIds.length > 0
    ? scenarioObj.browseNodeIds
    : [];

  const queries = [];
  const collected = [];
  let httpCalls = 0;

  for (let i = 0; i < keywords.length; i++) {
    const keyword = keywords[i];
    const browseNodeId = browseNodeIds[i] || browseNodeIds[0] || null;
    let url = `${AMAZON_SEARCH_ROOT}?k=${encodeURIComponent(keyword)}`;
    if (browseNodeId) url += `&rh=n:${browseNodeId}`;

    const attempts = [];
    let queryResult = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      httpCalls += 1;
      const startedAt = Date.now();
      try {
        const res = await fetchImpl(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            Accept: 'text/html,application/xhtml+xml',
          },
        });

        const latencyMs = Date.now() - startedAt;
        const body = await res.text();
        const responseBytes = Buffer.byteLength(String(body ?? ''), 'utf8');

        if (!res.ok || res.status !== 200) {
          attempts.push({ attempt, http_status: res.status, latency_ms: latencyMs, response_bytes: responseBytes, status: 'http_error', error_code: 'AMAZON_HTTP_ERROR' });
          if (attempt >= maxRetries) {
            queryResult = {
              keyword, browse_node_id: browseNodeId, request_url: url, fetch_path: 'global.fetch', provider: 'amazon_public_search',
              correlation_id: correlationId, scenario: scenarioObj.id || scenarioObj.label || null, attempt,
              collected: 0, valid: 0, discarded: 0, http_status: res.status, retry_count: attempt, latency_ms: latencyMs,
              response_bytes: responseBytes, parser_count: 0, structurally_valid_count: 0, status: 'http_error',
              error_code: 'AMAZON_HTTP_ERROR', error_message: `HTTP ${res.status}`, attempts,
            };
            break;
          }
        } else if (!body || body.trim().length === 0) {
          attempts.push({ attempt, http_status: 200, latency_ms: latencyMs, response_bytes: 0, status: 'empty_response', error_code: 'AMAZON_EMPTY_BODY' });
          queryResult = {
            keyword, browse_node_id: browseNodeId, request_url: url, fetch_path: 'global.fetch', provider: 'amazon_public_search',
            correlation_id: correlationId, scenario: scenarioObj.id || scenarioObj.label || null, attempt,
            collected: 0, valid: 0, discarded: 0, http_status: 200, retry_count: attempt, latency_ms: latencyMs,
            response_bytes: 0, parser_count: 0, structurally_valid_count: 0, status: 'empty_response',
            error_code: 'AMAZON_EMPTY_BODY', error_message: 'Empty response body', attempts,
          };
          break;
        } else {
          const parsed = parseSearchPage(body, {
            category: scenarioObj.label || 'Amazon',
            subcategory: keyword,
            node_id: browseNodeId || '0',
            parent_node_id: null,
            source_url: url,
            keyword,
          });

          const parserCount = parsed.length;
          const sanitized = sanitizeProducts(parsed);
          const validCount = sanitized.products.length;

          attempts.push({ attempt, http_status: 200, latency_ms: latencyMs, response_bytes: responseBytes, status: parserCount === 0 ? 'parse_empty' : 'ok', error_code: null });

          queryResult = {
            keyword, browse_node_id: browseNodeId, request_url: url, fetch_path: 'global.fetch', provider: 'amazon_public_search',
            correlation_id: correlationId, scenario: scenarioObj.id || scenarioObj.label || null, attempt,
            collected: parserCount, valid: validCount, discarded: sanitized.discarded.length, http_status: 200,
            retry_count: attempt, latency_ms: latencyMs, response_bytes: responseBytes, parser_count: parserCount,
            structurally_valid_count: validCount, status: parserCount === 0 ? 'parse_empty' : 'ok',
            error_code: null, error_message: null, attempts,
          };

          collected.push(...sanitized.products);
          break;
        }
      } catch (err) {
        const latencyMs = Date.now() - startedAt;
        const errorCode = err.code || 'ECONNRESET';
        const isHttpError = err.code === 'AMAZON_HTTP_ERROR' || err.code === 'AMAZON_CHALLENGE';
        const status = isHttpError ? 'http_error' : 'transport_error';
        const responseBytes = err.responseBytes || 0;

        attempts.push({ attempt, http_status: err.httpStatus || null, latency_ms: latencyMs, response_bytes: responseBytes, status, error_code: errorCode });

        if (attempt >= maxRetries) {
          queryResult = {
            keyword, browse_node_id: browseNodeId, request_url: url, fetch_path: 'global.fetch', provider: 'amazon_public_search',
            correlation_id: correlationId, scenario: scenarioObj.id || scenarioObj.label || null, attempt,
            collected: 0, valid: 0, discarded: 0, http_status: err.httpStatus || null, retry_count: attempt, latency_ms: latencyMs,
            response_bytes: responseBytes, parser_count: 0, structurally_valid_count: 0, status,
            error_code: errorCode, error_message: sanitizeAmazonError(err), attempts,
          };
          break;
        }
      }
    }

    if (queryResult) queries.push(queryResult);
  }

  const unique = deduplicate(collected);
  const novelty = applyNovelty(unique.products);
  const products = novelty.products.map((product) => ({ ...product, score: calculateDeterministicScore(product) }));

  const telemetryTotals = {
    attempted: queries.length,
    succeeded: queries.filter((q) => q.status === 'ok').length,
    failed: queries.filter((q) => ['http_error', 'transport_error'].includes(q.status)).length,
    empty: queries.filter((q) => ['empty_response', 'parse_empty'].includes(q.status)).length,
  };

  const sourceStatus = telemetryTotals.failed > 0
    ? (telemetryTotals.succeeded > 0 || telemetryTotals.empty > 0 ? 'partial' : 'failed')
    : (telemetryTotals.succeeded > 0 ? 'completed'
      : (queries.every((q) => q.status === 'parse_empty') ? 'parse_zero' : 'empty'));

  const telemetry = {
    contract_version: 'pmav5.amazon-query-telemetry/v1',
    correlation_id: correlationId,
    scenario: scenarioObj.id || scenarioObj.label || null,
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

  return {
    pipeline: 'Amazon Scenario Discovery V5',
    dry_run: true,
    scenario: scenarioObj.label,
    keywords: scenarioObj.keywords || [],
    browse_node_ids: browseNodeIds,
    queries,
    products,
    raw_products: collected.length,
    duplicates: unique.duplicates,
    http_calls: httpCalls,
    queryTelemetry: queries,
    telemetryTotals,
    sourceStatus,
    telemetry,
  };
}

async function runAmazonNativeTop20(options = {}) {
  const scenarioId = options.scenario?.id || options.scenario || 'casa_cozinha_editorial';
  if (typeof scenarioId === 'object') {
    return runAmazonScenarioDryRun(options);
  }
  const discovery = await discoverAmazonScenarioOffers(scenarioId, {
    targetTotal: options.limit || 25,
    fetchImpl: options.fetchImpl,
  });

  return {
    scenarioId,
    candidates: discovery.top,
    top: discovery.top,
    products: discovery.top,
    totalDiscovered: discovery.totalDiscovered,
    calls: discovery.calls,
  };
}

// CLI Execution
async function main() {
  const args = process.argv.slice(2);
  const scenarioArg = args.find((a) => a.startsWith('--scenario='))?.split('=')[1] || 'casa_cozinha_editorial';
  const searchArg = args.find((a) => a.startsWith('--search='))?.split('=')[1];

  console.log('='.repeat(70));
  console.log('📦 MOTOR OFICIAL AMAZON BRASIL');
  console.log('='.repeat(70));

  if (searchArg) {
    console.log(`🔎 Executando busca direta por: "${searchArg}"...`);
    const res = await searchAmazonOffers({ keyword: searchArg, limit: 15 });
    console.log(`\nEncontrados: ${res.rawCount} brutos | ${res.eligibleCount} elegíveis e filtrados:`);
    console.table(
      res.products.map((p) => ({
        ASIN: p.asin,
        Produto: p.productName.slice(0, 38) + '...',
        Preço: `R$ ${p.currentPrice.toFixed(2)}`,
        Desconto: `${p.discountPercent}%`,
        Nota: `⭐ ${p.ratingStar}`,
        Prime: p.isPrime ? '📦 PRIME' : 'NÃO',
        Score: p.score,
      }))
    );
  } else {
    console.log(`🎯 Executando descoberta para o cenário: "${scenarioArg}"...`);
    const res = await discoverAmazonScenarioOffers(scenarioArg, { targetTotal: 25 });
    console.log(`\n✅ Descoberta Concluída!`);
    console.log(`- Termos pesquisados: ${res.calls.length}`);
    console.log(`- Total descobertos: ${res.totalDiscovered}`);
    console.log(`- Top selecionados para o painel: ${res.topCount}`);
    console.table(
      res.top.slice(0, 15).map((p, i) => ({
        '#': i + 1,
        ASIN: p.asin,
        Produto: p.productName.slice(0, 38) + '...',
        Preço: `R$ ${p.currentPrice.toFixed(2)}`,
        Desc: `${p.discountPercent}%`,
        Nota: `⭐ ${p.ratingStar}`,
        Prime: p.isPrime ? '📦 PRIME' : 'NÃO',
        Score: p.score,
      }))
    );
  }
}

if (require.main === module) {
  require('dotenv').config({ path: '.env.local', quiet: true });
  main().catch((err) => {
    console.error('❌ Erro no Amazon Engine:', err.message);
    process.exit(1);
  });
}

function matchingTerms(title, terms = []) {
  const normalizedTitle = String(title || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
  return [...new Set(terms.filter((term) => normalizedTitle.includes(String(term || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim())))];
}

function evaluateAmazonProductDiagnostics(product, scenario, finalQueuePosition) {
  const accessoryTerms = matchingTerms(product.title, scenario.blockedProductTerms || []);
  const classificationTerms = matchingTerms(product.title, scenario.allowedProductTerms || []);
  const reviewCount = product.marketplaceMetrics?.reviewCount ?? null;
  const derivedInitialScore = Number.isFinite(Number(product.initial_score))
    ? Number(product.initial_score)
    : calculateDeterministicScore(product);

  return {
    asin: product.asin || null,
    title: product.title || null,
    intention: product.subcategory || null,
    browse_node_evidence: {
      node_id: product.node_id || null,
      parent_node_id: product.parent_node_id || null,
      source_url: product.source_url || null,
    },
    price: product.price ?? null,
    original_price: product.original_price ?? null,
    discount: product.discount ?? null,
    rating: product.marketplaceMetrics?.rating ?? null,
    review_count: reviewCount,
    review_evidence_status: reviewCount === null ? 'unavailable' : 'available',
    score_initial: derivedInitialScore,
    score_initial_source: Number.isFinite(Number(product.initial_score)) ? 'collector' : 'derived_from_raw_commercial_fields',
    adherence_decision: classificationTerms.length ? 'accepted' : 'unclassified',
    accessory_decision: {
      status: accessoryTerms.length ? 'rejected' : 'accepted',
      matched_terms: accessoryTerms,
    },
    classification: {
      status: classificationTerms.length ? 'classified' : 'unclassified',
      matched_terms: classificationTerms,
    },
    score_final: Number.isFinite(Number(product.score)) ? Number(product.score) : null,
    final_queue_position: Number.isInteger(finalQueuePosition) ? finalQueuePosition : null,
    source_rank: product.rank ?? null,
  };
}

function buildAmazonDiagnostic({ scenario, queries = [], products = [], raw_products = 0, duplicates = 0 } = {}) {
  const sortedProducts = [...products].sort((a, b) => (a.rank || 0) - (b.rank || 0) || String(a.asin).localeCompare(String(a.asin)));
  const diagnostics = sortedProducts.map((product, index) => evaluateAmazonProductDiagnostics(product, scenario, index + 1));
  const byIntention = {};
  for (const query of queries) {
    byIntention[query.keyword || query.browse_node_id || 'unknown'] = {
      collected: query.collected ?? 0,
      valid: query.valid ?? 0,
      discarded: query.discarded ?? 0,
      status: query.status || null,
      http_status: query.http_status ?? null,
      final_products: diagnostics.filter((product) => product.intention === (query.browse_node_id ? `browse_node:${query.browse_node_id}` : query.keyword)).length,
    };
  }
  return {
    generated_at: new Date().toISOString(),
    marketplace: 'Amazon',
    scenario: scenario?.id || scenario?.label || null,
    dry_run: true,
    persistence_performed: false,
    funnel: {
      raw_products: raw_products ?? 0,
      valid_products: products.length,
      discarded_products: queries.reduce((total, query) => total + Number(query.discarded || 0), 0),
      duplicates: duplicates ?? 0,
      final_queue_products: diagnostics.length,
    },
    intentions: byIntention,
    products: diagnostics,
  };
}

module.exports = {
  BEST_SELLERS_ROOT,
  AMAZON_SEARCH_ROOT,
  REPORT_PATH,
  DEFAULT_CATEGORY_LIMIT,
  DEFAULT_SUBCATEGORY_LIMIT,
  DEFAULT_MAX_PER_KEYWORD,
  PRODUCT_KEYS,
  SCENARIOS,
  AMAZON_ALIASES,
  applyNovelty,
  calculateDeterministicScore,
  calculateAmazonScore,
  deduplicate,
  extractProductPrice,
  extractProductCommercials,
  parseBrazilPrice,
  parseRankingPage,
  parseSearchPage,
  parseAmazonSearchHtml,
  isEligibleAmazonCandidate,
  sanitizeProducts,
  validateFinalContract,
  fetchAmazonHtml,
  searchAmazonOffers,
  discoverAmazonScenarioOffers,
  buildAmazonIngestions,
  runAmazonNativeTop20,
  runAmazonScenarioDryRun,
  buildAmazonDiagnostic,
  evaluateAmazonProductDiagnostics,
  matchingTerms,
  extractProductFamily,
  selectDiversePortfolio,
};
