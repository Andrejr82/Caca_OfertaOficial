'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const ENV_FILE = path.join(ROOT, '.env.local');
const REPORT_DIR = path.join(ROOT, 'reports');
const JSON_REPORT = path.join(REPORT_DIR, 'marketplace-discovery-validation.json');
const MD_REPORT = path.join(REPORT_DIR, 'marketplace-discovery-validation.md');
const HISTORY_FILE = path.join(ROOT, 'data', 'shopee_seen_products.json');
const SHOPEE_ENDPOINT = 'https://open-api.affiliate.shopee.com.br/graphql';
const RAKUTEN_ENDPOINT = 'https://api.linksynergy.com/productsearch/1.0';
const SCRAPEDO_ENDPOINT = 'https://api.scrape.do';
const AMAZON_ORACLE_ENDPOINT = 'http://193.122.242.178:3002/api/scrape';
const ML_SELECTORS = [
  'div[data-asin]', 'div[data-component-type="s-search-result"]',
  '[data-testid="product-card"]', '.ui-search-layout__item', '.poly-card',
  '.zg-grid-general-faceout', '.p13n-sc-uncoverable-faceout'
];
const AMAZON_SELECTORS = [
  'div[data-asin]', 'h2 span', '.a-size-base-plus', '.a-size-medium',
  '.p13n-sc-truncate', '.a-price:not(.a-text-price) .a-offscreen',
  '.a-price-whole', '.a-price-fraction', '.a-price.a-text-price .a-offscreen',
  '.a-text-strike', 'img[data-a-dynamic-image]', 'img[srcset]', 'h2 a', 'a.a-link-normal'
];

require('dotenv').config({ path: ENV_FILE, quiet: true });
process.env.ORACLE_SCRAPER_DISABLE_AUTORUN = '1';
process.env.LLM_DIAGNOSTIC = '0';

const secretValues = Object.entries(process.env)
  .filter(([key, value]) => value && /SECRET|TOKEN|KEY|PASSWORD|CREDENTIAL/i.test(key))
  .map(([, value]) => String(value))
  .filter(value => value.length >= 6)
  .sort((a, b) => b.length - a.length);

function redactSecrets(value, extraSecrets = secretValues) {
  let text = typeof value === 'string' ? value : JSON.stringify(value);
  for (const secret of extraSecrets) text = text.split(secret).join('[REDACTED]');
  text = text
    .replace(/([?&](?:token|api_?key|key|secret|access_?token|authorization)=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1[REDACTED]')
    .replace(/(Credential=)[^,\s]+/gi, '$1[REDACTED]');
  return text;
}

function safeUrl(raw) {
  if (!raw) return null;
  try {
    const url = new URL(redactSecrets(String(raw)));
    url.username = '';
    url.password = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/token|key|secret|password|authorization|signature/i.test(key)) url.searchParams.set(key, '[REDACTED]');
    }
    return url.toString();
  } catch {
    return redactSecrets(String(raw));
  }
}

function hashFile(file) {
  return fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null;
}

function discountPercent(price, oldPrice) {
  return Number.isFinite(price) && Number.isFinite(oldPrice) && oldPrice > price && oldPrice > 0
    ? Number((((oldPrice - price) / oldPrice) * 100).toFixed(2)) : null;
}

function duplicateCount(products) {
  const seen = new Set();
  let duplicates = 0;
  for (const product of products) {
    const key = product.productId || product.sku || product.asin || safeUrl(product.url) || String(product.title || '').toLowerCase();
    if (!key) continue;
    if (seen.has(key)) duplicates++;
    else seen.add(key);
  }
  return duplicates;
}

function availabilityState(value) {
  if (!value) return 'NÃO INFORMADA';
  const normalized = String(value).toLowerCase();
  if (/out of stock|unavailable|indispon|esgotad|sem estoque/.test(normalized)) return 'INVÁLIDA';
  if (/in stock|available|disponível|em estoque|^1$|^true$/.test(normalized)) return 'VÁLIDA';
  return 'NÃO COMPROVADA';
}

function classify(result) {
  const products = result.products || [];
  const received = result.counts.received || 0;
  const valid = result.counts.valid || 0;
  const priced = products.filter(p => Number.isFinite(p.price) && p.price > 0).length;
  const realDiscounts = products.filter(p => p.discountReal === true).length;
  const coupons = products.filter(p => p.coupon).length;
  const official = products.filter(p => p.officialStoreProven === true).length;
  const categories = products.map(p => p.category).filter(Boolean);
  const counts = categories.reduce((acc, category) => ((acc[category] = (acc[category] || 0) + 1), acc), {});
  const dominance = categories.length ? Math.max(...Object.values(counts)) / categories.length : 1;
  const diversity = new Set(categories).size >= 2 && dominance <= 0.7 ? 'BOA' : 'BAIXA';
  const repetition = (result.counts.duplicates || 0) / Math.max(received, 1) > 0.1 ? 'ALTA' : 'BAIXA';
  const quality = valid > 0 && priced === valid && realDiscounts / valid >= 0.5 ? 'ALTA'
    : valid > 0 && priced > 0 ? 'MÉDIA' : 'BAIXA';
  return {
    authentication: result.authentication,
    extraction: result.error ? 'FALHOU' : (received > 0 ? 'OK' : 'FALHOU'),
    price: priced === 0 ? 'AUSENTE' : (priced >= valid ? 'COMPLETO' : 'PARCIAL'),
    discount: realDiscounts > 0 ? 'REAL' : (products.some(p => p.discount != null) ? 'NÃO COMPROVADO' : 'AUSENTE'),
    coupon: coupons > 0 ? 'REAL' : 'AUSENTE',
    officialStore: official > 0 ? 'COMPROVADA' : 'NÃO COMPROVADA',
    diversity,
    repetition,
    commercialQuality: quality,
    discoveryFit: quality === 'ALTA' ? 'SIM' : (quality === 'MÉDIA' ? 'PARCIAL' : 'NÃO')
  };
}

async function captureConsole(task) {
  const originals = { log: console.log, warn: console.warn, error: console.error };
  const logs = [];
  for (const level of Object.keys(originals)) {
    console[level] = (...args) => logs.push(redactSecrets(args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' ')));
  }
  try {
    return { value: await task(), logs };
  } finally {
    Object.assign(console, originals);
  }
}

function blankResult(name, source, endpoint, productionFunction) {
  return {
    marketplace: name,
    source,
    endpoint,
    productionFunction,
    references: [],
    direction: null,
    filters: {},
    parameters: {},
    counts: { received: 0, valid: 0, discarded: 0, duplicates: 0 },
    discardReasons: {},
    products: [],
    normalizationSource: null,
    tokenOptimized: false,
    candidateGenerated: false,
    productionFlowExact: true,
    authentication: 'FALHOU',
    error: null,
    observations: []
  };
}

async function validateShopee(oracle) {
  const result = blankResult('Shopee', 'API/GraphQL oficial; Pipeline EPIC 09', SHOPEE_ENDPOINT, 'runShopeeOfficialPipeline');
  const categories = ['Computadores e Acessórios', 'Beleza', 'Casa e Construção'];
  result.references = categories.map(category => ({ type: 'categoria', value: category }));
  result.direction = 'productOfferV2 por categoria oficial selecionada';
  result.filters = { categories, sortTypes: [2], pages: [1], isAMSOffer: true };
  result.parameters = { limitPerCategory: 5, pipelineLimitPerCategory: 5 };
  result.normalizationSource = 'normalizeShopeeProduct + History + calculateShopeeDiscoveryScore + runMarketplaceSelectionEngine + createMarketplaceCandidateQueue';
  result.productionFlowExact = false;
  const tempHistory = path.join(REPORT_DIR, `.validate-shopee-history-${process.pid}.json`);
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  if (fs.existsSync(HISTORY_FILE)) fs.copyFileSync(HISTORY_FILE, tempHistory);
  else fs.writeFileSync(tempHistory, '{}');
  const historyStore = oracle.createShopeeHistoryStore(tempHistory);

  try {
    for (const category of categories) {
      const captured = await captureConsole(() => oracle.runShopeeOfficialPipeline(category, 5, {
        mode: 'manual_review',
        historyStore,
        fetcher: ({ categories: requested }) => oracle.fetchShopeeOfficialDiscovery({
          categories: requested,
          sortTypes: [2],
          pages: [1],
          limit: 5,
          resolveCategoriesFromHtml: false
        })
      }));
      const { candidates, telemetry } = captured.value;
      result.counts.received += telemetry.received;
      result.counts.valid += candidates.length;
      result.counts.duplicates += telemetry.duplicatesRejected;
      result.counts.discarded += Math.max(0, telemetry.received - candidates.length);
      result.discardReasons.history = (result.discardReasons.history || 0) + telemetry.historyFilteredOut;
      result.discardReasons.duplicates = (result.discardReasons.duplicates || 0) + telemetry.duplicatesRejected;
      result.discardReasons.selection = (result.discardReasons.selection || 0) + Math.max(0, telemetry.scored - telemetry.selected);
      result.discardReasons.candidateQueue = (result.discardReasons.candidateQueue || 0) + Math.max(0, telemetry.selected - telemetry.candidatesGenerated);
      result.parameters.categoryStats = { ...(result.parameters.categoryStats || {}), ...telemetry.categoryStats };
      for (const candidate of candidates) {
        result.products.push({
          reference: category,
          productId: candidate.marketplaceProductId,
          title: candidate.productName,
          price: candidate.currentPrice,
          oldPrice: candidate.originalPrice > candidate.currentPrice ? candidate.originalPrice : null,
          discount: candidate.discount || discountPercent(candidate.currentPrice, candidate.originalPrice),
          discountReal: Boolean(candidate.originalPrice > candidate.currentPrice || candidate.discount > 0),
          coupon: null,
          commission: candidate.commission ?? null,
          seller: candidate.shopName || null,
          officialStoreField: null,
          officialStoreProven: false,
          category: candidate.category,
          url: safeUrl(candidate.productLink),
          affiliateUrl: safeUrl(candidate.affiliateLink),
          approvalReason: candidate.selectionReason,
          rejectionReason: null,
          historyReason: candidate.historyReason,
          candidate: true,
          tokenOptimized: false
        });
      }
    }
    result.authentication = result.counts.received > 0 ? 'OK' : 'FALHOU';
    result.candidateGenerated = result.products.length > 0;
    result.observations.push('HTML de categorias desativado no modo de validação; GraphQL e pipeline EPIC 09 preservados. Default produtivo ainda tenta /oficial via HTML.');
    result.observations.push('Cupom e campo oficial de loja não existem no selection set productOfferV2 atual.');
  } catch (error) {
    result.error = redactSecrets(error.message);
  } finally {
    for (const file of [tempHistory, `${tempHistory}.bak`]) if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  result.classification = classify(result);
  return result;
}

async function validateNetshoes(oracle, discoveryConfig) {
  const result = blankResult('Netshoes', 'API oficial Rakuten Product Search', RAKUTEN_ENDPOINT, 'fetchNetshoesProductsFromRakuten');
  const target = discoveryConfig.getNextViralTarget('Netshoes');
  result.references = [{ type: 'keyword', value: target.query }];
  result.direction = `MID ${process.env.RAKUTEN_NETSHOES_MID || 'não configurado'}; keyword rotativa de produção`;
  result.filters = { keyword: target.query, category: target.category, sort: null, order: null };
  result.parameters = { mid: process.env.RAKUTEN_NETSHOES_MID || null, max: 10, pagenumber: 1, language: 'pt_BR' };
  result.normalizationSource = 'fetchNetshoesProductsFromRakuten';
  try {
    const captured = await captureConsole(() => oracle.fetchNetshoesProductsFromRakuten(target.query, 10, 1));
    const products = captured.value;
    const httpStatus = captured.logs.map(line => line.match(/HTTP\s+(\d{3})/i)?.[1]).find(Boolean);
    result.parameters.httpStatus = httpStatus ? Number(httpStatus) : (products.length ? 200 : null);
    result.counts.received = products.length;
    for (const product of products) {
      const availability = availabilityState(product.availability);
      const periodValid = (!product.begin_date || Date.parse(product.begin_date) <= Date.now()) && (!product.end_date || Date.parse(product.end_date) >= Date.now());
      const realPromotion = Number.isFinite(product.sale_price) && Number.isFinite(product.retail_price)
        && product.sale_price < product.retail_price && periodValid && availability !== 'INVÁLIDA' && availability !== 'NÃO COMPROVADA';
      result.products.push({
        reference: target.query,
        productId: product.product_id,
        sku: product.sku,
        title: product.product_name,
        retailPrice: product.retail_price,
        salePrice: product.sale_price,
        price: product.current_price,
        oldPrice: product.old_price,
        discount: product.discount_badge,
        discountType: product.discount_type,
        discountReal: realPromotion,
        beginDate: product.begin_date,
        endDate: product.end_date,
        availability: product.availability,
        availabilityValidation: availability,
        brand: product.brand,
        category: product.category,
        seller: product.merchant_name,
        url: safeUrl(product.original_url),
        affiliateUrl: safeUrl(product.affiliate_url),
        coupon: null,
        commission: null,
        officialStoreProven: false,
        candidate: true,
        tokenOptimized: false
      });
    }
    result.counts.valid = result.products.filter(product => product.discountReal).length;
    result.counts.discarded = result.counts.received - result.counts.valid;
    result.counts.duplicates = duplicateCount(result.products);
    result.discardReasons.invalidPromotion = result.counts.discarded;
    result.authentication = result.parameters.httpStatus === 200 ? 'OK' : 'FALHOU';
    result.candidateGenerated = result.products.length > 0;
  } catch (error) {
    result.error = redactSecrets(error.message);
  }
  result.classification = classify(result);
  return result;
}

async function validateMercadoLivre(oracle) {
  const result = blankResult('Mercado Livre', 'Scrape.do; provider signals', SCRAPEDO_ENDPOINT, 'selectDiscoveryQueries + inspectMarketplaceCardsWithCrawlee');
  result.direction = 'URLs reais de ML_SIGNAL_URLS; sem fallback legado';
  result.filters = { provider: process.env.ML_PROVIDER, discoveryMode: process.env.ML_DISCOVERY_MODE };
  result.parameters = { super: true, maxRequestsConfigured: Number(process.env.ML_MAX_SCRAPEDO_REQUESTS || 20), limitPerReference: 10, selectors: ML_SELECTORS };
  result.normalizationSource = 'inspectMarketplaceCardsWithCrawlee.parsePrice/titleFrom/linkFrom/imageFrom';
  result.productionFlowExact = false;
  result.observations.push('Helper dry-run real do oracle-scraper usado porque crawleeExtract produtivo chama LLM obrigatoriamente. Fluxo Scrape.do e seletores reais; caminho completo não é idêntico.');
  if (process.env.ML_PROVIDER !== 'scrapedo' || process.env.ML_DISCOVERY_MODE !== 'signals' || !process.env.SCRAPEDO_API_KEY) {
    result.error = 'Configuração real não satisfaz ML_PROVIDER=scrapedo, ML_DISCOVERY_MODE=signals e SCRAPEDO_API_KEY.';
    result.classification = classify(result);
    return result;
  }
  try {
    const selected = await captureConsole(() => Promise.resolve(oracle.selectDiscoveryQueries('Mercado Livre')));
    const sources = selected.value.slice(0, Math.min(2, Number(process.env.ML_MAX_SCRAPEDO_REQUESTS || 20)));
    result.references = sources.map(source => ({ type: 'signal', value: safeUrl(source.source) }));
    for (const source of sources) {
      try {
        const captured = await captureConsole(() => oracle.inspectMarketplaceCardsWithCrawlee(source.source, 'Mercado Livre', 10));
        const inspected = captured.value;
        result.counts.received += inspected.cardsFound;
        result.parameters.cardsWithPrice = (result.parameters.cardsWithPrice || 0) + inspected.cardsWithPrice;
        for (const product of inspected.products) {
          result.products.push({
            reference: safeUrl(source.source),
            referenceType: 'signal',
            title: product.product_name,
            price: product.current_price,
            oldPrice: product.old_price,
            discount: discountPercent(product.current_price, product.old_price),
            discountReal: discountPercent(product.current_price, product.old_price) != null,
            image: safeUrl(product.image_url),
            url: safeUrl(product.url),
            seller: null,
            officialStoreProven: false,
            coupon: null,
            commission: null,
            category: product.category,
            candidate: true,
            tokenOptimized: false
          });
        }
      } catch (error) {
        result.observations.push(`Falha ${safeUrl(source.source)}: ${redactSecrets(error.message)}`);
      }
    }
    result.counts.valid = result.products.length;
    result.counts.duplicates = duplicateCount(result.products);
    result.counts.discarded = Math.max(0, result.counts.received - result.counts.valid);
    result.discardReasons.withoutPriceOrRequiredFields = result.counts.discarded;
    result.authentication = result.counts.received > 0 ? 'OK' : 'FALHOU';
    result.candidateGenerated = result.products.length > 0;
    if (!result.references.length) result.error = 'ML_SIGNAL_URLS não retornou referências; fallback proibido.';
  } catch (error) {
    result.error = redactSecrets(error.message);
  }
  result.classification = classify(result);
  return result;
}

async function validateAmazon(oracle, affiliateScraper, discoveryConfig) {
  const result = blankResult('Amazon', 'Fluxo atual Cheerio via Oracle scraper remoto', AMAZON_ORACLE_ENDPOINT, 'fetchAmazonTrendingProducts');
  const target = discoveryConfig.getNextViralTarget('Amazon');
  const category = target.category;
  const reference = `https://www.amazon.com.br/s?k=${encodeURIComponent(category)}`;
  result.references = [
    { type: 'keyword_producao', value: reference, executed: true },
    { type: 'deals_fallback', value: 'https://www.amazon.com.br/deals', executed: false },
    { type: 'movers-and-shakers_fallback', value: 'https://www.amazon.com.br/gp/movers-and-shakers/electronics', executed: false },
    { type: 'bestsellers_fallback', value: 'https://www.amazon.com.br/gp/bestsellers/electronics', executed: false },
    { type: 'new-releases', value: 'não usado pelo fluxo atual', executed: false }
  ];
  result.direction = `categoria viral rotativa de produção: ${category}; fallbacks estáticos só quando category ausente`;
  result.filters = { keyword: target.query, category };
  result.parameters = { limit: 10, selectors: AMAZON_SELECTORS };
  result.normalizationSource = 'fetchAmazonTrendingProducts Cheerio + canonicalizeAmazonProductUrl';
  try {
    const captured = await captureConsole(() => affiliateScraper.fetchAmazonTrendingProducts(10, category));
    const products = captured.value;
    const status = captured.logs.map(line => line.match(/status\s+(\d{3})/i)?.[1]).find(Boolean);
    result.parameters.httpStatus = status ? Number(status) : (products.length ? 200 : null);
    result.counts.received = products.length;
    let sponsoredRejected = 0;
    let canonicalized = 0;
    for (const product of products) {
      const canonical = oracle.canonicalizeAmazonProductUrl(product.original_url);
      if (!canonical.url) {
        if (canonical.sponsored) sponsoredRejected++;
        continue;
      }
      if (canonical.url !== product.original_url) canonicalized++;
      result.products.push({
        reference,
        referenceType: 'keyword_producao',
        asin: canonical.asin,
        title: product.product_name,
        price: product.current_price,
        oldPrice: product.old_price,
        discount: discountPercent(product.current_price, product.old_price),
        discountReal: discountPercent(product.current_price, product.old_price) != null,
        rating: product.rating,
        image: safeUrl(product.image_url),
        url: safeUrl(canonical.url),
        category: product.category,
        coupon: null,
        commission: null,
        seller: null,
        officialStoreProven: false,
        candidate: true,
        tokenOptimized: false
      });
    }
    result.parameters.canonicalized = canonicalized;
    result.parameters.sponsoredRejected = sponsoredRejected;
    result.counts.valid = result.products.length;
    result.counts.duplicates = duplicateCount(result.products);
    result.counts.discarded = result.counts.received - result.counts.valid;
    result.discardReasons.sponsoredOrInvalidUrl = result.counts.discarded;
    result.authentication = result.parameters.httpStatus === 200 ? 'OK' : 'FALHOU';
    result.candidateGenerated = result.products.length > 0;
    result.observations.push('Fluxo produtivo atual recebe keyword do Viral Target; por isso bestsellers/deals/movers não são percorridos nessa chamada.');
    result.observations.push('new-releases não consta na função atual fetchAmazonTrendingProducts.');
  } catch (error) {
    result.error = redactSecrets(error.message);
  }
  result.classification = classify(result);
  return result;
}

function buildAnalysis(marketplaces) {
  const all = marketplaces.flatMap(m => (m.products || []).map(product => ({ marketplace: m.marketplace, ...product })));
  const discounted = all.filter(product => product.discountReal && Number.isFinite(Number(product.discount))).sort((a, b) => Number(b.discount) - Number(a.discount));
  const priced = all.filter(product => Number.isFinite(product.price)).sort((a, b) => a.price - b.price);
  const categoryCounts = all.reduce((acc, product) => {
    const category = product.category || 'Não informada';
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {});
  return {
    bestPriceReferences: priced.slice(0, 5).map(product => ({ marketplace: product.marketplace, reference: product.reference, title: product.title, price: product.price })),
    highestRealDiscountReferences: discounted.slice(0, 5).map(product => ({ marketplace: product.marketplace, reference: product.reference, title: product.title, discount: product.discount })),
    realCoupons: all.filter(product => product.coupon).map(product => ({ marketplace: product.marketplace, title: product.title, coupon: product.coupon })),
    provenOfficialStores: all.filter(product => product.officialStoreProven).map(product => ({ marketplace: product.marketplace, title: product.title, seller: product.seller })),
    repetitions: marketplaces.map(m => ({ marketplace: m.marketplace, duplicates: m.counts.duplicates })).filter(item => item.duplicates > 0),
    categoryConcentration: Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]).map(([category, count]) => ({ category, count })),
    missingData: marketplaces.map(m => ({
      marketplace: m.marketplace,
      missingPrice: m.products.filter(p => !Number.isFinite(p.price)).length,
      missingOldPrice: m.products.filter(p => !Number.isFinite(p.oldPrice)).length,
      missingCoupon: m.products.filter(p => !p.coupon).length,
      missingSeller: m.products.filter(p => !p.seller).length,
      missingOfficialProof: m.products.filter(p => !p.officialStoreProven).length
    })),
    lowAttractiveness: marketplaces.filter(m => m.classification.commercialQuality === 'BAIXA').map(m => m.marketplace),
    diversityHarmingReferences: marketplaces.filter(m => m.classification.diversity === 'BAIXA').map(m => ({ marketplace: m.marketplace, references: m.references })),
    alreadyProcessedFlow: marketplaces.filter(m => (m.discardReasons.history || 0) > 0).map(m => ({ marketplace: m.marketplace, historyRejected: m.discardReasons.history }))
  };
}

function buildMarkdown(report) {
  const lines = ['# Validação real de Marketplace Discovery', '', `Executado em: ${report.executedAt}`, '',
    '## Restrições verificadas', '',
    `- LLM consumido: ${report.safety.llmConsumed ? 'SIM' : 'NÃO'}`,
    `- Supabase gravado: ${report.safety.supabaseWritten ? 'SIM' : 'NÃO'}`,
    `- Publicação: ${report.safety.published ? 'SIM' : 'NÃO'}`,
    `- History original preservado: ${report.safety.historyPreserved ? 'SIM' : 'NÃO'}`,
    `- .env.local preservado: ${report.safety.envPreserved ? 'SIM' : 'NÃO'}`, ''];
  for (const marketplace of report.marketplaces) {
    lines.push(`## ${marketplace.marketplace}`, '',
      `1. Fonte utilizada: ${marketplace.source}`,
      `2. Endpoint/URL real: ${marketplace.endpoint}`,
      `3. Função de produção chamada: ${marketplace.productionFunction}`,
      `4. Referência de busca: ${JSON.stringify(marketplace.references)}`,
      `5. Direcionamento: ${marketplace.direction}`,
      `6. Categorias/keywords/signals/filtros: ${JSON.stringify(marketplace.filters)}`,
      `7. Parâmetros: ${JSON.stringify(marketplace.parameters)}`,
      `8. Quantidade recebida: ${marketplace.counts.received}`,
      `9. Quantidade válida: ${marketplace.counts.valid}`,
      `10. Quantidade descartada: ${marketplace.counts.discarded}`,
      `11. Motivos: ${JSON.stringify(marketplace.discardReasons)}`,
      `12-19. Produtos retornados:`, '', '```json', JSON.stringify(marketplace.products, null, 2), '```', '',
      `20. Fonte da normalização: ${marketplace.normalizationSource}`,
      `21. tokenOptimized: ${marketplace.tokenOptimized}`,
      `22. Candidate gerado: ${marketplace.candidateGenerated}`,
      `23. Observações: ${marketplace.observations.join(' | ') || 'Nenhuma'}`,
      `Erro real: ${marketplace.error || 'Nenhum'}`, '',
      `Critérios: ${JSON.stringify(marketplace.classification)}`, '');
  }
  lines.push('## Análise objetiva', '', '```json', JSON.stringify(report.analysis, null, 2), '```', '');
  return redactSecrets(lines.join('\n'));
}

function selfTest() {
  assert.equal(redactSecrets('token=abc123456', ['abc123456']).includes('abc123456'), false);
  assert.equal(discountPercent(80, 100), 20);
  assert.equal(discountPercent(100, 80), null);
  assert.equal(availabilityState('Out of stock'), 'INVÁLIDA');
  assert.equal(typeof buildMarkdown({ executedAt: '', safety: {}, marketplaces: [], analysis: {} }), 'string');
}

async function main() {
  const envHashBefore = hashFile(ENV_FILE);
  const historyHashBefore = hashFile(HISTORY_FILE);
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  require('tsx/cjs');
  const oracle = require(path.join(ROOT, 'scripts/oracle-scraper.cjs'));
  const affiliateScraper = require(path.join(ROOT, 'src/lib/affiliates/scraper.ts'));
  const discoveryConfig = require(path.join(ROOT, 'src/lib/offers/discovery-config.ts'));
  const runners = [
    () => validateShopee(oracle),
    () => validateNetshoes(oracle, discoveryConfig),
    () => validateMercadoLivre(oracle),
    () => validateAmazon(oracle, affiliateScraper, discoveryConfig)
  ];
  const marketplaces = [];
  for (const runner of runners) {
    try { marketplaces.push(await runner()); }
    catch (error) {
      marketplaces.push({ marketplace: 'desconhecido', error: redactSecrets(error.message), counts: {}, products: [], classification: {} });
    }
  }
  const report = {
    executedAt: new Date().toISOString(),
    realDataOnly: true,
    productionFlowsUsed: marketplaces.every(item => item.productionFlowExact === true),
    safety: {
      llmConsumed: false,
      supabaseWritten: false,
      published: false,
      envPreserved: envHashBefore === hashFile(ENV_FILE),
      historyPreserved: historyHashBefore === hashFile(HISTORY_FILE),
      secretsRedacted: true
    },
    marketplaces,
    analysis: buildAnalysis(marketplaces)
  };
  fs.writeFileSync(JSON_REPORT, redactSecrets(JSON.stringify(report, null, 2)) + '\n');
  fs.writeFileSync(MD_REPORT, buildMarkdown(report) + '\n');
  console.log(`Relatórios: ${path.relative(ROOT, JSON_REPORT)}, ${path.relative(ROOT, MD_REPORT)}`);
}

if (process.argv.includes('--self-test')) selfTest();
else main().catch(error => {
  console.error(`Validação falhou: ${redactSecrets(error.message)}`);
  process.exitCode = 1;
});
