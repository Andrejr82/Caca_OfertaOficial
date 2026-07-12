'use strict';

const cheerio = require('cheerio');

const API_BASE = 'https://api.mercadolibre.com';
const HIGHLIGHTS_CATEGORY_ID = 'MLB432825';
const MAX_PRODUCTS_PER_CYCLE = 6;
const MAX_CANDIDATES_PER_SOURCE = 12;

const FIXED_SSR_SOURCES = [
  { name: 'lightning', url: 'https://www.mercadolivre.com.br/ofertas?promotion_type=lightning' },
  { name: 'deal_of_the_day', url: 'https://www.mercadolivre.com.br/ofertas?promotion_type=deal_of_the_day' },
  { name: 'supermarket', url: 'https://www.mercadolivre.com.br/ofertas/supermercado' },
  { name: 'digital', url: 'https://www.mercadolivre.com.br/ofertas/digitais' },
  { name: 'clearance', url: 'https://www.mercadolivre.com.br/ofertas/queima-de-estoque' }
];

function createMercadoLivreRoundRobin(initialCursor = 0) {
  let cursor = Math.abs(Number(initialCursor) || 0) % 3;
  return {
    next() {
      const page = cursor + 1;
      cursor = (cursor + 1) % 3;
      return { name: `offers_page_${page}`, page, url: `https://www.mercadolivre.com.br/ofertas?page=${page}` };
    }
  };
}

function clean(value) {
  const result = String(value ?? '').replace(/\s+/g, ' ').trim();
  return result || null;
}

function number(value) {
  if (value == null || value === '') return null;
  const result = Number(String(value).replace(',', '.'));
  return Number.isFinite(result) ? result : null;
}

function normalizeId(value, prefix = 'MLB') {
  const match = String(value ?? '').toUpperCase().match(new RegExp(`^${prefix}-?(\\d+)$`));
  return match ? `${prefix}${match[1]}` : null;
}

function normalizeUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value, 'https://www.mercadolivre.com.br');
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|matt_|pdp_|position|type|backend_|client|recos_|deal|deal_print_id|tracking_id|sid)/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function paramsIncludingHash(href) {
  try {
    const url = new URL(href, 'https://www.mercadolivre.com.br');
    const params = new URLSearchParams(url.search);
    for (const [key, value] of new URLSearchParams(url.hash.replace(/^#/, ''))) params.set(key, value);
    return params;
  } catch {
    return new URLSearchParams();
  }
}

function identityFromCard(card, link) {
  const href = String(link.attr('href') ?? '');
  const params = paramsIncludingHash(href);
  const values = [params.get('wid'), params.get('item_id'), params.get('itemId')];
  for (const attribute of ['data-wid', 'data-item-id', 'data-item_id', 'data-itemid']) {
    values.push(link.attr(attribute), card.attr(attribute));
  }
  const semanticItemId = values.map(value => normalizeId(value)).find(Boolean) ?? null;
  const permalink = href.match(/\/(MLB)-?(\d+)-[^/?#]*_JM/i);
  const itemId = semanticItemId ?? (permalink ? `${permalink[1]}${permalink[2]}`.toUpperCase() : null);
  const productId = href.match(/\/p\/(MLB\d+)/i)?.[1]?.toUpperCase() ?? null;
  return {
    identity_type: itemId ? 'ITEM' : productId ? 'PRODUCT' : 'UNKNOWN',
    item_id: itemId,
    catalog_product_id: productId
  };
}

function moneyFromNode(node) {
  if (!node?.length) return null;
  const explicit = number(node.attr('data-andes-money-amount'));
  if (explicit != null) return explicit;
  const fractionText = clean(node.find('.andes-money-amount__fraction').first().text());
  if (fractionText) {
    const fraction = number(fractionText.replace(/\./g, ''));
    const centsText = clean(node.find('.andes-money-amount__cents').first().text());
    const cents = centsText && /^\d{1,2}$/.test(centsText) ? Number(centsText.padEnd(2, '0')) / 100 : 0;
    return fraction == null ? null : fraction + cents;
  }
  const match = clean(node.text())?.match(/R\$\s*([\d.]+(?:,\d{1,2})?)/);
  return match ? number(match[1].replace(/\./g, '').replace(',', '.')) : null;
}

function firstMoney(card, selectors) {
  for (const selector of selectors) {
    const value = moneyFromNode(card.find(selector).first());
    if (value != null) return value;
  }
  return null;
}

function firstText(card, selectors) {
  for (const selector of selectors) {
    const value = clean(card.find(selector).first().text());
    if (value) return value;
  }
  return null;
}

function parseMercadoLivreSsr({ source, sourceUrl, html, limit = MAX_CANDIDATES_PER_SOURCE }) {
  const $ = cheerio.load(html);
  const candidates = [];
  for (const [index, node] of $('.poly-card').toArray().entries()) {
    const card = $(node);
    const links = card.find('a[href]').toArray().map(element => $(element));
    const link = links.find(candidate => /\/p\/MLB\d+|\/MLB-?\d+-[^/?#]*_JM|(?:[?&#])(?:wid|item_id|itemId)=MLB/i.test(candidate.attr('href') ?? '')) ?? links[0] ?? $();
    const identity = identityFromCard(card, link);
    if (identity.identity_type === 'UNKNOWN') continue;
    const oldPrice = firstMoney(card, ['.andes-money-amount--previous', '.poly-price__previous .andes-money-amount', 's .andes-money-amount', 's']);
    const currentPrice = firstMoney(card, ['.poly-price__current .andes-money-amount', '.poly-price__current', '.poly-component__price .andes-money-amount:not(.andes-money-amount--previous)', '.andes-money-amount:not(.andes-money-amount--previous):not(s .andes-money-amount)']);
    const text = clean(card.text()) ?? '';
    const explicitDiscount = number(text.match(/(?:^|\s)(\d{1,3}(?:[.,]\d+)?)\s*%\s*OFF\b/i)?.[1]);
    const calculatedDiscount = oldPrice != null && currentPrice != null && oldPrice > 0 && oldPrice >= currentPrice
      ? Number((((oldPrice - currentPrice) / oldPrice) * 100).toFixed(2))
      : null;
    const image = card.find('img').first();
    const title = clean(link.attr('title')) ?? firstText(card, ['.poly-component__title', 'h2', 'h3']) ?? clean(image.attr('alt'));
    candidates.push({
      source,
      source_url: sourceUrl,
      source_position: index + 1,
      ...identity,
      title,
      current_price: currentPrice,
      old_price: oldPrice,
      discount_percent: explicitDiscount ?? calculatedDiscount,
      image_url: image.attr('data-src') ?? image.attr('src') ?? null,
      product_url: normalizeUrl(link.attr('href')),
      seller_id: null,
      seller_name: firstText(card, ['.poly-component__seller', '[class*="seller"]']),
      official_store_id: null,
      rating: number(firstText(card, ['.poly-reviews__rating', '[class*="rating"]'])?.match(/\d+(?:[.,]\d+)?/)?.[0]),
      shipping_free: /frete gr[aá]tis/i.test(text) ? true : null,
      category_id: null,
      promotion_type: source === 'lightning' ? 'lightning' : source === 'deal_of_the_day' ? 'deal_of_the_day' : source === 'clearance' ? 'clearance' : null,
      condition: null,
      discovery_sources: [source]
    });
    if (candidates.length >= limit) break;
  }
  return candidates;
}

function mergeCandidateSources(target, incoming) {
  target.discovery_sources = [...new Set([...(target.discovery_sources ?? [target.source]), ...(incoming.discovery_sources ?? [incoming.source])].filter(Boolean))];
  for (const [key, value] of Object.entries(incoming)) {
    if (target[key] == null && value != null) target[key] = value;
  }
}

function deduplicateMercadoLivreCandidates(rows) {
  const candidates = [];
  const byItem = new Map();
  const byProductOnly = new Map();
  let duplicates = 0;
  for (const row of rows ?? []) {
    const itemId = normalizeId(row.item_id);
    const productId = normalizeId(row.catalog_product_id);
    if (!itemId && !productId) continue;
    const existing = itemId ? byItem.get(itemId) : byProductOnly.get(productId);
    if (existing) {
      mergeCandidateSources(existing, row);
      duplicates++;
      continue;
    }
    const candidate = { ...row, item_id: itemId, catalog_product_id: productId, discovery_sources: [...new Set(row.discovery_sources ?? [row.source].filter(Boolean))] };
    candidates.push(candidate);
    if (itemId) byItem.set(itemId, candidate);
    else byProductOnly.set(productId, candidate);
  }
  return { candidates, duplicates };
}

function normalizeHighlightsProducts(content) {
  const products = [];
  let discardedUserProducts = 0;
  let discardedItems = 0;
  for (const entry of content ?? []) {
    let productId = null;
    if (entry.type === 'PRODUCT') productId = normalizeId(entry.id);
    else if (entry.type === 'USER_PRODUCT') {
      productId = normalizeId(entry.catalog_product_id);
      if (!productId) discardedUserProducts++;
    } else {
      discardedItems++;
    }
    if (!productId) continue;
    products.push({
      source: 'highlights_product',
      source_position: number(entry.position),
      identity_type: 'PRODUCT',
      item_id: null,
      catalog_product_id: productId,
      discovery_sources: ['highlights_product']
    });
  }
  return { products, discarded_user_products: discardedUserProducts, discarded_items: discardedItems };
}

function mergeMercadoLivreProductOffers({ source, productId, product, offers }) {
  const title = clean(product?.name ?? product?.family_name ?? product?.title);
  const productUrl = normalizeUrl(product?.permalink);
  const imageUrl = product?.pictures?.[0]?.url ?? product?.pictures?.[0]?.secure_url ?? product?.thumbnail ?? null;
  const rows = Array.isArray(offers) ? offers : Array.isArray(offers?.results) ? offers.results : [];
  return rows.filter(row => {
    const status = row.status ?? null;
    return normalizeId(row.item_id ?? row.id) && number(row.price) > 0 && (row.seller_id ?? row.seller?.id) && (!status || ['active', 'under_review'].includes(status));
  }).map((row, index) => {
    const currentPrice = number(row.price);
    const oldPrice = number(row.original_price);
    return {
      source,
      source_url: productUrl,
      source_position: index + 1,
      identity_type: 'ITEM',
      item_id: normalizeId(row.item_id ?? row.id),
      catalog_product_id: normalizeId(productId),
      title,
      current_price: currentPrice,
      old_price: oldPrice && oldPrice > currentPrice ? oldPrice : null,
      discount_percent: oldPrice && oldPrice > currentPrice ? Number((((oldPrice - currentPrice) / oldPrice) * 100).toFixed(2)) : null,
      image_url: row.thumbnail ?? row.pictures?.[0]?.url ?? imageUrl,
      product_url: productUrl ?? normalizeUrl(row.permalink) ?? `https://produto.mercadolivre.com.br/${((row.item_id ?? row.id) || '').replace(/^MLB/, 'MLB-')}`,
      seller_id: row.seller_id ?? row.seller?.id ?? null,
      seller_name: null,
      official_store_id: row.official_store_id ?? row.official_store?.id ?? null,
      rating: null,
      shipping_free: row.shipping?.free_shipping ?? null,
      category_id: row.category_id ?? null,
      promotion_type: Array.isArray(row.deal_ids) && row.deal_ids.length ? 'deal' : null,
      condition: row.condition ?? null,
      discovery_sources: [source]
    };
  });
}

async function readJson(response, label) {
  if (!response?.ok) throw new Error(`${label} HTTP ${response?.status ?? 'UNKNOWN'}`);
  return response.json();
}

async function runMercadoLivreDiscoveryV4(options = {}) {
  const startedAt = Date.now();
  const fetchImpl = options.fetchImpl ?? global.fetch;
  const apiFetchImpl = options.apiFetchImpl ?? fetchImpl;
  const rotation = options.rotation ?? defaultRotation;
  const maxProducts = Math.min(MAX_PRODUCTS_PER_CYCLE, Math.max(0, Number(options.maxProducts ?? MAX_PRODUCTS_PER_CYCLE)));
  const maxPerSource = Math.min(MAX_CANDIDATES_PER_SOURCE, Math.max(1, Number(options.maxCandidatesPerSource ?? MAX_CANDIDATES_PER_SOURCE)));
  const calls = { ssr: 0, highlights: 0, product: 0, product_offers: 0, total: 0 };
  const productsBySource = {};
  const rawCandidates = [];
  const sources = [rotation.next(), ...FIXED_SSR_SOURCES];

  for (const source of sources) {
    const response = await fetchImpl(source.url, { headers: { Accept: 'text/html', 'User-Agent': 'CacaOfertaMercadoLivreDiscoveryV4/1.0' } });
    calls.ssr++; calls.total++;
    if (!response?.ok) throw new Error(`${source.name} HTTP ${response?.status ?? 'UNKNOWN'}`);
    const candidates = parseMercadoLivreSsr({ source: source.name, sourceUrl: source.url, html: await response.text(), limit: maxPerSource });
    productsBySource[source.name] = candidates.length;
    rawCandidates.push(...candidates);
  }

  const headers = options.accessToken ? { Authorization: `Bearer ${options.accessToken}`, Accept: 'application/json' } : { Accept: 'application/json' };
  const highlightsUrl = `${API_BASE}/highlights/MLB/category/${HIGHLIGHTS_CATEGORY_ID}`;
  const highlightsBody = await readJson(await apiFetchImpl(highlightsUrl, { headers }), 'highlights');
  calls.highlights++; calls.total++;
  const highlights = normalizeHighlightsProducts(highlightsBody.content);
  productsBySource.highlights_product = highlights.products.length;
  rawCandidates.push(...highlights.products);

  const products = [];
  const productSources = new Map();
  const productPriority = [...highlights.products, ...rawCandidates.filter(candidate => candidate.source !== 'highlights_product')];
  for (const candidate of productPriority) {
    if (!candidate.catalog_product_id) continue;
    if (!productSources.has(candidate.catalog_product_id)) products.push(candidate.catalog_product_id);
    const sourceNames = productSources.get(candidate.catalog_product_id) ?? [];
    productSources.set(candidate.catalog_product_id, [...new Set([...sourceNames, ...(candidate.discovery_sources ?? [candidate.source])])]);
  }

  const enriched = [];
  for (const productId of products.slice(0, maxProducts)) {
    const product = await readJson(await apiFetchImpl(`${API_BASE}/products/${productId}`, { headers }), `product ${productId}`);
    calls.product++; calls.total++;
    const offers = await readJson(await apiFetchImpl(`${API_BASE}/products/${productId}/items`, { headers }), `product offers ${productId}`);
    calls.product_offers++; calls.total++;
    const sourceNames = productSources.get(productId) ?? ['highlights_product'];
    const merged = mergeMercadoLivreProductOffers({ source: sourceNames[0], productId, product, offers });
    for (const candidate of merged) candidate.discovery_sources = sourceNames;
    enriched.push(...merged);
  }

  const deduplicated = deduplicateMercadoLivreCandidates(enriched);
  const sourceCounts = new Map();
  const candidates = deduplicated.candidates.filter(candidate => {
    const source = candidate.source ?? 'unknown';
    const count = sourceCounts.get(source) ?? 0;
    if (count >= maxPerSource) return false;
    sourceCounts.set(source, count + 1);
    return true;
  });
  return {
    candidates,
    raw_candidates: enriched.length,
    duplicates: deduplicated.duplicates,
    deduplicated_candidates: deduplicated.candidates.length,
    source_limit_rejections: deduplicated.candidates.length - candidates.length,
    products_by_source: productsBySource,
    highlights: {
      products: highlights.products.length,
      discarded_user_products: highlights.discarded_user_products,
      discarded_items: highlights.discarded_items
    },
    elapsed_ms: Date.now() - startedAt,
    calls,
    db_writes: 0,
    ai_calls: 0,
    max_calls: 19,
    max_candidates_per_source: maxPerSource
  };
}

const defaultRotation = createMercadoLivreRoundRobin();

module.exports = {
  FIXED_SSR_SOURCES,
  HIGHLIGHTS_CATEGORY_ID,
  MAX_CANDIDATES_PER_SOURCE,
  MAX_PRODUCTS_PER_CYCLE,
  createMercadoLivreRoundRobin,
  deduplicateMercadoLivreCandidates,
  mergeMercadoLivreProductOffers,
  normalizeHighlightsProducts,
  parseMercadoLivreSsr,
  runMercadoLivreDiscoveryV4
};
