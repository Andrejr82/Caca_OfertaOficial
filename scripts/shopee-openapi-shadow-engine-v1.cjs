'use strict';

const crypto = require('node:crypto');
const GRAPHQL_CONTRACTS = require('./contracts/shopee-openapi-v1/index.cjs');
const { evaluateShopeeOracleCandidate } = require('./shopee-ranking-v1-oracle-bridge.cjs');
const { getShopeeV1Flags } = require('./shopee-v1-flags.cjs');
const {
  SHOPEE_PRODUCTCATIDS_MAP_V1,
  FAMILY_SEMANTIC_DICTIONARY,
  SCENARIO_TO_NICHE_MAP,
  resolveLeafCategory,
  isProductAdherent,
  isExplicitlyBlockedFamily,
} = require('./shopee-productcatids-map-v1.cjs');

function queryPlan(keywords, categoryIds, overrides = {}) {
  return Object.freeze({ keywords, categoryIds, shopTypes: [1, 2, 4], sources: ['productOfferV2', 'DELTA', 'shopOfferV2', 'shopeeOfferV2'], limits: { productOfferV2PerQuery: 20, maxPagesPerQuery: 2, maxFeedRows: 50, shopOfferV2: 20, shopeeOfferV2: 20, ...overrides } });
}

const SCENARIO_CONTRACTS = Object.freeze({
  casa_cozinha_editorial: scenario(['casa','cozinha'], ['liquidificador','panela','cafeteira','air fryer','organizador','utensilio','jantar','cama','toalha','faqueiro'], ['pet','automotivo','celular','beleza'], ['kit generico'], [100010,100636]),
  organizacao_editorial: scenario(['organiz','casa','cozinha'], ['organizador','caixa','cesto','cabide','sapateira','lixeira','mop','varal'], ['pet','bebe','automotivo','industrial'], ['suporte'], [100010,100636]),
  ferramentas_editorial: scenario(['ferrament','oficina'], ['furadeira','parafusadeira','chave','alicate','serra','trena','maleta'], ['infantil','brinquedo','automotivo','cosmetico'], ['kit sem ferramenta'], [100636]),
  informatica_editorial: scenario(['informatic','computador','notebook','teclado','mouse','monitor','webcam','ssd','roteador','pc'], ['notebook','computador','teclado','mouse','monitor','webcam','ssd','roteador','impressora'], ['saude','pressao','arterial','smartwatch','pet','automotivo','capa'], ['smartwatch','monitor de saude'], [100644,100013], { negativeClasses: ['generic_accessory','weak_accessory','compatibility_only'] }),
  celulares_editorial: scenario(['celular','smartphone','iphone','galaxy','redmi','mobile'], ['smartphone','celular','iphone','galaxy','redmi'], ['notebook','monitor','cabo avulso','pelicula avulsa'], [], [100013]),
  beleza_editorial: scenario(['beleza','cabelo','capilar','maquiagem','perfume','skincare','hidratante','shampoo','secador','chapinha','serum'], ['cosmetico','mascara','cabelo','capilar','maquiagem','perfume','shampoo','secador','chapinha'], ['varal','centrifuga de salada','suporte de shampoo','cozinha','banheiro','lixeira','panela','liquidificador','pet','automotivo','monitor de pressao'], ['promessa terapeutica'], [100630,100001]),
  moda_editorial: scenario(['moda','roupa','vestuario','camiseta','camisa','calca','bermuda','tenis','sapato','bolsa','mochila','relogio','oculos'], ['roupa','camiseta','camisa','calca','bermuda','tenis','sapato','bolsa','mochila','relogio','oculos'], ['bebe','infantil','pet'], ['tamanho ausente'], [100009,100011,100012,100534], { negativeClasses: ['weak_accessory','generic_accessory'] }),
  esporte_editorial: scenario(['esporte','fitness','treino','academia','yoga','corrida'], ['tenis','legging','whey','creatina','tapete','halter','corda','faixa','luva'], ['pet','bebe','moda social','automotivo'], ['suplemento medicamentoso'], [100637,100001]),
  pet_editorial: scenario(['pet','cachorro','gato','animal'], ['racao','tapete higienico','cama pet','brinquedo pet','areia','coleira','transporte pet','shampoo pet'], ['bebe','humano','automotivo'], ['medicamento veterinario'], [100631]),
  tv_audio_editorial: scenario(['tv','audio','smart tv','soundbar','caixa de som','speaker','fone','headphone','earbuds','home theater','projetor','microfone','receiver','amplificador'], ['smart tv','televisao','tv','soundbar','caixa de som','speaker','home theater','fone bluetooth','fone','headphone','earbuds','projetor','microfone','receiver','amplificador'], ['pet','bebe'], ['acessorio sem aparelho'], [100535,100578,100013,100644], { negativeClasses: ['generic_accessory','compatibility_only','weak_accessory','computer_peripheral_in_tv_audio'] }),
  eletrodomesticos_editorial: scenario(['eletrodomestico','geladeira','refrigerador','freezer','fogao','cooktop','lavadora','ar condicionado'], ['geladeira','refrigerador','freezer','fogao','cooktop','micro ondas','maquina de lavar','lava e seca','lava loucas','ar condicionado'], ['pet','bebe'], ['grande porte fora do frete'], [100010], { negativeClasses: ['spare_part','replacement_part','generic_accessory'] }),
  moveis_editorial: scenario(['moveis','casa','quarto','sala','mesa','cadeira','armario','sofa'], ['sofa','guarda roupa','cama','colchao','mesa','escrivaninha','cadeira','rack','comoda'], ['pet','bebe','peca avulsa','capa isolada'], ['dimensoes ausentes'], [100636]),
  grandes_ofertas_editorial: scenario(['smartphone','notebook','tablet','smart tv','soundbar','air fryer','liquidificador','cafeteira','aspirador','geladeira','fogao','cooktop','maquina de lavar','furadeira','parafusadeira','cadeira de escritorio','sofa','armario'], ['smartphone','celular','notebook','tablet','smart tv','soundbar','air fryer','liquidificador','cafeteira','aspirador','geladeira','fogao','cooktop','maquina de lavar','furadeira','parafusadeira','cadeira de escritorio','sofa','armario'], ['usado','recondicionado','servico','cupom sem aprovacao'], [], [100013,100010,100644,100636], { negativeClasses: ['spare_part','replacement_part','generic_accessory','weak_accessory','compatibility_only','small_school_item'], minDiscount: 20, minSales: 50, minRating: 4.7, minCommission: 5, maxFamilyPerScenario: 30, maxShopPerScenario: 8 }),
});

const SCENARIO_QUERY_PLANS = Object.freeze({
  casa_cozinha_editorial: queryPlan(['liquidificador','air fryer','jogo de cama','faqueiro','panela elétrica'], [100010,100636]),
  organizacao_editorial: queryPlan(['organizador de cozinha','caixa organizadora','cesto organizador','cabide','lixeira'], [100010,100636]),
  ferramentas_editorial: queryPlan(['furadeira','parafusadeira','kit ferramentas','alicate','trena'], [100636]),
  informatica_editorial: queryPlan(['teclado','mouse','headset','monitor gamer','ssd','roteador'], [100644,100013]),
  celulares_editorial: queryPlan(['smartphone','celular','iphone','galaxy','redmi'], [100013]),
  beleza_editorial: queryPlan(['skincare','perfume','shampoo','escova secadora','maquiagem'], [100630,100001]),
  moda_editorial: queryPlan(['camiseta masculina','calça jeans','tênis casual','bolsa feminina','mochila'], [100009,100011,100012,100534]),
  esporte_editorial: queryPlan(['tênis de corrida','legging fitness','tapete de yoga','halter','corda de pular'], [100637,100001]),
  pet_editorial: queryPlan(['ração cachorro','cama pet','brinquedo pet','guia cachorro','bebedouro pet'], [100631]),
  tv_audio_editorial: queryPlan(['smart tv','soundbar','caixa de som bluetooth','fone bluetooth','headphone bluetooth','projetor portátil','home theater','microfone sem fio'], [100535,100578,100013,100644]),
  eletrodomesticos_editorial: queryPlan(['geladeira','fogão','cooktop','máquina de lavar','ar condicionado'], [100010]),
  moveis_editorial: queryPlan(['sofá','guarda roupa','cama','mesa de jantar','cadeira de escritório'], [100636]),
  grandes_ofertas_editorial: queryPlan(['smartphone','notebook','smart tv','air fryer','geladeira','máquina de lavar','furadeira','aspirador robô','cadeira escritório'], [100013,100010,100644,100636]),
});

function scenario(positiveDomain, requiredProductClass, negativeDomain, ambiguousTerms, allowedApiCategories, overrides = {}) {
  return Object.freeze({ positiveDomain, requiredProductClass, negativeDomain, ambiguousTerms, allowedApiCategories, blockedApiCategories: [], negativeClasses: [], minSales: 10, minRating: 4.5, minDiscount: 5, minCommission: 3, maxFamilyPerScenario: 20, maxShopPerScenario: 5, ...overrides });
}

function text(value) { return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function hasTerm(value, term) { const haystack = ` ${text(value)} `; const needle = ` ${text(term)} `; return Boolean(text(term)) && haystack.includes(needle); }
function anyTerm(value, terms) { return (terms || []).filter((term) => hasTerm(value, term)); }
const REQUIRED_PRODUCT_NON_IDENTITY_TERMS = Object.freeze([
  'suporte', 'base', 'nicho', 'prateleira', 'organizador', 'cabo', 'adaptador', 'case', 'enclosure', 'capa',
  'decoracao', 'decorativo', 'decorativa', 'estatua', 'luminaria',
]);
const COMPOSITE_PRODUCT_PREFIXES = /^(?:kit|conjunto|pack|combo)(?: de)?$/u;
function termPosition(value, term) {
  const haystack = ` ${text(value)} `;
  const needle = ` ${text(term)} `;
  const position = needle.trim() ? haystack.indexOf(needle) : -1;
  return position < 0 ? null : position;
}
function matchesRequiredProductIdentity(value, requiredProductClasses = []) {
  const title = text(value);
  const classPositions = (requiredProductClasses || [])
    .map((term) => ({ term, position: termPosition(title, term) }))
    .filter((match) => match.position !== null)
    .sort((left, right) => left.position - right.position || text(right.term).length - text(left.term).length);
  if (!classPositions.length) return false;

  const negativePositions = REQUIRED_PRODUCT_NON_IDENTITY_TERMS
    .map((term) => termPosition(title, term))
    .filter((position) => position !== null)
    .sort((left, right) => left - right);

  return classPositions.some(({ position }) => {
    const firstNegativePosition = negativePositions[0] ?? Number.POSITIVE_INFINITY;
    if (position > firstNegativePosition) return false;
    const prefix = title.slice(0, position).trim();
    if (!prefix) return true;
    if (COMPOSITE_PRODUCT_PREFIXES.test(prefix)) return true;
    if (/\b(?:de|para|por|com|compat(?:ivel|ibilidade)?|aplicacao)\s*$/u.test(prefix)) return false;
    return true;
  });
}
const NEGATIVE_CLASS_PATTERNS = Object.freeze({
  spare_part: ['chave t','peca de reposicao','peca avulsa','pecas de reposicao'],
  replacement_part: ['reposicao','refil','tampa de reposicao','resistencia para','borracha para','borrachas compativel'],
  generic_accessory: ['cabo generico','cabo usb','adaptador generico','suporte generico','suporte celular','suporte silicone','grelha cooktop','tripé de bastão','tripe de bastao','cartao de memoria','cartao sd','carregador','capinha','capa protetora','case para notebook','maleta para notebook','pelicula para','mesa dobravel para notebook','mesa dobravel notebook','mesa para notebook','protetor para cooktop','tapete protetor','kit borrachas'],
  weak_accessory: ['broche','broche para mochila','pin decorativo','adesivo para mochila','pingente para mochila'],
  compatibility_only: ['compativel com tv','compativel com televisao','para tv pc','para televisao somente'],
  small_school_item: ['caneta 3d','refil para caneta 3d','item escolar','material escolar'],
  computer_peripheral_in_tv_audio: ['teclado e mouse','kit teclado mouse','teclado mouse','teclado bluetooth','mouse bluetooth'],
});
function classifyNegativeClasses(value, contract = {}) {
  const haystack = text(value);
  return (contract.negativeClasses || []).filter((className) => (NEGATIVE_CLASS_PATTERNS[className] || []).some((term) => hasTerm(haystack, term)));
}
function number(value) { const parsed = Number.parseFloat(String(value ?? '').replace(',', '.')); return Number.isFinite(parsed) ? parsed : 0; }
function percent(value) { const parsed = number(value); return parsed > 0 && parsed <= 1 ? parsed * 100 : parsed; }

function normalizePriceIntegrity({ price, priceMin, priceMax, priceDiscountRate, officialOldPrice } = {}) {
  const min = number(priceMin);
  const max = number(priceMax);
  const simplePrice = number(price);
  const currentPrice = min > 0 ? min : max > 0 ? max : simplePrice;
  const priceAuthority = min > 0 ? 'priceMin' : max > 0 ? 'priceMax_fallback' : simplePrice > 0 ? 'price' : 'unresolved';
  const rangeAmbiguous = min > 0 && max > 0 && min !== max;
  const apiDiscount = percent(priceDiscountRate);
  const explicitOldPrice = number(officialOldPrice);
  let oldPrice = null;
  let discountPercent = null;
  let oldPriceAuthority = 'none';
  let discountAuthority = 'none';
  let safeForPublication = currentPrice > 0;

  if (explicitOldPrice > 0) {
    const computedDiscount = currentPrice > 0 && explicitOldPrice > currentPrice
      ? Math.round(((explicitOldPrice - currentPrice) / explicitOldPrice) * 100)
      : null;
    const contradictory = computedDiscount === null || (apiDiscount > 0 && Math.abs(computedDiscount - apiDiscount) > 2);
    if (contradictory) {
      safeForPublication = false;
    } else {
      oldPrice = explicitOldPrice;
      discountPercent = computedDiscount;
      oldPriceAuthority = 'officialOldPrice';
      discountAuthority = 'officialOldPrice';
    }
  }

  return { currentPrice, oldPrice, discountPercent, priceAuthority, oldPriceAuthority, discountAuthority, rangeAmbiguous, safeForPublication };
}

function normalizeCommission(fields = {}) {
  const entries = [['commissionRate', fields.commissionRate], ['shopeeCommissionRate', fields.shopeeCommissionRate], ['sellerCommissionRate', fields.sellerCommissionRate]]
    .map(([basis, value]) => ({ basis, value: percent(value) })).filter((entry) => entry.value > 0);
  if (entries.length === 0) return { commissionBasis: 'unresolved', commissionPercent: 0, commissionUnresolved: true };
  if (entries.length === 1) return { commissionBasis: entries[0].basis, commissionPercent: Number(entries[0].value.toFixed(4)), commissionUnresolved: false };
  const max = entries.sort((a, b) => b.value - a.value)[0];
  return { commissionBasis: 'max_safe_component', commissionPercent: Number(max.value.toFixed(4)), commissionUnresolved: true };
}

function categoryAllowed(product, contract) {
  const categories = (product.productCatIds || []).map(String);
  if (contract.blockedApiCategories.some((id) => categories.includes(String(id)))) return false;
  return contract.allowedApiCategories.length === 0 || contract.allowedApiCategories.some((id) => categories.includes(String(id)));
}

function evaluateIntent(product, contract) {
  const title = product.productName || product.title || '';
  const matchedPositiveDomain = anyTerm(title, contract.positiveDomain);
  const matchedRequiredProductClass = anyTerm(title, contract.requiredProductClass);
  const requiredProductIdentity = matchesRequiredProductIdentity(title, contract.requiredProductClass);
  const matchedNegativeDomain = anyTerm(title, contract.negativeDomain);
  const matchedAmbiguousTerms = anyTerm(title, contract.ambiguousTerms);
  const matchedNegativeClasses = classifyNegativeClasses(title, contract);
  const apiCategoryAllowed = categoryAllowed(product, contract);
  const reasons = [];
  if (!matchedPositiveDomain.length && !apiCategoryAllowed) reasons.push('positive_domain_missing');
  if (!matchedRequiredProductClass.length) reasons.push('required_product_class_missing');
  else if (!requiredProductIdentity) reasons.push('required_product_identity_missing');
  if (matchedNegativeDomain.length) reasons.push('negative_domain');
  if (matchedAmbiguousTerms.length) reasons.push('ambiguous_terms');
  if (matchedNegativeClasses.length) reasons.push('negative_class');
  if (!apiCategoryAllowed) reasons.push('api_category_blocked_or_missing');
  const commission = product.commissionPercent ?? normalizeCommission(product).commissionPercent;
  if (number(product.sales) < contract.minSales) reasons.push('sales_below_minimum');
  if (number(product.ratingStar ?? product.rating) < contract.minRating) reasons.push('rating_below_minimum');
  if (number(product.priceDiscountRate ?? product.discount) < contract.minDiscount) reasons.push('discount_below_minimum');
  if (commission < contract.minCommission) reasons.push('commission_below_minimum');
  return { eligible: reasons.length === 0, reasons, matchedPositiveDomain, matchedRequiredProductClass, requiredProductIdentity, matchedNegativeDomain, matchedAmbiguousTerms, matchedNegativeClasses };
}

function normalizeProductOffer(node = {}, context = {}) {
  const commission = normalizeCommission(node);
  const priceIntegrity = normalizePriceIntegrity({
    price: node.price,
    priceMin: node.priceMin,
    priceMax: node.priceMax,
    priceDiscountRate: node.priceDiscountRate ?? node.discount,
    officialOldPrice: context.officialOldPrice ?? node.officialOldPrice,
  });
  const price = priceIntegrity.currentPrice || number(node.price);
  const productLink = String(node.productLink || '').trim();
  const offerLink = String(node.offerLink || '').trim();
  const imageUrl = String(node.imageUrl || '').trim();
  const productName = String(node.productName || node.title || '').trim();
  const normalized = {
    source: context.source || 'productOfferV2', itemId: String(node.itemId || '').trim(), shopId: String(node.shopId || '').trim(), productName,
    productLink, offerLink, imageUrl, price, currentPrice: price, originalPrice: priceIntegrity.oldPrice,
    priceMin: number(node.priceMin), priceMax: number(node.priceMax), priceDiscountRate: number(node.priceDiscountRate ?? node.discount),
    priceRangeAmbiguous: priceIntegrity.rangeAmbiguous, priceAuthority: priceIntegrity.priceAuthority,
    oldPriceAuthority: priceIntegrity.oldPriceAuthority, discountAuthority: priceIntegrity.discountAuthority,
    safeForPublication: priceIntegrity.safeForPublication, ratingStar: number(node.ratingStar ?? node.rating), sales: number(node.sales),
    commissionRate: node.commissionRate, shopeeCommissionRate: node.shopeeCommissionRate, sellerCommissionRate: node.sellerCommissionRate, ...commission,
    shopType: Array.isArray(node.shopType) ? node.shopType.map(Number) : [], productCatIds: Array.isArray(node.productCatIds) ? node.productCatIds.map(String) : (context.productCatId ? [String(context.productCatId)] : []), updateType: context.updateType || node.updateType || null,
  };
  const technicalReasons = [];
  if (!/^\d+$/.test(normalized.itemId)) technicalReasons.push('itemId_required');
  if (!/^\d+$/.test(normalized.shopId)) technicalReasons.push('shopId_required');
  if (!normalized.productName) technicalReasons.push('productName_required');
  if (!productLink && !offerLink) technicalReasons.push('product_or_offer_link_required');
  if (!imageUrl) technicalReasons.push('image_required');
  if (!(price > 0)) technicalReasons.push('price_required');
  return { accepted: technicalReasons.length === 0, technicalReasons, product: normalized };
}

function familyKey(product) {
  const stop = new Set(['para','com','sem','de','da','do','das','dos','e','kit','novo','oferta','original','unissex','feminina','masculina','preta','preto','rosa','azul','branca','branco','verde','grande','pequena']);
  const tokens = text(product.productName).split(' ').filter((token) => token.length > 2 && !stop.has(token));
  return tokens.slice(0, 6).join(' ');
}

function dedupe(products) {
  const seen = new Map(); const duplicates = [];
  for (const product of products) {
    const key = `item:${product.itemId}`;
    const urlKey = product.productLink || product.offerLink ? `url:${text(product.productLink || product.offerLink)}` : null;
    const family = `family:${familyKey(product)}`;
    const duplicateOf = [key, urlKey, family].filter(Boolean).find((candidate) => seen.has(candidate));
    if (duplicateOf) { duplicates.push({ itemId: product.itemId, duplicateOf, familyKey: family.slice(7) }); continue; }
    [key, urlKey, family].filter(Boolean).forEach((candidate) => seen.set(candidate, product.itemId));
  }
  return { unique: products.filter((product) => !duplicates.some((duplicate) => duplicate.itemId === product.itemId)), duplicates };
}

function resolveCanonicalIntent(product, scenarioId, contract) {
  const title = text(product.productName);
  const scenarioKey = String(scenarioId || '').replace(/_editorial$/u, '').replace(/_/g, '-');
  const matchingClass = (contract.requiredProductClass || []).find((term) => title.includes(text(term)));
  return matchingClass || scenarioKey;
}

function evaluateCanonicalRanking(product, scenarioId, contract) {
  const intent = resolveCanonicalIntent(product, scenarioId, contract);
  return evaluateShopeeOracleCandidate({
    marketplace: 'Shopee', sourceItemId: product.itemId, title: product.productName,
    sourceUrl: product.offerLink || product.productLink, currentPrice: product.currentPrice,
    originalPrice: product.originalPrice, category: { id: product.productCatIds?.[0], name: scenarioId },
    marketplaceMetrics: {
      rating: product.ratingStar, sales: product.sales, shopId: product.shopId,
      shopType: product.shopType, commissionRate: product.commissionPercent,
    },
    intent,
  });
}

function processDeltaRows(rows = [], options = {}) {
  const maxRows = Math.max(0, Number(options.maxRows ?? 100)); const datafeedId = String(options.datafeedId || '').trim(); const limited = rows.slice(0, maxRows); const activeItems = []; const tombstones = []; const errors = [];
  for (const row of limited) {
    let columns = row.columns;
    if (typeof columns === 'string') { try { columns = JSON.parse(columns); } catch { errors.push({ updateType: row.updateType, reason: 'columns_invalid_json' }); continue; } }
    if (!columns) { errors.push({ updateType: row.updateType, reason: 'columns_missing' }); continue; }
    const normalizedColumns = normalizeFeedColumns(columns);
    if (!normalizedColumns.itemId) { errors.push({ updateType: row.updateType, reason: 'itemId_missing' }); continue; }
    const item = { ...normalizedColumns, updateType: String(row.updateType || columns.update_type || 'UNKNOWN'), datafeedId };
    if (item.updateType === 'DELETE') tombstones.push({ itemId: String(item.itemId), shopId: item.shopId == null ? null : String(item.shopId), updateType: 'DELETE', datafeedId });
    else if (['NEW','UPDATE'].includes(item.updateType)) activeItems.push(item);
    else errors.push({ itemId: String(item.itemId), updateType: item.updateType, reason: 'unknown_update_type' });
  }
  return { activeItems, tombstones, errors, metrics: { rowsRead: limited.length, rowsAvailable: rows.length, truncated: rows.length > limited.length, new: activeItems.filter((item) => item.updateType === 'NEW').length, updated: activeItems.filter((item) => item.updateType === 'UPDATE').length, deleted: tombstones.length } };
}

function normalizeFeedColumns(columns = {}) {
  const productLink = String(columns.product_link || '').trim();
  const shopIdFromLink = productLink.match(/\/product\/(\d+)\/(\d+)/i)?.[1] || '';
  return {
    rawColumns: columns,
    itemId: columns.itemId ?? columns.itemid,
    shopId: columns.shopId ?? columns.shopid ?? shopIdFromLink,
    productName: columns.productName ?? columns.title,
    productLink: columns.productLink ?? columns.product_link,
    offerLink: columns.offerLink ?? columns['product_short link'] ?? columns.product_short_link ?? columns.product_link,
    imageUrl: columns.imageUrl ?? columns.image_link,
    priceMin: columns.priceMin ?? columns.sale_price ?? columns.price,
    priceMax: columns.priceMax ?? columns.price,
    ratingStar: columns.ratingStar ?? columns.item_rating,
    priceDiscountRate: columns.priceDiscountRate ?? columns.discount_percentage,
    productCatIds: columns.productCatIds ?? [columns.global_catid1, columns.global_catid2].filter(Boolean),
  };
}

function auxiliaryNode(source, node) {
  return { source, requiresProductResolution: true, resolved: Boolean(node.resolvedProduct), offerLink: node.offerLink || null, imageUrl: node.imageUrl || null, commissionRate: node.commissionRate ?? null, raw: node, resolvedProduct: node.resolvedProduct || null };
}

async function runScenarioPlan(scenarioId, { request, signal, maxKeywords, maxCategories, maxConcurrentQueries = 3, sourceTimeoutMs = 25_000, includeDelta = true, includeAuxiliary = true, sharedSources = {}, env = process.env } = {}) {
  const plan = SCENARIO_QUERY_PLANS[scenarioId];
  if (!plan) throw new Error(`Plano Shopee ausente para ${scenarioId}`);
  if (typeof request !== 'function') throw new Error('runScenarioPlan requer request injetado');

  const flags = getShopeeV1Flags(env);
  const isCertifiedSearchEnabled = flags.productCatIdsSearch;
  const nicheName = SCENARIO_TO_NICHE_MAP[scenarioId];
  const nicheFamilies = nicheName ? SHOPEE_PRODUCTCATIDS_MAP_V1[nicheName] : null;

  const productOffers = [];
  const calls = [];
  const stopState = { reason: null, controllers: new Set() };
  const stopAll = (reason) => {
    stopState.reason ||= reason;
    for (const controller of stopState.controllers) controller.abort();
  };

  let productCatIdsTelemetry = null;
  let extractedBeforeOracleFilters = 0;
  let semanticAccepted = 0;
  let semanticRejected = 0;

  const callProduct = async (variables, sourcePlan, familyTerms = null) => {
    const pageSize = plan.limits.productOfferV2PerQuery;
    const maxPages = plan.limits.maxPagesPerQuery;
    const controller = new AbortController();
    stopState.controllers.add(controller);
    const requestSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    const timeoutId = setTimeout(() => controller.abort(), Math.max(1, Number(sourceTimeoutMs) || 25_000));
    const seenCursors = new Set();
    let acceptedCount = 0;
    try {
      for (let page = 1; page <= maxPages; page += 1) {
        if (stopState.reason || signal?.aborted) {
          calls.push({ source: sourcePlan, page, requested: variables, returned: 0, acceptedShopType: 0, stopReason: stopState.reason || 'aborted' });
          break;
        }
        let response;
        try {
          response = await request('ShopeePromotionOffers', GRAPHQL_CONTRACTS.productOfferV2.query, { ...variables, page, limit: pageSize, sortType: 2, isAMSOffer: true }, { signal: requestSignal });
        } catch (error) {
          calls.push({ source: sourcePlan, page, requested: variables, returned: 0, acceptedShopType: 0, stopReason: stopState.reason || signal?.aborted ? (stopState.reason || 'aborted') : controller.signal.aborted ? 'source_timeout' : 'source_error', error: error?.message || String(error) });
          break;
        }
        const apiErrors = Array.isArray(response?.data?.errors) ? response.data.errors : [];
        const errorMessage = apiErrors.map((item) => item?.message).filter(Boolean).join('; ') || `HTTP ${response?.status || 0}`;
        const rateLimited = apiErrors.some((item) => /10030|rate limit/i.test(String(item?.message || '')));
        if (Number(response?.status || 0) >= 400 || apiErrors.length > 0) {
          if (rateLimited) stopAll('rate_limit');
          calls.push({ source: sourcePlan, page, status: response?.status || 0, requested: variables, returned: 0, acceptedShopType: 0, stopReason: rateLimited ? 'rate_limit' : 'source_error', error: errorMessage });
          break;
        }
        const nodes = response.data?.data?.productOfferV2?.nodes || [];
        extractedBeforeOracleFilters += nodes.length;
        const pageInfo = response.data?.data?.productOfferV2?.pageInfo;
        const shopTypeFiltered = nodes.filter((node) => !Array.isArray(node.shopType) || node.shopType.length === 0 || node.shopType.some((type) => plan.shopTypes.includes(Number(type))));
        
        let acceptedNodes = shopTypeFiltered;
        if (familyTerms && familyTerms.length > 0) {
          acceptedNodes = [];
          for (const node of shopTypeFiltered) {
            if (isProductAdherent(node.productName, familyTerms)) {
              semanticAccepted += 1;
              acceptedNodes.push(node);
            } else {
              semanticRejected += 1;
            }
          }
        }

        const evidence = { source: sourcePlan, page, status: response.status, requested: variables, returned: nodes.length, acceptedShopType: shopTypeFiltered.length, acceptedSemantic: acceptedNodes.length };
        productOffers.push(...acceptedNodes);
        acceptedCount += acceptedNodes.length;

        if (nodes.length === 0) { calls.push({ ...evidence, stopReason: 'empty_page' }); break; }
        if (!pageInfo || pageInfo.hasNextPage !== true) { calls.push({ ...evidence, stopReason: 'has_next_page_false' }); break; }
        if (page >= maxPages) { calls.push({ ...evidence, stopReason: 'page_limit' }); break; }
        const cursor = pageInfo.endCursor ?? pageInfo.nextCursor ?? pageInfo.cursor ?? pageInfo.page ?? null;
        if (cursor == null) { calls.push({ ...evidence, stopReason: 'cursor_missing' }); break; }
        if (pageInfo.page != null && Number(pageInfo.page) < page) { calls.push({ ...evidence, stopReason: 'cursor_not_advanced' }); break; }
        const cursorKey = String(cursor);
        if (seenCursors.has(cursorKey)) { calls.push({ ...evidence, stopReason: 'cursor_repeated' }); break; }
        seenCursors.add(cursorKey);
        calls.push(evidence);
      }
    } finally {
      clearTimeout(timeoutId);
      stopState.controllers.delete(controller);
    }
    return acceptedCount;
  };

  let certifiedFamilies = [];
  let queryTasks = [];

  if (isCertifiedSearchEnabled && nicheFamilies) {
    const allFamilies = Object.entries(nicheFamilies);
    const familiesAvailable = allFamilies.length;
    let familiesSkippedPartial = 0;
    let familiesSkippedInvestigate = 0;
    let familiesSkippedBlocked = 0;

    for (const [familyName, familyData] of allFamilies) {
      if (isExplicitlyBlockedFamily(nicheName, familyName) || familyData.decision === 'bloquear') {
        familiesSkippedBlocked += 1;
        continue;
      }
      if (familyData.decision === 'investigar') {
        familiesSkippedInvestigate += 1;
        continue;
      }
      if (familyData.decision === 'manter') {
        familiesSkippedPartial += 1;
        continue;
      }
      if (familyData.decision === 'promover') {
        const semanticConfig = FAMILY_SEMANTIC_DICTIONARY[familyName] || {
          keyword: familyName,
          terms: [familyName],
        };
        certifiedFamilies.push({
          name: familyName,
          keyword: semanticConfig.keyword,
          terms: semanticConfig.terms,
          targetProductCatId: resolveLeafCategory(familyData.recommendedProductCatIdPath, familyData.rootProductCatId),
          rootProductCatId: Number(familyData.rootProductCatId),
          recommendedProductCatIdPath: familyData.recommendedProductCatIdPath,
        });
      }
    }

    let productCatIdQueries = 0;
    let productCatIdFallbacks = 0;

    const callCertifiedFamily = async (fam) => {
      productCatIdQueries += 1;
      const primaryVars = {
        keyword: fam.keyword,
        productCatId: fam.targetProductCatId,
      };

      const added = await callProduct(primaryVars, `productOfferV2.certified.${fam.name}`, fam.terms);

      // Fallback para categoria raiz se a folha retornar 0 e forem diferentes
      if (added === 0 && fam.targetProductCatId !== fam.rootProductCatId) {
        productCatIdFallbacks += 1;
        const fallbackVars = {
          keyword: fam.keyword,
          productCatId: fam.rootProductCatId,
        };
        await callProduct(fallbackVars, `productOfferV2.fallback.${fam.name}`, fam.terms);
      }
    };

    queryTasks = certifiedFamilies.map((fam) => () => callCertifiedFamily(fam));

    const workerCount = Math.max(1, Math.min(Number(maxConcurrentQueries) || 1, queryTasks.length));
    let nextTask = 0;
    await Promise.all(new Array(workerCount).fill(null).map(async () => {
      while (nextTask < queryTasks.length) {
        const task = queryTasks[nextTask++];
        await task();
      }
    }));

    productCatIdsTelemetry = {
      shopeeProductCatIdsSearchEnabled: true,
      niche: nicheName,
      familiesAvailable,
      familiesUsed: certifiedFamilies.length,
      familiesSkippedPartial,
      familiesSkippedInvestigate,
      familiesSkippedBlocked,
      productCatIdQueries,
      productCatIdFallbacks,
    };
  } else {
    const keywords = plan.keywords.slice(0, maxKeywords ?? plan.keywords.length);
    const categoryIds = plan.categoryIds.slice(0, maxCategories ?? plan.categoryIds.length);
    queryTasks = [
      ...keywords.map((keyword) => () => callProduct({ keyword }, 'productOfferV2.keyword')),
      ...categoryIds.map((productCatId) => () => callProduct({ productCatId }, 'productOfferV2.category')),
    ];
    const workerCount = Math.max(1, Math.min(Number(maxConcurrentQueries) || 1, queryTasks.length));
    let nextTask = 0;
    await Promise.all(new Array(workerCount).fill(null).map(async () => {
      while (nextTask < queryTasks.length) {
        const task = queryTasks[nextTask++];
        await task();
      }
    }));
  }

  let deltaRows = sharedSources.deltaRows || [];
  let datafeedId = sharedSources.datafeedId || null;
  let shopOffers = sharedSources.shopOffers || [];
  let shopeeOffers = sharedSources.shopeeOffers || [];

  if (includeDelta && !sharedSources.deltaRows) {
    const feedResponse = await request('ListItemFeeds', GRAPHQL_CONTRACTS.listItemFeeds.query, {});
    const feeds = feedResponse.data?.data?.listItemFeeds?.feeds || [];
    datafeedId = feeds[0]?.datafeedId || null;
    if (datafeedId) {
      const dataResponse = await request('GetItemFeedData', GRAPHQL_CONTRACTS.getItemFeedData.query, { datafeedId, offset: 0, limit: plan.limits.maxFeedRows });
      const rawDelta = dataResponse.data?.data?.getItemFeedData?.rows || [];
      if (isCertifiedSearchEnabled && certifiedFamilies.length > 0) {
        extractedBeforeOracleFilters += rawDelta.length;
        deltaRows = rawDelta.filter((row) => {
          let cols = row.columns;
          if (typeof cols === 'string') {
            try { cols = JSON.parse(cols); } catch {}
          }
          const title = cols?.productName || cols?.title || cols?.product_name || '';
          const fam = certifiedFamilies.find((f) => isProductAdherent(title, f.terms));
          if (fam) {
            semanticAccepted += 1;
            return true;
          }
          semanticRejected += 1;
          return false;
        });
      } else {
        deltaRows = rawDelta;
      }
    }
  }

  if (includeAuxiliary && !sharedSources.shopOffers) {
    const shopResponse = await request('ShopOfferV2', GRAPHQL_CONTRACTS.shopOfferV2.query, { page: 1, limit: plan.limits.shopOfferV2 });
    const shopeeResponse = await request('ShopeeOfferV2', GRAPHQL_CONTRACTS.shopeeOfferV2.query, { page: 1, limit: plan.limits.shopeeOfferV2 });
    const rawShop = shopResponse.data?.data?.shopOfferV2?.nodes || [];
    const rawShopee = shopeeResponse.data?.data?.shopeeOfferV2?.nodes || [];
    
    if (isCertifiedSearchEnabled && certifiedFamilies.length > 0) {
      extractedBeforeOracleFilters += (rawShop.length + rawShopee.length);
      shopOffers = rawShop.filter((node) => {
        const title = node.productName || node.title || node.name || '';
        const fam = title ? certifiedFamilies.find((f) => isProductAdherent(title, f.terms)) : null;
        if (fam) {
          semanticAccepted += 1;
          return true;
        }
        semanticRejected += 1;
        return false;
      });
      shopeeOffers = rawShopee.filter((node) => {
        const title = node.productName || node.title || node.name || '';
        const fam = title ? certifiedFamilies.find((f) => isProductAdherent(title, f.terms)) : null;
        if (fam) {
          semanticAccepted += 1;
          return true;
        }
        semanticRejected += 1;
        return false;
      });
    } else {
      shopOffers = rawShop;
      shopeeOffers = rawShopee;
    }
  }

  const result = runShadow({
    sources: { productOffers, deltaRows, datafeedId, shopOffers, shopeeOffers, maxFeedRows: plan.limits.maxFeedRows },
    contracts: { [scenarioId]: SCENARIO_CONTRACTS[scenarioId] },
    topLimit: Number.POSITIVE_INFINITY,
    applyDiversityCaps: false,
  });

  const scenarioResult = result.scenarios?.[scenarioId] || {};
  const top = scenarioResult.top || [];

  if (productCatIdsTelemetry) {
    const selectedCertifiedFamilies = new Set();
    for (const item of top) {
      const fam = certifiedFamilies.find((f) => isProductAdherent(item.productName, f.terms));
      if (fam) {
        selectedCertifiedFamilies.add(fam.name);
      }
    }

    productCatIdsTelemetry = {
      ...productCatIdsTelemetry,
      semanticAccepted,
      semanticRejected,
      extractedBeforeOracleFilters,
      afterOracleQualityGate: (scenarioResult.top?.length || 0) + (scenarioResult.rejected?.length || 0),
      queueSelected: top.length,
      familyDiversityCount: selectedCertifiedFamilies.size,
      selectedFamilies: [...selectedCertifiedFamilies],
    };
  }

  return {
    scenarioId,
    queryPlan: plan,
    queryEvidence: {
      calls,
      productOffers: productOffers.length,
      deltaRows: deltaRows.length,
      shopOffers: shopOffers.length,
      shopeeOffers: shopeeOffers.length,
      ...(productCatIdsTelemetry ? { productCatIdsTelemetry } : {}),
    },
    ...result,
  };
}

async function resolveAuxiliaryOffers({ request, shopOffers = [], shopeeOffers = [], maxPerSource = 5 } = {}) {
  const resolve = async (source, node) => {
    if (!node.offerLink) return { ...node, resolved: false, resolutionReason: 'offerLink_missing' };
    const response = await request('ShopeePromotionOffers', GRAPHQL_CONTRACTS.productOfferV2.query, { keyword: node.offerLink, page: 1, limit: 20, sortType: 2, isAMSOffer: true });
    const candidate = (response.data?.data?.productOfferV2?.nodes || []).find((item) => item.itemId && item.shopId && (item.offerLink === node.offerLink || item.productLink));
    return candidate ? { ...node, resolved: true, resolvedProduct: { ...candidate, source: 'productOfferV2', resolvedFrom: source }, resolutionReason: 'productOfferV2_match', resolutionStatus: response.status } : { ...node, resolved: false, resolutionReason: 'productOfferV2_no_exact_identity', resolutionStatus: response.status };
  };
  const shopResolved = []; const shopeeResolved = [];
  for (const node of shopOffers.slice(0, maxPerSource)) shopResolved.push(await resolve('shopOfferV2', node));
  for (const node of shopeeOffers.slice(0, maxPerSource)) shopeeResolved.push(await resolve('shopeeOfferV2', node));
  return { shopOffers: shopResolved, shopeeOffers: shopeeResolved, metrics: { attempted: shopResolved.length + shopeeResolved.length, resolved: [...shopResolved, ...shopeeResolved].filter((node) => node.resolved).length, unresolved: [...shopResolved, ...shopeeResolved].filter((node) => !node.resolved).length } };
}

async function collectScenarioCoverage({ request, maxKeywords = 5, maxCategories = 2, maxFeedRows = 50, resolveAuxiliary = true } = {}) {
  if (typeof request !== 'function') throw new Error('collectScenarioCoverage requer request injetado');
  const feedListResponse = await request('ListItemFeeds', GRAPHQL_CONTRACTS.listItemFeeds.query, {}); const feeds = feedListResponse.data?.data?.listItemFeeds?.feeds || []; const datafeedId = feeds[0]?.datafeedId || null;
  let deltaRows = []; let feedDataStatus = null;
  if (datafeedId) { const feedDataResponse = await request('GetItemFeedData', GRAPHQL_CONTRACTS.getItemFeedData.query, { datafeedId, offset: 0, limit: maxFeedRows }); deltaRows = feedDataResponse.data?.data?.getItemFeedData?.rows || []; feedDataStatus = feedDataResponse.status; }
  const shopResponse = await request('ShopOfferV2', GRAPHQL_CONTRACTS.shopOfferV2.query, { page: 1, limit: 20 }); const shopeeResponse = await request('ShopeeOfferV2', GRAPHQL_CONTRACTS.shopeeOfferV2.query, { page: 1, limit: 20 });
  let shopOffers = shopResponse.data?.data?.shopOfferV2?.nodes || []; let shopeeOffers = shopeeResponse.data?.data?.shopeeOfferV2?.nodes || []; let auxiliaryResolution = { attempted: 0, resolved: 0, unresolved: 0 };
  if (resolveAuxiliary) { const resolved = await resolveAuxiliaryOffers({ request, shopOffers, shopeeOffers, maxPerSource: 5 }); shopOffers = resolved.shopOffers; shopeeOffers = resolved.shopeeOffers; auxiliaryResolution = resolved.metrics; }
  const scenarios = {};
  for (const scenarioId of Object.keys(SCENARIO_CONTRACTS)) scenarios[scenarioId] = await runScenarioPlan(scenarioId, { request, maxKeywords, maxCategories, includeDelta: false, includeAuxiliary: false, sharedSources: { deltaRows, datafeedId, shopOffers, shopeeOffers, maxFeedRows } });
  return { mode: 'live-scenario-coverage', flags: { DRY_RUN: '1', NO_DB_WRITE: '1', NO_POSTS: '1', NO_PUBLISH: '1' }, queryEvidence: { feedListStatus: feedListResponse.status, feedDataStatus, shopStatus: shopResponse.status, shopeeStatus: shopeeResponse.status, feed: feeds[0] || null, deltaRows: deltaRows.length, auxiliaryResolution }, scenarios, writeAudit: { supabaseWrites: 0, offersWrites: 0, postsWrites: 0, publishCalls: 0, oracleCalls: 0 } };
}

function runShadow({ sources = {}, contracts = SCENARIO_CONTRACTS, topLimit = 20, applyDiversityCaps = true } = {}) {
  const delta = processDeltaRows(sources.deltaRows || [], { datafeedId: sources.datafeedId, maxRows: sources.maxFeedRows ?? 100 });
  const rawProducts = [...(sources.productOffers || []), ...delta.activeItems];
  const auxiliary = { shopOfferV2: (sources.shopOffers || []).map((node) => auxiliaryNode('shopOfferV2', node)), shopeeOfferV2: (sources.shopeeOffers || []).map((node) => auxiliaryNode('shopeeOfferV2', node)) };
  rawProducts.push(...[...auxiliary.shopOfferV2, ...auxiliary.shopeeOfferV2].filter((node) => node.resolved && node.resolvedProduct).map((node) => ({ ...node.resolvedProduct, source: 'productOfferV2', resolvedFrom: node.source })));
  const scenarios = {};
  for (const [scenarioId, contract] of Object.entries(contracts)) {
    const normalizedResults = rawProducts.map((node) => normalizeProductOffer(node, { source: node.updateType ? 'getItemFeedData' : 'productOfferV2', productCatId: node.productCatId }));
    const intentResults = normalizedResults.map((result) => ({ ...result.product, technicalAccepted: result.accepted, technicalReasons: result.technicalReasons, intent: evaluateIntent(result.product, contract) }));
    const eligible = intentResults.filter((product) => product.intent.eligible);
    const rejectedIntent = intentResults.filter((product) => !product.intent.eligible);
    const technicalEligible = eligible.filter((product) => product.technicalAccepted);
    const technicalRejected = intentResults.filter((product) => !product.technicalAccepted);
    const deduped = dedupe(technicalEligible);
    const scoreable = deduped.unique.map((product) => {
      const rankingV1 = evaluateCanonicalRanking(product, scenarioId, contract);
      return { ...product, familyKey: familyKey(product), rankingV1, score: rankingV1.score };
    }).filter((product) => product.rankingV1.eligible);
    const familyCount = new Map(); const shopCount = new Map(); const top = [];
    for (const product of scoreable.sort((a, b) => b.score - a.score || b.sales - a.sales || a.itemId.localeCompare(b.itemId))) {
      const family = familyCount.get(product.familyKey) || 0; const shop = shopCount.get(product.shopId) || 0;
      if (applyDiversityCaps && family >= contract.maxFamilyPerScenario) continue;
      if (applyDiversityCaps && shop >= contract.maxShopPerScenario) continue;
      if (top.length >= topLimit) break;
      familyCount.set(product.familyKey, family + 1); shopCount.set(product.shopId, shop + 1); top.push(product);
    }
    const reasonCount = (reason) => rejectedIntent.filter((product) => product.intent.reasons.includes(reason)).length;
    const technicalImageLink = eligible.filter((product) => product.technicalReasons.includes('image_required') || product.technicalReasons.includes('product_or_offer_link_required')).length;
    const topAverages = (field) => top.length ? Number((top.reduce((sum, item) => sum + number(item[field]), 0) / top.length).toFixed(2)) : null;
    scenarios[scenarioId] = { top, rejected: [...rejectedIntent, ...eligible.filter((product) => !product.technicalAccepted)], metrics: {
      raw: rawProducts.length, parsed: normalizedResults.length, normalized: normalizedResults.filter((result) => result.accepted).length, technicalRejected: technicalRejected.length, intentRejected: rejectedIntent.length,
      approvedContract: eligible.length, duplicates: deduped.duplicates.length, scoreable: scoreable.length, final: top.length,
      categories: new Set(top.flatMap((item) => item.productCatIds)).size, shops: new Set(top.map((item) => item.shopId)).size, families: new Set(top.map((item) => item.familyKey)).size,
      imageLink100: top.length > 0 && top.every((item) => item.imageUrl && (item.offerLink || item.productLink)), topAverages: { price: topAverages('price'), discount: topAverages('priceDiscountRate'), rating: topAverages('ratingStar'), sales: topAverages('sales'), commission: topAverages('commissionPercent') },
      rejections: { domain: reasonCount('positive_domain_missing'), requiredProductClass: reasonCount('required_product_class_missing'), blockedCategory: reasonCount('api_category_blocked_or_missing'), ambiguousTerms: reasonCount('ambiguous_terms'), salesRatingDiscountCommission: rejectedIntent.filter((product) => product.intent.reasons.some((reason) => ['sales_below_minimum','rating_below_minimum','discount_below_minimum','commission_below_minimum'].includes(reason))).length, technicalImageLink, duplicates: deduped.duplicates.length },
    } };
  }
  return { generatedAt: new Date().toISOString(), scenarios, auxiliary, feed: delta, writeAudit: { supabaseWrites: 0, offersWrites: 0, postsWrites: 0, publishCalls: 0, oracleCalls: 0 }, sourceCounts: { productOffers: (sources.productOffers || []).length, deltaRows: (sources.deltaRows || []).length, shopOffers: (sources.shopOffers || []).length, shopeeOffers: (sources.shopeeOffers || []).length } };
}

function createSignedRequest({ appId, appSecret, request }) {
  return async function signedRequest(operationName, query, variables = {}) {
    const body = JSON.stringify({ operationName, query, variables }); const timestamp = Math.floor(Date.now() / 1000);
    const signature = crypto.createHash('sha256').update(`${appId}${timestamp}${body}${appSecret}`).digest('hex');
    return request({ body, headers: { 'Content-Type': 'application/json', Authorization: `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}` } });
  };
}

function buildFixtureSources(fixture) {
  const categoryByScenario = Object.fromEntries(Object.entries(SCENARIO_CONTRACTS).map(([id, contract]) => [id, contract.allowedApiCategories[0]]));
  const productOffers = (fixture.cases || []).map((item, index) => ({
    itemId: String(700000 + index), shopId: String(800000 + (item.label === 'duplicidade_familia' ? 1 : index)), productName: item.title,
    productLink: `https://shopee.com.br/product/${800000 + index}/${700000 + index}`, offerLink: `https://s.shopee.com.br/fixture${index}`,
    imageUrl: `https://cf.shopee.com.br/fixture${index}.jpg`, priceMin: '49.90', priceMax: '79.90', ratingStar: '4.8', sales: '1200', priceDiscountRate: '20', commissionRate: '0.08', shopType: [1], productCatIds: [categoryByScenario[item.scenario] || 100010],
  }));
  return { productOffers, deltaRows: [], shopOffers: [], shopeeOffers: [] };
}

async function collectLiveSources({ appId, appSecret, maxFeedRows = 20 } = {}) {
  if (!appId || !appSecret) throw new Error('SHOPEE_APP_ID e SHOPEE_APP_SECRET são obrigatórios para --live-sample');
  const request = createSignedRequest({ appId, appSecret, request: async ({ body, headers }) => {
    const response = await fetch('https://open-api.affiliate.shopee.com.br/graphql', { method: 'POST', headers, body, signal: AbortSignal.timeout(30000) });
    return { status: response.status, data: await response.json() };
  } });
  const productResponse = await request('ShopeePromotionOffers', GRAPHQL_CONTRACTS.productOfferV2.query, { keyword: 'fone bluetooth', page: 1, limit: 20, sortType: 2, isAMSOffer: true });
  const feedListResponse = await request('ListItemFeeds', GRAPHQL_CONTRACTS.listItemFeeds.query, {});
  const feeds = feedListResponse.data?.data?.listItemFeeds?.feeds || [];
  const datafeedId = feeds[0]?.datafeedId || null;
  let deltaRows = [];
  if (datafeedId) {
    const feedDataResponse = await request('GetItemFeedData', GRAPHQL_CONTRACTS.getItemFeedData.query, { datafeedId, offset: 0, limit: maxFeedRows });
    deltaRows = feedDataResponse.data?.data?.getItemFeedData?.rows || [];
  }
  const shopResponse = await request('ShopOfferV2', GRAPHQL_CONTRACTS.shopOfferV2.query, { page: 1, limit: 20 });
  const shopeeResponse = await request('ShopeeOfferV2', GRAPHQL_CONTRACTS.shopeeOfferV2.query, { page: 1, limit: 20 });
  return {
    productOffers: productResponse.data?.data?.productOfferV2?.nodes || [], deltaRows, datafeedId,
    shopOffers: shopResponse.data?.data?.shopOfferV2?.nodes || [], shopeeOffers: shopeeResponse.data?.data?.shopeeOfferV2?.nodes || [],
    apiEvidence: { productStatus: productResponse.status, feedListStatus: feedListResponse.status, feedDataRows: deltaRows.length, shopStatus: shopResponse.status, shopeeStatus: shopeeResponse.status, feed: feeds[0] || null },
  };
}

async function runCli(argv = process.argv.slice(2)) {
  const live = argv.includes('--live-sample');
  if (live) {
    const request = createSignedRequest({ appId: process.env.SHOPEE_APP_ID, appSecret: process.env.SHOPEE_APP_SECRET, request: async ({ body, headers }) => { const response = await fetch('https://open-api.affiliate.shopee.com.br/graphql', { method: 'POST', headers, body, signal: AbortSignal.timeout(30000) }); return { status: response.status, data: await response.json() }; } });
    return collectScenarioCoverage({ request, maxKeywords: Number(process.env.SHOPEE_SHADOW_MAX_KEYWORDS || 5), maxCategories: Number(process.env.SHOPEE_SHADOW_MAX_CATEGORIES || 2), maxFeedRows: Number(process.env.SHOPEE_SHADOW_MAX_FEED_ROWS || 50) });
  }
  const sources = live
    ? await collectLiveSources({ appId: process.env.SHOPEE_APP_ID, appSecret: process.env.SHOPEE_APP_SECRET, maxFeedRows: Number(process.env.SHOPEE_SHADOW_MAX_FEED_ROWS || 20) })
    : buildFixtureSources(require('./fixtures/shopee-intent-labeled-sample.json'));
  const result = runShadow({ sources, topLimit: 20 });
  return { mode: live ? 'live-sample' : 'fixture', flags: { DRY_RUN: '1', NO_DB_WRITE: '1', NO_POSTS: '1', NO_PUBLISH: '1' }, apiEvidence: sources.apiEvidence || null, ...result };
}

if (require.main === module) {
  if (process.argv.includes('--live-sample')) require('dotenv').config({ path: '.env.local', quiet: true });
  runCli().then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(`[Shopee Shadow V1] ${error.message}`); process.exitCode = 1; });
}

module.exports = { GRAPHQL_CONTRACTS, SCENARIO_CONTRACTS, SCENARIO_QUERY_PLANS, normalizeCommission, normalizePriceIntegrity, matchesRequiredProductIdentity, evaluateIntent, normalizeProductOffer, normalizeFeedColumns, processDeltaRows, runShadow, runScenarioPlan, resolveAuxiliaryOffers, collectScenarioCoverage, createSignedRequest, familyKey, buildFixtureSources, collectLiveSources, runCli };
