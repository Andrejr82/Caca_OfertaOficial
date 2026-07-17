'use strict';

const fs = require('fs');
const { execFileSync } = require('child_process');
const OFFERS_URL = 'https://www.mercadolivre.com.br/ofertas';

function clean(value) {
  const text = String(value ?? '').replaceAll('\n', ' ').replaceAll('\r', ' ').split(' ').filter(Boolean).join(' ').trim();
  return text && !text.includes('{') ? text : null;
}

function getNordicData(html) {
  const marker = '_n.ctx.r=';
  const markerAt = html.indexOf(marker);
  if (markerAt < 0) throw new Error('SSR Nordic context ausente');
  const start = html.indexOf('{', markerAt + marker.length);
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < html.length; index += 1) {
    const char = html[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return JSON.parse(html.slice(start, index + 1)).appProps?.pageProps?.data ?? {};
    }
  }
  throw new Error('SSR Nordic context incompleto');
}

function jsonValueAt(html, key) {
  const keyAt = html.indexOf(`"${key}"`);
  if (keyAt < 0) return null;
  const arrayAt = html.indexOf('[', keyAt + key.length + 2);
  if (arrayAt < 0) return null;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = arrayAt; index < html.length; index += 1) {
    const char = html[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === '[') depth += 1;
    else if (char === ']') {
      depth -= 1;
      if (depth === 0) return JSON.parse(html.slice(arrayAt, index + 1));
    }
  }
  return null;
}

function parseOffersSsrData(html) {
  try {
    return getNordicData(html);
  } catch {
    return {
      availableFilters: jsonValueAt(html, 'availableFilters') ?? [],
      items: jsonValueAt(html, 'items') ?? []
    };
  }
}

function component(components, id) {
  return (components ?? []).find((entry) => entry?.id === id) ?? null;
}

function imageUrlFromHtml(html, imageId) {
  if (!imageId) return null;
  let cursor = 0;
  while (cursor < html.length) {
    const imageAt = html.indexOf(imageId, cursor);
    if (imageAt < 0) return null;
    const srcAt = html.lastIndexOf('src="', imageAt);
    if (srcAt >= 0) {
      const start = srcAt + 5;
      const end = html.indexOf('"', start);
      const src = end > start ? html.slice(start, end) : null;
      if (src?.includes(imageId)) return src;
    }
    cursor = imageAt + imageId.length;
  }
  return null;
}

function productUrl(metadata) {
  const url = clean(metadata?.url);
  if (!url) return null;
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

function shipping(card) {
  const values = component(card.components, 'shipping_v2')?.shipping_v2 ?? [];
  const text = values.flatMap((entry) => entry.values ?? []).map((entry) => entry.label?.text ?? entry.icon?.alt_text).filter(Boolean).join(' ');
  return text.includes('Frete grátis') ? true : null;
}

function price(card) {
  const value = component(card.components, 'price_v2')?.price;
  if (!value) return { current: null, old: null, discount: null };
  let old = null;
  let discount = null;
  for (const entry of value.price_labels?.[0]?.values ?? []) {
    if (entry.price?.previous) old = Number(entry.price.value);
    if (entry.pill?.text) discount = Number.parseFloat(entry.pill.text);
  }
  return { current: Number(value.current_price?.value), old, discount };
}

function normalizeCard(cardEntry, category, sourceUrl, html, discoveredAt) {
  const card = cardEntry?.card ?? {};
  const money = price(card);
  const pictureId = card.pictures?.pictures?.[0]?.id ?? null;
  const result = {
    platform: 'Mercado Livre',
    source: 'mercadolivre_offers_ssr',
    source_url: sourceUrl,
    source_position: Number(cardEntry?.position) || null,
    category_id: category.id,
    category_name: category.name,
    item_id: clean(card.metadata?.id),
    product_id: clean(card.metadata?.product_id),
    title: clean(component(card.components, 'title')?.title?.text),
    current_price: Number.isFinite(money.current) && money.current > 0 ? money.current : null,
    old_price: Number.isFinite(money.old) && money.old > 0 ? money.old : null,
    discount_percent: Number.isFinite(money.discount) ? money.discount : null,
    seller_id: null,
    seller_name: clean(component(card.components, 'seller')?.seller?.text),
    shipping_free: shipping(card),
    image_url: imageUrlFromHtml(html, pictureId),
    product_url: productUrl(card.metadata),
    score: null,
    status: 'pending_manual_review',
    discovered_at: discoveredAt,
    source_categories: [{ category_id: category.id, category_name: category.name, source_position: Number(cardEntry?.position) || null }]
  };
  const invalid = [];
  if (!result.item_id && !result.product_id && !result.product_url) invalid.push('IDENTIDADE_AUSENTE');
  if (!result.title) invalid.push('TITULO_AUSENTE');
  if (!result.current_price) invalid.push('PRECO_ATUAL_INVALIDO');
  if (!result.image_url) invalid.push('IMAGEM_AUSENTE');
  if (!result.product_url) invalid.push('URL_AUSENTE');
  if (!result.category_id || !result.category_name) invalid.push('CATEGORIA_AUSENTE');
  if (!result.source_position) invalid.push('POSICAO_AUSENTE');
  return { product: result, invalid };
}

function mergeProduct(target, incoming) {
  target.source_categories.push(...incoming.source_categories);
  if ((incoming.source_position ?? Infinity) < (target.source_position ?? Infinity)) {
    for (const key of ['source_url', 'source_position', 'category_id', 'category_name']) target[key] = incoming[key];
  }
}

function deduplicate(products) {
  const byItem = new Map();
  const byUrl = new Map();
  const byProduct = new Map();
  const unique = [];
  let duplicates = 0;
  for (const product of products) {
    const previous = (product.item_id && byItem.get(product.item_id)) || (product.product_url && byUrl.get(product.product_url)) || (product.product_id && byProduct.get(product.product_id));
    if (previous) {
      mergeProduct(previous, product);
      duplicates += 1;
      continue;
    }
    unique.push(product);
    if (product.item_id) byItem.set(product.item_id, product);
    if (product.product_url) byUrl.set(product.product_url, product);
    if (product.product_id) byProduct.set(product.product_id, product);
  }
  return { products: unique, duplicates };
}

function fetchOffersHtmlViaCertifiedTransport(url, { execFileSync: run = execFileSync } = {}) {
  const encodedUrl = Buffer.from(url, 'utf8').toString('base64');
  const command = `$url=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedUrl}'));$html=(Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 30).Content;[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($html))`;
  const output = run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', timeout: 45000, windowsHide: true });
  return Buffer.from(String(output).trim(), 'base64').toString('utf8');
}

async function fetchPage(fetchImpl, url) {
  if (!fetchImpl) return fetchOffersHtmlViaCertifiedTransport(url);
  const response = await fetchImpl(url, { headers: { Accept: 'text/html', 'User-Agent': 'CacaOfertaOficial/5.0' } });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`);
  return response.text();
}

async function runMercadoLivreNativeTop20({ fetchImpl = null, now = () => new Date().toISOString() } = {}) {
  const startedAt = Date.now();
  const transport = typeof fetchImpl === 'function' ? fetchImpl : null;
  const landingHtml = await fetchPage(transport, OFFERS_URL);
  const landing = parseOffersSsrData(landingHtml);
  const categoryFilter = (landing.availableFilters ?? []).find((entry) => entry?.id === 'category');
  const categories = (categoryFilter?.values ?? []).map((entry, index) => ({ id: clean(entry.id), name: clean(entry.name), landing_position: index + 1, available_count: Number(entry.results) || null })).filter((entry) => entry.id && entry.name);
  const byCategory = {};
  const valid = [];
  const discarded = [];
  const errors = [];
  let calls = 1;
  for (const category of categories) {
    const sourceUrl = `${OFFERS_URL}?category=${encodeURIComponent(category.id)}`;
    try {
      const html = await fetchPage(transport, sourceUrl);
      calls += 1;
      const data = parseOffersSsrData(html);
      const cards = (data.items ?? []).slice(0, 20);
      let categoryValid = 0;
      for (const card of cards) {
        const normalized = normalizeCard(card, category, sourceUrl, html, now());
        if (normalized.invalid.length) discarded.push({ category_id: category.id, source_position: normalized.product.source_position, reasons: normalized.invalid });
        else {
          valid.push(normalized.product);
          categoryValid += 1;
        }
      }
      byCategory[category.id] = { collected: cards.length, valid: categoryValid, empty: cards.length === 0 };
    } catch (error) {
      calls += 1;
      byCategory[category.id] = { collected: 0, valid: 0, empty: true };
      errors.push({ category_id: category.id, message: error.message });
    }
  }
  const deduplicated = deduplicate(valid);
  return {
    categories,
    by_category: byCategory,
    raw_products: valid.length + discarded.length,
    valid_products: valid.length,
    discarded_products: discarded.length,
    duplicates: deduplicated.duplicates,
    products: deduplicated.products,
    calls,
    errors,
    elapsed_ms: Date.now() - startedAt
  };
}

function writeMercadoLivreNativeTop20Reports(result, { writeFileSync = fs.writeFileSync, now = () => new Date().toISOString() } = {}) {
  const report = { generated_at: now(), ...result };
  const categories = report.categories ?? [];
  const lines = [
    '# Mercado Livre Native Top 20',
    '',
    `- Categorias: ${categories.length}`,
    `- Chamadas: ${report.calls ?? 0}`,
    `- Produtos brutos: ${report.raw_products ?? 0}`,
    `- Válidos: ${report.valid_products ?? 0}`,
    `- Descartados: ${report.discarded_products ?? 0}`,
    `- Duplicados: ${report.duplicates ?? 0}`,
    `- Únicos: ${(report.products ?? []).length}`,
    '',
    '## Categorias',
    ...categories.map((category) => `- ${category.name} (${category.id}): ${report.by_category?.[category.id]?.valid ?? 0}`)
  ];
  writeFileSync('reports/mercadolivre-native-top20-latest.json', `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync('reports/mercadolivre-native-top20-latest.md', `${lines.join('\n')}\n`);
}

module.exports = { OFFERS_URL, getNordicData, parseOffersSsrData, fetchOffersHtmlViaCertifiedTransport, normalizeCard, deduplicate, runMercadoLivreNativeTop20, writeMercadoLivreNativeTop20Reports };
