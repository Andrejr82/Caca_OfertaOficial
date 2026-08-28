'use strict';

const {
  GRAPHQL_CONTRACTS,
  createSignedRequest,
  normalizePriceIntegrity,
} = require('./shopee-openapi-shadow-engine-v1.cjs');

const ACHADINHO_STRATEGY_VERSION = 'shopee-achadinho-quality-v1.2';
const SHOPEE_BROAD_DISCOVERY_CATEGORIES = Object.freeze([
  100010, // Casa e Cozinha / Eletroportáteis
  100013, // Celulares e Acessórios
  100644, // Informática e Periféricos
  100636, // Móveis e Decoração / Ferramentas
  100630, // Beleza e Cuidados Pessoais
  100535, // Áudio / TVs / Eletrônicos
  100009, // Moda Masculina
  100011, // Moda Feminina
  100637, // Esportes e Fitness
  100631, // Pet Shop
  100634, // Games e Consoles
  100632, // Brinquedos e Hobbies
  100635, // Bebês e Crianças
  100638, // Saúde e Bem-Estar
  100639, // Automotivo
  100640, // Livros e Papelaria
]);

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseNumber(value, fallback = 0) {
  const result = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(result) ? result : fallback;
}

function defaultShopeeApiCaller(env = process.env) {
  const appId = env.SHOPEE_APP_ID;
  const appSecret = env.SHOPEE_APP_SECRET;
  if (!appId || !appSecret) return null;
  return createSignedRequest({
    appId,
    appSecret,
    request: async ({ body, headers }) => {
      const response = await fetch('https://open-api.affiliate.shopee.com.br/graphql', {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(30000),
      });
      return { status: response.status, data: await response.json() };
    },
  });
}

async function collectShopeeMarketplaceCandidates({
  request = null,
  categoryIds = SHOPEE_BROAD_DISCOVERY_CATEGORIES,
  maxPerCategory = 40,
  maxPagesPerCategory = 2,
  page = 1,
  sortType = 2,
  isAMSOffer = undefined,
  env = process.env,
} = {}) {
  const caller = request || defaultShopeeApiCaller(env);
  if (!caller) return [];

  const candidates = [];
  const seen = new Set();
  const targetCategories = Array.isArray(categoryIds) && categoryIds.length ? categoryIds : [null];
  const pageLimit = Math.max(5, Math.min(50, Number(maxPerCategory) || 40));
  const pagesToScan = Math.max(1, Math.min(5, Math.floor(Number(maxPagesPerCategory) || 2)));
  const basePage = Math.max(1, Number(page) || 1);

  for (const categoryId of targetCategories) {
    try {
      for (let offset = 0; offset < pagesToScan; offset += 1) {
        const currentPage = basePage + offset;
        const variables = {
          page: currentPage,
          limit: pageLimit,
          sortType: typeof sortType === 'number' ? sortType : 2,
        };
        if (categoryId) variables.productCatId = categoryId;
        if (typeof isAMSOffer === 'boolean') variables.isAMSOffer = isAMSOffer;

        const response = await caller(
          'ShopeePromotionOffers',
          GRAPHQL_CONTRACTS.productOfferV2.query,
          variables,
          { timeoutMs: 15000 },
        );
        const nodes = response?.data?.data?.productOfferV2?.nodes || [];
        if (!Array.isArray(nodes) || nodes.length === 0) break;

        for (const node of nodes) {
          const itemId = String(node.itemId || '').trim();
          const shopId = String(node.shopId || '').trim();
          const productName = String(node.productName || '').trim();
          if (!itemId || !shopId || !productName) continue;

          const identity = `${shopId}\u0000${itemId}`;
          if (seen.has(identity)) continue;
          seen.add(identity);

          const priceIntegrity = normalizePriceIntegrity({
            price: node.price,
            priceMin: node.priceMin,
            priceMax: node.priceMax,
            priceDiscountRate: node.priceDiscountRate,
            officialOldPrice: node.officialOldPrice,
          });
          if (!(priceIntegrity.currentPrice > 0)) continue;

          const commissionRate = parseNumber(node.commissionRate, 0);
          const sellerCommissionRate = parseNumber(node.sellerCommissionRate, 0);
          const normalizePercent = (value) => Math.round((value > 0 && value <= 1 ? value * 100 : value) * 100) / 100;
          const rating = parseNumber(node.ratingStar, 0);

          candidates.push({
            marketplace: 'Shopee',
            itemId,
            shopId,
            shopName: String(node.shopName || ''),
            productName,
            category: 'Marketplace Deals',
            currentPrice: priceIntegrity.currentPrice,
            oldPrice: priceIntegrity.oldPrice,
            discountPercent: priceIntegrity.discountPercent ?? 0,
            priceDiscountRate: priceIntegrity.discountPercent ?? 0,
            marketplaceReportedDiscountPercent: parseNumber(node.priceDiscountRate, 0),
            priceRangeAmbiguous: priceIntegrity.rangeAmbiguous,
            priceAuthority: priceIntegrity.priceAuthority,
            oldPriceAuthority: priceIntegrity.oldPriceAuthority,
            discountAuthority: priceIntegrity.discountAuthority,
            sales: parseInt(String(node.sales || '0'), 10) || 0,
            ratingStar: rating > 0 ? rating : null,
            rating: rating > 0 ? rating : null,
            commissionRate: normalizePercent(commissionRate),
            commissionPercent: normalizePercent(commissionRate),
            sellerCommissionRate: normalizePercent(sellerCommissionRate),
            shopType: Array.isArray(node.shopType) ? node.shopType : [],
            permalink: String(node.offerLink || node.productLink || ''),
            imageUrl: String(node.imageUrl || ''),
            provenance: 'shopee_openapi_productOfferV2',
            observedAt: new Date().toISOString(),
          });
        }

        const pageInfo = response?.data?.data?.productOfferV2?.pageInfo;
        if (pageInfo && pageInfo.hasNextPage === false) break;
      }
    } catch (_err) {
      // Isola falha por categoria sem relaxar os gates de qualidade.
    }
  }

  return candidates;
}

function extractQuantityClass(text) {
  const normalized = normalizeText(text);
  const match = normalized.match(/\b(\d{1,4})\s*(pecas|peca|pares|par|unidades|unidade|itens|item)\b/);
  if (match) {
    const count = Number(match[1]);
    if (count >= 10) return 'bulk';
    if (count >= 2) return `multi_${count}`;
  }
  if (/\bkit\b|\bcombo\b|\bconjunto\b/.test(normalized)) return 'kit';
  return 'single';
}

function classifyPeerIdentity(productName) {
  const text = normalizeText(productName);
  let peerFamily = 'especifico';
  let peerType = 'item_isolado';
  let macroGroup = 'outros';

  const set = (family, type, macro = family) => {
    peerFamily = family;
    peerType = type;
    macroGroup = macro;
  };

  if (/\bfone\b.*\b(tws|bluetooth)\b|\btws\b.*\bfone/.test(text)) set('audio', 'fones_tws_bluetooth', 'eletronicos');
  else if (/\bcordao\b.*\bcelular\b|\bcrossbody\b.*\bcelular\b/.test(text)) set('acessorios_celular', 'cordao_celular', 'eletronicos');
  else if (/\blencol\b.*\b400\s*fios\b/.test(text)) set('cama_banho', 'jogo_lencol_400_fios', 'casa');
  else if (/\bchave\s*t\b.*\b(maquina|lavar|agitador)\b/.test(text)) set('ferramentas', 'chave_t_maquina_lavar', 'ferramentas');
  else if (/\b(mixer|misturador|batedor)\b.*\b(eletrico|portatil)\b/.test(text)) set('cozinha', 'mixer_misturador_portatil', 'casa');
  else if (/\btorneira\b.*\b360\b|\btorneira\b.*\bchuveir/.test(text)) set('cozinha_metais', 'torneira_chuveiro_360', 'casa');
  else if (/\b(40|46)\s*pecas\b.*\b(chave|catraca|ferrament)/.test(text) || /\bmaleta\b.*\b(catraca|ferrament)/.test(text)) set('ferramentas', 'maleta_jogo_chave_catraca', 'ferramentas');
  else if (/\bferramenta\b.*\b(dobravel|multiuso)\b/.test(text)) set('ferramentas', 'ferramenta_dobravel_multiuso', 'ferramentas');
  else if (/\bkarseell\b.*\bkit\b|\bkit\b.*\bkarseell\b/.test(text)) set('cabelo', 'kit_capilar_completo_karseell', 'beleza');
  else if (/\bmeia/.test(text) && /\b(kit|pares|par)\b/.test(text)) set('vestuario', 'kit_meias_soquete', 'vestuario_calcados');
  else if (/\bcueca/.test(text) && /\b(kit|box|boxer)\b/.test(text)) set('vestuario', 'kit_cuecas_boxer', 'vestuario_calcados');
  else if (/\bcilios\b|\bpestanas\b/.test(text)) set('beleza_olhos', 'estojo_extensao_cilios', 'beleza');
  else if (/\bgarrafa/.test(text) && /\b(squeeze|motivacional)\b/.test(text)) set('utilidades', 'kit_garrafas_squeeze_motivacional', 'casa');
  else if (/\bsuporte\b.*\b(tv|televisao)\b.*\b(articulad|retratil)\b|\b(articulad|retratil)\b.*\bsuporte\b.*\b(tv|televisao)\b/.test(text)) set('suporte_tv', 'suporte_tv_articulado', 'casa');
  else if (/\bsuporte\b.*\b(tv|televisao)\b.*\b(fixo|universal|parede)\b|\bsuporte\b.*\b(fixo|universal)\b.*\b(tv|televisao)\b/.test(text)) set('suporte_tv', 'suporte_tv_fixo', 'casa');
  else if (/\bsuporte\b.*\b(roteador|modem|wifi)\b.*\bparede\b|\bsuporte\b.*\bparede\b.*\b(roteador|modem|wifi)\b/.test(text)) set('organizacao_rede', 'suporte_roteador_parede', 'casa');
  else if (/\badaptador\b.*\btomada\b.*\b(dobravel|articulado|flex)\b|\bpino\b.*\badaptador\b.*\btomada\b/.test(text)) set('eletrica', 'adaptador_tomada_articulado', 'casa');
  else if (/\b(bico|esguicho)\b.*\balta\s*pressao\b.*\bmangueira\b|\bmangueira\b.*\b(bico|esguicho)\b.*\balta\s*pressao\b/.test(text)) set('jardim', 'bico_mangueira_alta_pressao', 'casa');
  else if (/\bsuporte\b.*\bparede\b.*\b(adesiv|fita|multiuso|organizador)\b/.test(text)) set('organizacao', 'suporte_parede_adesivo_multiuso', 'casa');
  else if (/\belastico\b.*\bcabelo\b|\bxuxinha\b/.test(text)) set('acessorios', 'kit_xuxinha_elastico_cabelo', 'beleza');
  else if (/\broll\s*on\b.*\b(olho|olheira|serum)\b|\bserum\b.*\broll\s*on\b/.test(text)) set('skincare', 'serum_rollon_olhos', 'beleza');
  else if (/\bclareador\b.*\b(virilha|axila)\b/.test(text)) set('skincare_corporal', 'creme_clareador_corporal', 'beleza');
  else if (/\bprotetor\s*solar\b/.test(text)) set('skincare', 'protetor_solar', 'beleza');
  else if (/\bprotetor\b.*\bcolchao\b|\bcapa\b.*\bcolchao\b/.test(text)) set('cama_banho', 'protetor_colchao', 'casa');
  else if (/\borganizador\b|\bprateleira\b/.test(text)) set('organizacao', 'organizador_prateleira', 'casa');
  else if (/\bborrifador\b.*\b(azeite|culinario)\b|\bpulverizador\b.*\bazeite\b/.test(text)) set('cozinha', 'borrifador_azeite', 'casa');
  else if (/\bcamiseta\b.*\bbasica\b|\bt shirt\b.*\bbasic/.test(text)) set('vestuario', 'camiseta_basica', 'vestuario_calcados');

  return {
    peerFamily,
    peerType,
    macroGroup,
    quantityClass: extractQuantityClass(productName),
  };
}

function sameNativeIdentity(a, b) {
  return String(a?.shopId || '') === String(b?.shopId || '') && String(a?.itemId || '') === String(b?.itemId || '');
}

function quantityCompatible(a, b) {
  if (a.quantityClass === b.quantityClass) return true;
  if (a.quantityClass === 'single' || b.quantityClass === 'single') return false;
  return false;
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

function buildPeerContext(candidate, pool = []) {
  const identity = classifyPeerIdentity(candidate.productName);
  if (identity.peerType === 'item_isolado') {
    return {
      ...identity,
      peerCount: 0,
      peerConfidence: 'NONE',
      peerPriceMin: null,
      peerPriceMedian: null,
      peerPriceMax: null,
      priceVsPeerMedianPercent: null,
      offerPriceScore: 0,
    };
  }

  const peers = pool.filter((other) => {
    if (sameNativeIdentity(candidate, other)) return false;
    const otherIdentity = classifyPeerIdentity(other.productName);
    return otherIdentity.peerType === identity.peerType
      && quantityCompatible(identity, otherIdentity)
      && Number(other.currentPrice) > 0;
  });
  const prices = peers.map((peer) => Number(peer.currentPrice)).filter((price) => price > 0);
  const peerCount = prices.length;
  const peerConfidence = peerCount >= 5 ? 'HIGH' : peerCount >= 3 ? 'MEDIUM' : peerCount > 0 ? 'LOW' : 'NONE';
  const peerPriceMedian = median(prices);
  const currentPrice = Number(candidate.currentPrice) || 0;
  const difference = peerPriceMedian && currentPrice > 0
    ? ((peerPriceMedian - currentPrice) / peerPriceMedian) * 100
    : null;
  let offerPriceScore = 0;
  if ((peerConfidence === 'HIGH' || peerConfidence === 'MEDIUM') && difference !== null) {
    if (difference >= 25) offerPriceScore = 15;
    else if (difference >= 15) offerPriceScore = 12;
    else if (difference >= 8) offerPriceScore = 8;
    else if (difference >= -8) offerPriceScore = 4;
  }

  return {
    ...identity,
    peers,
    peerCount,
    peerConfidence,
    peerPriceMin: prices.length ? Math.min(...prices) : null,
    peerPriceMedian,
    peerPriceMax: prices.length ? Math.max(...prices) : null,
    priceVsPeerMedianPercent: difference === null ? null : Math.round(difference * 10) / 10,
    offerPriceScore,
  };
}

function scoreOfferHistory(candidate) {
  const price = Number(candidate.currentPrice) || 0;
  const oldPrice = Number(candidate.oldPrice) || 0;
  if (!(price > 0 && oldPrice > price) || candidate.oldPriceAuthority === 'variation_range') return 0;
  const diff = ((oldPrice - price) / oldPrice) * 100;
  if (diff >= 20) return 15;
  if (diff >= 10) return 10;
  if (diff > 0) return 5;
  return 0;
}

function scoreDemand(sales) {
  const value = Number(sales) || 0;
  if (value >= 20000) return 20;
  if (value >= 10000) return 18;
  if (value >= 5000) return 15;
  if (value >= 2000) return 11;
  if (value >= 500) return 6;
  if (value > 0) return 3;
  return 0;
}

function scoreDataConfidence(candidate) {
  const rating = Number(candidate.ratingStar ?? candidate.rating) || 0;
  let score = rating >= 4.9 ? 5 : rating >= 4.8 ? 4 : rating >= 4.7 ? 3 : rating >= 4.5 ? 2 : 0;
  if (candidate.itemId && candidate.shopId) score += 3;
  if (/^https:\/\//i.test(String(candidate.imageUrl || ''))) score += 2;
  if (/^https:\/\//i.test(String(candidate.permalink || ''))) score += 2;
  const title = normalizeText(candidate.productName);
  if (title.length >= 12 && title.split(' ').length >= 3) score += 3;
  return Math.min(15, Math.max(0, score));
}

function scoreCommercialValue(candidate) {
  const price = Number(candidate.currentPrice) || 0;
  const commission = (Number(candidate.commissionPercent ?? candidate.commissionRate) || 0)
    + (Number(candidate.sellerCommissionRate) || 0);
  const estimated = price * commission / 100;
  let score = 0;
  if (estimated >= 20) score = 10;
  else if (estimated >= 10) score = 8;
  else if (estimated >= 5) score = 6;
  else if (estimated >= 2.5) score = 4;
  else if (estimated >= 1) score = 2;
  return { score, estimatedCommissionPerSale: Math.round(estimated * 100) / 100, effectiveCommissionPercent: commission };
}

function scoreAchadinhoValue(candidate, peerContext) {
  const text = normalizeText(candidate.productName);
  const price = Number(candidate.currentPrice) || 0;
  const quantity = extractQuantityClass(text);
  const commodity = /\b(camiseta basica|meia|cueca|elastico cabelo|refil)\b/.test(text);
  const utilityStrong = /\b(mixer|misturador|ferrament|torneira|suporte|organizador|protetor colchao|garrafa|fone|adaptador|borrifador|lençol|lencol)\b/.test(text);
  const transformationClear = /\b(serum|clareador|skincare|karseell|mascara|protetor solar)\b/.test(text);
  const visualStrong = /\b(mixer|ferrament|torneira|suporte|organizador|fone|adaptador|borrifador|garrafa)\b/.test(text);
  const discoveryStrong = /\b(360|multiuso|dobravel|tws|led|2 em 1|recarregavel|spray|borrifador)\b/.test(text);

  const utility = utilityStrong ? 8 : transformationClear ? 6 : commodity ? 2 : 5;
  let perceivedValue = 4;
  if (peerContext.offerPriceScore >= 12) perceivedValue = 7;
  else if (quantity !== 'single' && price > 0 && price <= 50) perceivedValue = 7;
  else if (price > 0 && price <= 30 && utilityStrong) perceivedValue = 6;
  else if (commodity) perceivedValue = 2;
  const demonstrability = visualStrong ? 5 : transformationClear ? 3 : commodity ? 1 : 3;
  const discovery = discoveryStrong ? 5 : commodity ? 1 : 3;

  return {
    utility,
    perceivedValue,
    demonstrability,
    discovery,
    total: Math.min(25, utility + perceivedValue + demonstrability + discovery),
  };
}

function getCatalogPenalty(candidate, peerContext, achadinho) {
  const text = normalizeText(candidate.productName);
  const isBasicCommodity = /\b(camiseta basica|t shirt basica|meia|cueca|refil)\b/.test(text);
  if (isBasicCommodity && peerContext.offerPriceScore === 0 && achadinho.total < 16) return -15;
  return 0;
}

function scoreShopeeAchadinhoCandidate(candidate, pool = []) {
  const currentPrice = Number(candidate.currentPrice) || 0;
  const peer = buildPeerContext(candidate, pool);
  const offerHistoryScore = scoreOfferHistory(candidate);
  const offerStrength = Math.min(30, peer.offerPriceScore + offerHistoryScore);
  const achadinho = scoreAchadinhoValue(candidate, peer);
  const demand = scoreDemand(candidate.sales);
  const dataConfidence = scoreDataConfidence(candidate);
  const commercial = scoreCommercialValue(candidate);
  const catalogPenalty = getCatalogPenalty(candidate, peer, achadinho);
  const validIdentity = Boolean(candidate.itemId && candidate.shopId && normalizeText(candidate.productName));
  const validImage = /^https:\/\//i.test(String(candidate.imageUrl || ''));
  const gateByQuality = offerStrength >= 8 || achadinho.total >= 16;
  const passesGate = currentPrice > 0 && validIdentity && validImage && gateByQuality && (catalogPenalty === 0 || offerStrength >= 8);
  const finalScore = Math.max(0, Math.min(100,
    offerStrength + achadinho.total + demand + dataConfidence + commercial.score + catalogPenalty,
  ));

  return {
    candidate,
    peer,
    offerPriceScore: peer.offerPriceScore,
    offerHistoryScore,
    offerStrength,
    achadinhoValue: achadinho.total,
    achadinhoBreakdown: achadinho,
    demand,
    dataConfidence,
    commercialValue: commercial.score,
    estimatedCommissionPerSale: commercial.estimatedCommissionPerSale,
    effectiveCommissionPercent: commercial.effectiveCommissionPercent,
    catalogPenalty,
    finalScore,
    passesGate,
  };
}

function selectShopeeAchadinhosV12(candidates = [], { maxProducts = 20 } = {}) {
  const scored = candidates
    .filter((candidate) => candidate?.peerReferenceOnly !== true)
    .map((candidate) => scoreShopeeAchadinhoCandidate(candidate, candidates))
    .filter((row) => row.passesGate)
    .sort((a, b) => b.finalScore - a.finalScore || b.demand - a.demand || (Number(b.candidate.sales) || 0) - (Number(a.candidate.sales) || 0));

  const selected = [];
  const storeCounts = new Map();
  const familyCounts = new Map();
  const peerTypeCounts = new Map();
  const macroCounts = new Map();
  const seenNative = new Set();

  for (const row of scored) {
    if (selected.length >= maxProducts) break;
    const native = `${row.candidate.shopId}\u0000${row.candidate.itemId}`;
    if (seenNative.has(native)) continue;

    const store = String(row.candidate.shopId || 'unknown');
    const family = row.peer.peerFamily;
    const peerType = row.peer.peerType;
    const macro = row.peer.macroGroup;
    const storeCount = storeCounts.get(store) || 0;
    const familyCount = familyCounts.get(family) || 0;
    const peerTypeCount = peerTypeCounts.get(peerType) || 0;
    const macroCount = macroCounts.get(macro) || 0;

    if (storeCount >= 2) continue;
    if (familyCount >= 3) continue;
    if (peerType !== 'item_isolado' && peerTypeCount >= 2) continue;
    if (macro === 'beleza' && macroCount >= 5) continue;
    if (macro === 'vestuario_calcados' && macroCount >= 4) continue;

    selected.push(row);
    seenNative.add(native);
    storeCounts.set(store, storeCount + 1);
    familyCounts.set(family, familyCount + 1);
    peerTypeCounts.set(peerType, peerTypeCount + 1);
    macroCounts.set(macro, macroCount + 1);
  }

  return selected;
}

function buildShopeePeerScoringPool(selectableCandidates = [], excludedPeers = []) {
  return [
    ...selectableCandidates,
    ...excludedPeers.map((candidate) => ({ ...candidate, peerReferenceOnly: true })),
  ];
}

function classifyDecision(score) {
  if (score >= 70) return 'PRIORIDADE';
  if (score >= 55) return 'TESTAR';
  return 'OBSERVAR';
}

function buildShopeeRadarProductsV12({ radarRunId, shopeeCandidates = [], maxProducts = 20, now = new Date() }) {
  const selected = selectShopeeAchadinhosV12(shopeeCandidates, { maxProducts });
  return selected.map((row, index) => {
    const candidate = row.candidate;
    const priority = index + 1;
    const rating = Number(candidate.ratingStar ?? candidate.rating) || null;
    const decision = classifyDecision(row.finalScore);
    const scoreBreakdown = {
      offerStrength: row.offerStrength,
      offerPrice: row.offerPriceScore,
      offerHistory: row.offerHistoryScore,
      achadinhoValue: row.achadinhoValue,
      demand: row.demand,
      dataConfidence: row.dataConfidence,
      commercialValue: row.commercialValue,
      catalogPenalty: row.catalogPenalty,
    };

    return {
      radar_run_id: radarRunId,
      priority,
      product_term: candidate.productName,
      normalized_product_term: normalizeText(candidate.productName),
      category: candidate.category || null,
      marketplace: 'Shopee',
      evidence_status: 'verified',
      source_count: 1,
      commercial_score: row.finalScore,
      score_breakdown: scoreBreakdown,
      determining_reasons: [
        row.offerPriceScore > 0 ? `peer_price_${row.peer.peerConfidence.toLowerCase()}` : 'peer_price_unavailable_or_not_competitive',
        `achadinho_value_${row.achadinhoValue}`,
        `demand_${row.demand}`,
      ],
      confidence: Math.min(95, 60 + row.dataConfidence * 2),
      direct_evidence: [{
        claim: 'Produto comercial identificado em Shopee',
        evidence_type: 'marketplace_snapshot',
        provenance: candidate.provenance || 'shopee_openapi_productOfferV2',
        source_url: candidate.permalink || null,
        image_url: candidate.imageUrl || null,
        observed_at: candidate.observedAt || now.toISOString(),
        rank_position: priority,
        best_seller_flag: Number(candidate.sales) >= 5000,
        trending_flag: false,
        sold_quantity: Number(candidate.sales) || null,
        price: Number(candidate.currentPrice) || null,
        old_price: candidate.oldPrice || null,
        discount_percent: candidate.discountPercent || null,
        rating,
        decision,
        strategy_version: ACHADINHO_STRATEGY_VERSION,
        marketplace_identity: {
          itemId: candidate.itemId || null,
          shopId: candidate.shopId || null,
          productId: candidate.productId || null,
          shopType: candidate.shopType || null,
        },
        commercial_metrics: {
          sales: Number(candidate.sales) || null,
          ratingStar: rating,
          price: Number(candidate.currentPrice) || null,
          commissionRate: Number(candidate.commissionPercent ?? candidate.commissionRate) || 0,
          sellerCommissionRate: Number(candidate.sellerCommissionRate) || 0,
          effectiveCommissionPercent: row.effectiveCommissionPercent,
          estimatedCommissionPerSale: row.estimatedCommissionPerSale,
        },
        achadinho_metrics: {
          peer_family: row.peer.peerFamily,
          peer_type: row.peer.peerType,
          peer_confidence: row.peer.peerConfidence,
          peer_count: row.peer.peerCount,
          peer_price_median: row.peer.peerPriceMedian,
          price_vs_peer_median_percent: row.peer.priceVsPeerMedianPercent,
          offer_strength: row.offerStrength,
          achadinho_value: row.achadinhoValue,
          catalog_penalty: row.catalogPenalty,
        },
      }],
      inferred_signals: [
        row.offerPriceScore > 0 ? 'peer_price_competitive' : 'peer_price_not_authoritative',
        row.achadinhoValue >= 16 ? 'achadinho_value_strong' : 'achadinho_value_moderate',
      ],
      affiliate_potential: row.commercialValue >= 6 ? 'high' : 'medium',
      visual_content_potential: row.achadinhoBreakdown.demonstrability >= 5 ? 'high' : 'medium',
      recommended_channel: null,
      recommended_format: null,
      match_status: 'pending',
      opportunity_id: null,
      is_focus: priority <= 3,
    };
  });
}

module.exports = {
  ACHADINHO_STRATEGY_VERSION,
  SHOPEE_BROAD_DISCOVERY_CATEGORIES,
  normalizeText,
  collectShopeeMarketplaceCandidates,
  classifyPeerIdentity,
  buildPeerContext,
  scoreShopeeAchadinhoCandidate,
  selectShopeeAchadinhosV12,
  buildShopeePeerScoringPool,
  buildShopeeRadarProductsV12,
};
