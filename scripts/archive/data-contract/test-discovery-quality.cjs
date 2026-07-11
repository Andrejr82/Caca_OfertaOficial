'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const ENV_FILE = path.join(ROOT, '.env.local');
const HISTORY_FILE = path.join(ROOT, 'data', 'shopee_seen_products.json');
const REPORT_DIR = path.join(ROOT, 'reports');
const JSON_REPORT = path.join(REPORT_DIR, 'discovery-quality-test.json');
const MD_REPORT = path.join(REPORT_DIR, 'discovery-quality-test.md');
const PREVIOUS_REPORT = path.join(REPORT_DIR, 'marketplace-discovery-validation.json');

require('dotenv').config({ path: ENV_FILE, quiet: true });
process.env.ORACLE_SCRAPER_DISABLE_AUTORUN = '1';
process.env.LLM_DIAGNOSTIC = '0';

const secrets = Object.entries(process.env)
  .filter(([key, value]) => value && /SECRET|TOKEN|KEY|PASSWORD|CREDENTIAL|SIGNATURE/i.test(key))
  .map(([, value]) => String(value)).filter(value => value.length >= 6).sort((a, b) => b.length - a.length);

const SHOPEE_CATEGORIES = [
  'Computadores e Acessórios', 'Celulares e Dispositivos', 'Eletrodomésticos',
  'Casa e Construção', 'Beleza', 'Esportes e Lazer', 'Roupas e Calçados'
];
const SHOPEE_SORTS = [
  { value: 2, label: 'vendas/popularidade' },
  { value: 5, label: 'comissão' },
  { value: 4, label: 'desconto' }
];
const NETSHOES_KEYWORDS = ['tênis', 'corrida', 'futebol', 'academia', 'roupas esportivas', 'nike adidas'];

function redact(value) {
  let text = typeof value === 'string' ? value : JSON.stringify(value);
  for (const secret of secrets) text = text.split(secret).join('[REDACTED]');
  return text
    .replace(/([?&](?:token|api_?key|key|secret|access_?token|authorization)=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1[REDACTED]')
    .replace(/(Credential=)[^,\s]+/gi, '$1[REDACTED]');
}

function safeUrl(raw) {
  if (!raw) return null;
  try {
    const url = new URL(redact(String(raw)));
    url.username = '';
    url.password = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/token|key|secret|password|authorization|signature/i.test(key)) url.searchParams.set(key, '[REDACTED]');
    }
    return url.toString();
  } catch { return redact(String(raw)); }
}

function hashFile(file) {
  return fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null;
}

function number(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function percent(value) {
  const n = number(value);
  if (n == null) return null;
  return n > 0 && n <= 1 ? n * 100 : n;
}

function realDiscount(price, oldPrice, explicit) {
  const p = number(price), old = number(oldPrice), exp = percent(explicit);
  if (p != null && old != null && old > p && old > 0) return Number((((old - p) / old) * 100).toFixed(2));
  return exp != null && exp > 0 && exp <= 100 ? Number(exp.toFixed(2)) : null;
}

function finalScore(product) {
  return Number((product.trendConversionProxy * 0.45
    + product.commercialOpportunityScore * 0.40
    + product.diversityAttractivenessScore * 0.15).toFixed(2));
}

function scoreTrend(product) {
  let score = 0;
  const signals = [], unavailable = [];
  const rank = number(product.position);
  if (rank != null) { const points = Math.max(2, 22 - (rank - 1) * 4); score += points; signals.push(`posição:${rank} (+${points})`); }
  else unavailable.push('posição/ranking');
  const sales = number(product.sales);
  if (sales != null && sales > 0) { const points = Math.min(35, Math.round(Math.log10(sales + 1) * 7)); score += points; signals.push(`vendas:${sales} (+${points})`); }
  else unavailable.push('vendas/popularidade');
  const rating = number(product.rating);
  if (rating != null) { const points = Math.min(10, Math.round((rating / 5) * 10)); score += points; signals.push(`rating:${rating} (+${points})`); }
  else unavailable.push('rating');
  const reviews = number(product.reviews);
  if (reviews != null && reviews > 0) { const points = Math.min(10, Math.round(Math.log10(reviews + 1) * 2.5)); score += points; signals.push(`reviews:${reviews} (+${points})`); }
  else unavailable.push('reviews');
  const source = String(product.referenceType || '').toLowerCase();
  const sort = number(product.sortType);
  const sourcePoints = sort === 2 ? 15 : source.includes('movers') ? 18 : source.includes('best') ? 15 : source.includes('deals') ? 7 : sort === 5 ? 5 : sort === 4 ? 3 : 0;
  if (sourcePoints) { score += sourcePoints; signals.push(`fonte:${product.referenceType} (+${sourcePoints})`); }
  else unavailable.push('sinal forte da fonte');
  const commission = percent(product.commission);
  if (commission != null) { const points = Math.min(8, Math.round(commission / 3)); score += points; signals.push(`comissão:${commission}% (+${points})`); }
  else unavailable.push('comissão');
  if (product.availability === true) { score += 5; signals.push('disponível (+5)'); }
  else unavailable.push('disponibilidade');
  return { value: Math.min(100, score), signals, unavailable };
}

function scoreCommercial(product) {
  let score = 0;
  const signals = [], unavailable = [];
  const discount = number(product.discountPercent);
  if (discount != null && discount > 0) { const points = Math.min(40, Math.round(discount * 0.8)); score += points; signals.push(`desconto real:${discount}% (+${points})`); }
  else unavailable.push('desconto real');
  if (number(product.oldPrice) > number(product.price)) { score += 10; signals.push('preço antigo comprovado (+10)'); }
  else unavailable.push('preço antigo');
  if (product.coupon) { score += 10; signals.push('cupom real (+10)'); }
  else unavailable.push('cupom');
  const commission = percent(product.commission);
  if (commission != null) { const points = Math.min(15, Math.round(commission / 2)); score += points; signals.push(`comissão:${commission}% (+${points})`); }
  else unavailable.push('comissão');
  const rating = number(product.rating);
  if (rating != null) { const points = Math.min(10, Math.round((rating / 5) * 10)); score += points; signals.push(`rating:${rating} (+${points})`); }
  else unavailable.push('rating');
  if (product.officialStoreProven === true) { score += 5; signals.push('loja oficial comprovada (+5)'); }
  else unavailable.push('loja oficial comprovada');
  if (product.availability === true) { score += 5; signals.push('disponibilidade válida (+5)'); }
  else unavailable.push('disponibilidade');
  if (product.promotionPeriodValid === true) { score += 5; signals.push('período válido (+5)'); }
  else unavailable.push('período promocional');
  if (product.freeShipping === true) { score += 5; signals.push('frete comprovado (+5)'); }
  else unavailable.push('frete');
  return { value: Math.min(100, score), signals, unavailable };
}

function words(title) {
  return new Set(String(title || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(word => word.length > 2));
}

function similarity(a, b) {
  const aa = words(a), bb = words(b);
  if (!aa.size || !bb.size) return 0;
  const common = [...aa].filter(word => bb.has(word)).length;
  return common / new Set([...aa, ...bb]).size;
}

function priceBand(price) {
  const p = number(price) || 0;
  return p < 50 ? '<50' : p < 150 ? '50-149' : p < 500 ? '150-499' : '500+';
}

function addDiversityScores(products) {
  const dimensions = ['category', 'brand', 'seller'];
  const frequencies = Object.fromEntries(dimensions.map(key => [key, {}]));
  const bands = {};
  for (const product of products) {
    for (const key of dimensions) { const value = product[key] || 'ausente'; frequencies[key][value] = (frequencies[key][value] || 0) + 1; }
    const band = priceBand(product.price); bands[band] = (bands[band] || 0) + 1;
  }
  return products.map((product, index) => {
    const total = Math.max(products.length, 1);
    const penalties = {
      category: Math.round((frequencies.category[product.category || 'ausente'] / total) * 25),
      brand: Math.round((frequencies.brand[product.brand || 'ausente'] / total) * 15),
      seller: Math.round((frequencies.seller[product.seller || 'ausente'] / total) * 15),
      priceBand: Math.round((bands[priceBand(product.price)] / total) * 20),
      similarity: products.some((other, otherIndex) => otherIndex !== index && similarity(product.title, other.title) >= 0.7) ? 25 : 0
    };
    product.diversityAttractivenessScore = Math.max(0, 100 - Object.values(penalties).reduce((sum, value) => sum + value, 0));
    product.diversitySignals = { penalties, unavailable: dimensions.filter(key => !product[key]) };
    product.finalDiscoveryScore = finalScore(product);
    return product;
  });
}

function canonicalKey(product) {
  return product.productId || product.sku || product.asin || safeUrl(product.url) || `${product.marketplace}:${String(product.title || '').toLowerCase()}`;
}

function dedupe(products) {
  const seen = new Set(), unique = [], duplicates = [];
  for (const product of products) {
    const key = canonicalKey(product);
    if (seen.has(key)) duplicates.push({ key, title: product.title, reference: product.reference });
    else { seen.add(key); unique.push(product); }
  }
  return { unique, duplicates };
}

function selectDiverse(products, limit = 20) {
  const selected = [], counts = { category: {}, brand: {}, seller: {} };
  for (const product of [...products].sort((a, b) => b.finalDiscoveryScore - a.finalDiscoveryScore)) {
    if (selected.length >= limit) break;
    if ((counts.category[product.category || 'ausente'] || 0) >= 2) continue;
    if (product.brand && (counts.brand[product.brand] || 0) >= 2) continue;
    if (product.seller && (counts.seller[product.seller] || 0) >= 2) continue;
    if (selected.some(item => similarity(item.title, product.title) >= 0.7)) continue;
    selected.push(product);
    for (const key of Object.keys(counts)) if (product[key]) counts[key][product[key]] = (counts[key][product[key]] || 0) + 1;
  }
  return selected;
}

function average(values) {
  const valid = values.filter(value => Number.isFinite(value));
  return valid.length ? Number((valid.reduce((sum, value) => sum + value, 0) / valid.length).toFixed(2)) : null;
}

function selectionMetrics(products) {
  const metrics = {
    products: products.length,
    categories: new Set(products.map(p => p.category).filter(Boolean)).size,
    brands: new Set(products.map(p => p.brand).filter(Boolean)).size,
    sellers: new Set(products.map(p => p.seller).filter(Boolean)).size,
    priceBands: new Set(products.map(p => priceBand(p.price))).size,
    similarPairs: products.reduce((count, p, i) => count + products.slice(i + 1).filter(other => similarity(p.title, other.title) >= 0.7).length, 0),
    averagePrice: average(products.map(p => number(p.price))),
    averageRealDiscount: average(products.map(p => number(p.discountPercent))),
    averageCommercialOpportunity: average(products.map(p => p.commercialOpportunityScore)),
    averageFinalDiscoveryScore: average(products.map(p => p.finalDiscoveryScore))
  };
  metrics.categoryCoverage = products.length ? Number((metrics.categories / products.length).toFixed(2)) : 0;
  metrics.brandCoverage = products.length ? Number((metrics.brands / products.length).toFixed(2)) : 0;
  metrics.sellerCoverage = products.length ? Number((metrics.sellers / products.length).toFixed(2)) : 0;
  return metrics;
}

async function capture(task) {
  const original = { log: console.log, warn: console.warn, error: console.error };
  const logs = [];
  for (const level of Object.keys(original)) console[level] = (...args) => logs.push(redact(args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' ')));
  try { return { value: await task(), logs }; }
  finally { Object.assign(console, original); }
}

function priorEvidence(marketplace) {
  try {
    const previous = JSON.parse(fs.readFileSync(PREVIOUS_REPORT, 'utf8'));
    const item = previous.marketplaces.find(entry => entry.marketplace === marketplace);
    return item ? { executedAt: previous.executedAt, authentication: item.authentication, httpStatus: item.parameters?.httpStatus || null, previouslyWorked: item.authentication === 'OK' } : null;
  } catch { return null; }
}

function baseMarketplace(name, endpoint, productionFunctions) {
  return { marketplace: name, endpoint, productionFunctions, envLoaded: fs.existsSync(ENV_FILE), references: [], products: [], duplicates: [], errors: [], limitations: [], previousEvidence: priorEvidence(name) };
}

function finishProduct(product) {
  const trend = scoreTrend(product), commercial = scoreCommercial(product);
  product.trendConversionProxy = trend.value;
  product.trendSignals = trend;
  product.commercialOpportunityScore = commercial.value;
  product.commercialSignals = commercial;
  return product;
}

async function shopee(oracle) {
  const out = baseMarketplace('Shopee', 'https://open-api.affiliate.shopee.com.br/graphql', ['runShopeeOfficialPipeline', 'fetchShopeeOfficialDiscovery']);
  out.limitations.push('Categorias dinâmicas via HTML desativadas; somente GraphQL oficial. Campanhas não fazem parte do pipeline EPIC 09 atual.');
  for (const category of SHOPEE_CATEGORIES) {
    for (const sort of SHOPEE_SORTS) {
      const reference = { id: `${category}|${sort.value}`, category, sortType: sort.value, direction: sort.label, received: 0, valid: 0, historyRejected: 0, duplicates: 0, candidates: 0, status: null };
      const temp = path.join(REPORT_DIR, `.quality-history-${process.pid}-${crypto.randomUUID()}.json`);
      fs.copyFileSync(HISTORY_FILE, temp);
      try {
        const historyStore = oracle.createShopeeHistoryStore(temp);
        const captured = await capture(() => oracle.runShopeeOfficialPipeline(category, 5, {
          mode: 'manual_review', historyStore,
          fetcher: ({ categories }) => oracle.fetchShopeeOfficialDiscovery({ categories, sortTypes: [sort.value], pages: [1], limit: 5, resolveCategoriesFromHtml: false })
        }));
        const { candidates, telemetry } = captured.value;
        Object.assign(reference, {
          received: telemetry.received,
          valid: candidates.length,
          historyRejected: telemetry.historyFilteredOut,
          duplicates: telemetry.duplicatesRejected,
          selectionRejected: Math.max(0, telemetry.scored - telemetry.selected),
          candidateQueueRejected: Math.max(0, telemetry.selected - telemetry.candidatesGenerated),
          candidates: candidates.length,
          status: telemetry.received ? 200 : null
        });
        candidates.forEach((candidate, index) => out.products.push(finishProduct({
          marketplace: 'Shopee', reference: reference.id, referenceType: sort.label, category, sortType: sort.value, position: index + 1,
          productId: candidate.marketplaceProductId, title: candidate.productName, price: number(candidate.currentPrice),
          oldPrice: number(candidate.originalPrice) > number(candidate.currentPrice) ? number(candidate.originalPrice) : null,
          discountPercent: realDiscount(candidate.currentPrice, candidate.originalPrice, candidate.discount), coupon: null,
          commission: percent(candidate.commission), sales: number(candidate.sales), rating: number(candidate.rating), reviews: null,
          seller: candidate.shopName || null, brand: candidate.brand && candidate.brand !== 'UnknownBrand' ? candidate.brand : null,
          officialStoreProven: false, availability: null, promotionPeriodValid: null, freeShipping: null,
          url: safeUrl(candidate.productLink), affiliateUrl: safeUrl(candidate.affiliateLink), historyReason: candidate.historyReason,
          productionSelectionReason: candidate.selectionReason, dataMarkers: { coupon: 'ausente', officialStore: 'não comprovado', trendConversionProxy: 'proxy' }
        })));
      } catch (error) { reference.error = redact(error.message); out.errors.push({ reference: reference.id, error: reference.error }); }
      finally { for (const file of [temp, `${temp}.bak`]) if (fs.existsSync(file)) fs.unlinkSync(file); }
      out.references.push(reference);
    }
  }
  return out;
}

async function mercadoLivre(oracle) {
  const out = baseMarketplace('Mercado Livre', 'https://api.scrape.do?super=true', ['selectDiscoveryQueries', 'inspectMarketplaceCardsWithCrawlee']);
  out.limitations.push('Etapa anterior ao LLM usada; helper dry-run real preserva Scrape.do e parser, sem executar formatação LLM.');
  if (process.env.ML_PROVIDER !== 'scrapedo' || process.env.ML_DISCOVERY_MODE !== 'signals' || !process.env.SCRAPEDO_API_KEY) {
    out.errors.push({ status: null, error: 'Configuração Scrape.do/signals incompleta.' }); return out;
  }
  const signal = (await capture(() => Promise.resolve(oracle.selectDiscoveryQueries('Mercado Livre')))).value;
  const configured = oracle.MARKETPLACE_DISCOVERY_SOURCES['Mercado Livre'] || [];
  const sources = [...signal.map(item => ({ ...item, type: 'signal' })), ...configured]
    .filter((item, index, list) => list.findIndex(other => other.source === item.source) === index).slice(0, 6);
  for (const source of sources) {
    const reference = { id: safeUrl(source.source), type: source.type || 'url', direction: source.fallbackKeyword || source.source, received: 0, valid: 0, cardsWithPrice: 0, status: null };
    try {
      const captured = await capture(() => oracle.inspectMarketplaceCardsWithCrawlee(source.source, 'Mercado Livre', 5));
      const data = captured.value;
      reference.received = data.cardsFound; reference.cardsWithPrice = data.cardsWithPrice; reference.valid = data.products.length; reference.status = data.cardsFound ? 200 : null;
      data.products.forEach((product, index) => out.products.push(finishProduct({
        marketplace: 'Mercado Livre', reference: reference.id, referenceType: reference.type, position: index + 1,
        productId: null, title: product.product_name, category: product.category || 'Geral', brand: null, seller: null,
        price: number(product.current_price), oldPrice: number(product.old_price), discountPercent: realDiscount(product.current_price, product.old_price, null),
        coupon: null, commission: null, sales: null, rating: null, reviews: null, officialStoreProven: false,
        availability: null, promotionPeriodValid: null, freeShipping: null, image: safeUrl(product.image_url), url: safeUrl(product.url),
        dataMarkers: { discount: product.old_price ? 'dado real' : 'ausente', coupon: 'ausente', seller: 'ausente', trendConversionProxy: 'proxy' }
      })));
    } catch (error) { reference.error = redact(error.message); out.errors.push({ reference: reference.id, error: reference.error }); }
    out.references.push(reference);
  }
  return out;
}

function amazonReferenceFromLogs(logs, fallback) {
  for (const line of logs) {
    const match = line.match(/Sucesso.*via\s+(https?:\/\/\S+)/i) || line.match(/Tentando URL:\s+(https?:\/\/\S+)/i);
    if (match) fallback = match[1].replace(/[.,]$/, '');
  }
  return safeUrl(fallback);
}

async function amazon(oracle, scraper, discoveryConfig) {
  const out = baseMarketplace('Amazon', 'http://193.122.242.178:3002/api/scrape', ['fetchAmazonTrendingProducts', 'canonicalizeAmazonProductUrl']);
  out.limitations.push('New Releases não existe no fluxo atual. Chamada sem keyword percorre Deals, Movers & Shakers e Best Sellers até primeiro sucesso.');
  const keyword = discoveryConfig.VIRAL_SEARCH_TARGETS.Amazon[0].query;
  const tests = [
    { type: 'keyword atual', value: keyword, expectedUrl: `https://www.amazon.com.br/s?k=${encodeURIComponent(`${keyword} oferta`)}` },
    { type: 'fallback bundle', value: null, expectedUrl: 'https://www.amazon.com.br/deals' }
  ];
  for (const test of tests) {
    const reference = { id: test.expectedUrl, type: test.type, direction: test.value || 'Deals, Movers & Shakers, Best Sellers', received: 0, valid: 0, withTitle: 0, withPrice: 0, canonicalized: 0, sponsoredRejected: 0, status: null };
    try {
      const captured = await capture(() => scraper.fetchAmazonTrendingProducts(5, test.value || undefined));
      const products = captured.value;
      const fallbackFailures = test.value === null ? captured.logs.map(line => {
        const match = line.match(/status\s+(\d{3})\s+para\s+(https?:\/\/\S+)/i);
        return match ? { id: safeUrl(match[2].replace(/[.,]$/, '')), type: match[2].includes('/deals') ? 'Deals' : match[2].includes('movers-and-shakers') ? 'Movers & Shakers' : 'Best Sellers', direction: match[2], received: 0, valid: 0, withTitle: 0, withPrice: 0, canonicalized: 0, sponsoredRejected: 0, status: Number(match[1]) } : null;
      }).filter(Boolean) : [];
      if (fallbackFailures.length && products.length === 0) {
        out.references.push(...fallbackFailures);
        fallbackFailures.forEach(item => out.errors.push({ reference: item.id, status: item.status, envLoaded: true, previouslyWorked: out.previousEvidence?.previouslyWorked ?? null }));
        continue;
      }
      reference.id = amazonReferenceFromLogs(captured.logs, test.expectedUrl);
      const status = captured.logs.map(line => line.match(/status\s+(\d{3})/i)?.[1]).find(Boolean);
      reference.status = status ? Number(status) : (products.length ? 200 : null);
      reference.received = products.length; reference.withTitle = products.filter(p => p.product_name).length; reference.withPrice = products.filter(p => number(p.current_price) > 0).length;
      products.forEach((product, index) => {
        const canonical = oracle.canonicalizeAmazonProductUrl(product.original_url);
        if (!canonical.url) { if (canonical.sponsored) reference.sponsoredRejected++; return; }
        if (canonical.url !== product.original_url) reference.canonicalized++;
        out.products.push(finishProduct({
          marketplace: 'Amazon', reference: reference.id, referenceType: test.type, position: index + 1, asin: canonical.asin,
          title: product.product_name, category: product.category || null, brand: null, seller: null,
          price: number(product.current_price), oldPrice: number(product.old_price), discountPercent: realDiscount(product.current_price, product.old_price, null),
          coupon: null, commission: null, sales: null, rating: number(product.rating), reviews: null, officialStoreProven: false,
          availability: null, promotionPeriodValid: null, freeShipping: null, image: safeUrl(product.image_url), url: safeUrl(canonical.url),
          dataMarkers: { reviews: 'ausente', coupon: 'ausente', trendConversionProxy: 'proxy' }
        }));
      });
      reference.valid = out.products.filter(product => product.reference === reference.id).length;
      if (reference.status === 401 || reference.status === 403) out.errors.push({ reference: reference.id, status: reference.status, envLoaded: true, previouslyWorked: out.previousEvidence?.previouslyWorked ?? null });
    } catch (error) { reference.error = redact(error.message); out.errors.push({ reference: reference.id, error: reference.error }); }
    out.references.push(reference);
  }
  return out;
}

function availability(value) {
  if (!value) return null;
  const normalized = String(value).toLowerCase();
  if (/out of stock|unavailable|indispon|esgotad|sem estoque/.test(normalized)) return false;
  if (/in stock|available|disponível|em estoque|^1$|^true$/.test(normalized)) return true;
  return null;
}

async function netshoes(oracle) {
  const out = baseMarketplace('Netshoes', 'https://api.linksynergy.com/productsearch/1.0', ['fetchNetshoesProductsFromRakuten']);
  for (const keyword of NETSHOES_KEYWORDS) {
    const reference = { id: keyword, type: 'keyword', direction: `MID ${process.env.RAKUTEN_NETSHOES_MID || 'ausente'}`, received: 0, valid: 0, status: null, filters: { max: 10, pagenumber: 1, language: 'pt_BR' } };
    if (out.references.some(item => item.status === 401 || item.status === 403)) { reference.skipped = 'autenticação já falhou'; out.references.push(reference); continue; }
    try {
      const captured = await capture(() => oracle.fetchNetshoesProductsFromRakuten(keyword, 10, 1));
      const products = captured.value;
      const status = captured.logs.map(line => line.match(/HTTP\s+(\d{3})/i)?.[1]).find(Boolean);
      reference.status = status ? Number(status) : (products.length ? 200 : null); reference.received = products.length;
      products.forEach((product, index) => {
        const available = availability(product.availability);
        const periodValid = (!product.begin_date || Date.parse(product.begin_date) <= Date.now()) && (!product.end_date || Date.parse(product.end_date) >= Date.now());
        const availabilityValid = !product.availability || available === true;
        const discount = realDiscount(product.sale_price, product.retail_price, null);
        const validPromotion = discount != null && periodValid && availabilityValid;
        if (validPromotion) reference.valid++;
        out.products.push(finishProduct({
          marketplace: 'Netshoes', reference: keyword, referenceType: 'keyword', position: index + 1,
          productId: product.product_id, sku: product.sku, title: product.product_name, brand: product.brand, category: product.category,
          seller: product.merchant_name, price: number(product.sale_price) || number(product.current_price), oldPrice: number(product.retail_price),
          discountPercent: validPromotion ? discount : null, discountType: product.discount_type, coupon: null, commission: null,
          beginDate: product.begin_date, endDate: product.end_date, availabilityRaw: product.availability, availability: available,
          promotionPeriodValid: periodValid, sales: null, rating: null, reviews: null, officialStoreProven: false, freeShipping: null,
          url: safeUrl(product.original_url), affiliateUrl: safeUrl(product.affiliate_url), validPromotion,
          dataMarkers: { promotion: validPromotion ? 'dado real' : 'não comprovado', coupon: 'ausente', trendConversionProxy: 'proxy' }
        }));
      });
      if (reference.status === 401 || reference.status === 403) out.errors.push({ reference: keyword, status: reference.status, endpoint: out.endpoint, envLoaded: true, previouslyWorked: out.previousEvidence?.previouslyWorked ?? null });
    } catch (error) { reference.error = redact(error.message); out.errors.push({ reference: keyword, error: reference.error }); }
    out.references.push(reference);
  }
  return out;
}

function summarizeMarketplace(marketplace) {
  const deduped = dedupe(marketplace.products);
  marketplace.duplicates = deduped.duplicates;
  marketplace.products = addDiversityScores(deduped.unique);
  marketplace.references = marketplace.references.map(reference => {
    const products = marketplace.products.filter(product => product.reference === reference.id);
    return { ...reference, trendConversionProxy: average(products.map(p => p.trendConversionProxy)), commercialOpportunityScore: average(products.map(p => p.commercialOpportunityScore)), diversityAttractivenessScore: average(products.map(p => p.diversityAttractivenessScore)), finalDiscoveryScore: average(products.map(p => p.finalDiscoveryScore)) };
  });
  marketplace.bestReference = [...marketplace.references].filter(ref => ref.finalDiscoveryScore != null).sort((a, b) => b.finalDiscoveryScore - a.finalDiscoveryScore)[0] || null;
  marketplace.top10 = [...marketplace.products].sort((a, b) => b.finalDiscoveryScore - a.finalDiscoveryScore).slice(0, 10);
  return marketplace;
}

function conclusions(marketplaces) {
  const all = marketplaces.flatMap(m => m.products);
  const refs = marketplaces.flatMap(m => m.references.map(ref => ({ marketplace: m.marketplace, ...ref }))).filter(ref => ref.finalDiscoveryScore != null);
  const categories = Object.values(all.reduce((acc, p) => {
    const key = p.category || 'ausente';
    acc[key] ||= { category: key, count: 0, commercial: [] };
    acc[key].count++; acc[key].commercial.push(p.commercialOpportunityScore); return acc;
  }, {})).map(item => ({ category: item.category, count: item.count, averageCommercial: average(item.commercial) }));
  return {
    bestByMarketplace: marketplaces.map(m => ({ marketplace: m.marketplace, reference: m.bestReference })),
    weakReferences: [...refs].sort((a, b) => a.finalDiscoveryScore - b.finalDiscoveryScore).slice(0, 8),
    bestCommercialCategories: [...categories].sort((a, b) => (b.averageCommercial || 0) - (a.averageCommercial || 0)).slice(0, 5),
    repetitiveCategories: [...categories].sort((a, b) => b.count - a.count).slice(0, 5),
    highDiscountLowAttractiveness: all.filter(p => p.discountPercent >= 40 && p.diversityAttractivenessScore < 50).map(p => ({ marketplace: p.marketplace, title: p.title, discount: p.discountPercent, diversity: p.diversityAttractivenessScore })),
    popularWithoutDiscount: all.filter(p => (p.sales > 0 || p.sortType === 2) && p.discountPercent == null).map(p => ({ marketplace: p.marketplace, title: p.title, sales: p.sales, reference: p.reference })),
    realCoupons: all.filter(p => p.coupon).map(p => ({ marketplace: p.marketplace, title: p.title, coupon: p.coupon })),
    provenOfficialStores: all.filter(p => p.officialStoreProven).map(p => ({ marketplace: p.marketplace, title: p.title, seller: p.seller })),
    closestToViral: [...all].sort((a, b) => b.trendConversionProxy - a.trendConversionProxy).slice(0, 5)
  };
}

function markdown(report) {
  const lines = ['# Discovery Quality Test', '', `Executado: ${report.executedAt}`, '',
    'Scores são proxies comparativos; não representam conversão real.', ''];
  for (const marketplace of report.marketplaces) {
    lines.push(`## ${marketplace.marketplace}`, '', '| Referência | Direcionamento | Recebidos | Válidos | Trend Proxy | Oportunidade | Diversidade | Score Final |', '|---|---|---:|---:|---:|---:|---:|---:|');
    for (const ref of marketplace.references) lines.push(`| ${String(ref.id).replace(/\|/g, '/')} | ${String(ref.direction || ref.type).replace(/\|/g, '/')} | ${ref.received || 0} | ${ref.valid || 0} | ${ref.trendConversionProxy ?? 'ausente'} | ${ref.commercialOpportunityScore ?? 'ausente'} | ${ref.diversityAttractivenessScore ?? 'ausente'} | ${ref.finalDiscoveryScore ?? 'ausente'} |`);
    lines.push('', 'Top 10:', '', '| Produto | Categoria | Referência | Preço | Desconto | Cupom | Comissão | Sinais de tendência | Score |', '|---|---|---|---:|---:|---|---:|---|---:|');
    for (const p of marketplace.top10) lines.push(`| ${String(p.title).replace(/\|/g, '/')} | ${p.category || 'ausente'} | ${String(p.reference).replace(/\|/g, '/')} | ${p.price ?? 'ausente'} | ${p.discountPercent != null ? `${p.discountPercent}% real` : 'ausente'} | ${p.coupon || 'ausente'} | ${p.commission != null ? `${p.commission}%` : 'ausente'} | ${p.trendSignals.signals.join('; ') || 'ausente'} | ${p.finalDiscoveryScore} |`);
    if (marketplace.errors.length) lines.push('', `Erros: ${JSON.stringify(marketplace.errors)}`);
    if (marketplace.limitations.length) lines.push('', `Limitações: ${marketplace.limitations.join(' ')}`);
    lines.push('');
  }
  lines.push('## Diversidade controlada', '', '```json', JSON.stringify(report.diversityComparison, null, 2), '```', '', '## Conclusões', '', '```json', JSON.stringify(report.conclusions, null, 2), '```', '');
  return redact(lines.join('\n'));
}

function selfTest() {
  assert.equal(number(null), null);
  assert.equal(finalScore({ trendConversionProxy: 100, commercialOpportunityScore: 50, diversityAttractivenessScore: 0 }), 65);
  assert.equal(realDiscount(80, 100, null), 20);
  const sample = [
    { title: 'A', category: 'X', brand: 'B', seller: 'S', finalDiscoveryScore: 90 },
    { title: 'B', category: 'X', brand: 'B', seller: 'S', finalDiscoveryScore: 80 },
    { title: 'C', category: 'X', brand: 'B', seller: 'S', finalDiscoveryScore: 70 }
  ];
  assert.equal(selectDiverse(sample).length, 2);
}

async function main() {
  const envBefore = hashFile(ENV_FILE), historyBefore = hashFile(HISTORY_FILE);
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  require('tsx/cjs');
  const oracle = require(path.join(ROOT, 'scripts/oracle-scraper.cjs'));
  const scraper = require(path.join(ROOT, 'src/lib/affiliates/scraper.ts'));
  const discoveryConfig = require(path.join(ROOT, 'src/lib/offers/discovery-config.ts'));
  const runners = [() => shopee(oracle), () => mercadoLivre(oracle), () => amazon(oracle, scraper, discoveryConfig), () => netshoes(oracle)];
  const marketplaces = [];
  for (const runner of runners) {
    try { marketplaces.push(summarizeMarketplace(await runner())); }
    catch (error) { marketplaces.push({ marketplace: 'falha isolada', references: [], products: [], top10: [], errors: [{ error: redact(error.message) }], limitations: [] }); }
  }
  const all = marketplaces.flatMap(m => m.products || []);
  const before = [...all].sort((a, b) => b.finalDiscoveryScore - a.finalDiscoveryScore).slice(0, 20);
  const after = selectDiverse(all, 20);
  const report = {
    executedAt: new Date().toISOString(), dataRealOnly: true, llmCalled: false, supabaseWritten: false, published: false,
    envLoaded: fs.existsSync(ENV_FILE), envPreserved: envBefore === hashFile(ENV_FILE), historyPreserved: historyBefore === hashFile(HISTORY_FILE),
    marketplaces, top10Overall: [...all].sort((a, b) => b.finalDiscoveryScore - a.finalDiscoveryScore).slice(0, 10),
    diversityComparison: { before: selectionMetrics(before), after: selectionMetrics(after), selectedAfter: after.map(p => ({ marketplace: p.marketplace, title: p.title, score: p.finalDiscoveryScore })) },
    conclusions: conclusions(marketplaces)
  };
  fs.writeFileSync(JSON_REPORT, redact(JSON.stringify(report, null, 2)) + '\n');
  fs.writeFileSync(MD_REPORT, markdown(report) + '\n');
  console.log('Relatórios: reports/discovery-quality-test.json, reports/discovery-quality-test.md');
}

if (process.argv.includes('--self-test')) selfTest();
else main().catch(error => { console.error(`Falha: ${redact(error.message)}`); process.exitCode = 1; });
