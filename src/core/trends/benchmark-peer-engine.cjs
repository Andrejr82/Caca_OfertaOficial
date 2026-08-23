'use strict';

/**
 * Radar VNext Benchmark Peer Engine
 *
 * Classificação semântica de famílias funcionais, variantes e quantidades.
 * HIGH >= 5, MEDIUM 3-4, LOW 1-2, NONE 0.
 * Apenas HIGH e MEDIUM são autoritativos para comprovação de preço.
 */

const BENCHMARK_PEER_ENGINE_VERSION = 'benchmark-peer-engine/v2';

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function median(values = []) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

function extractQuantityClass(text) {
  const normalized = normalizeText(text);
  const match = normalized.match(/\b(\d{1,4})\s*(pecas|peca|pares|par|unidades|unidade|itens|item)\b/);
  if (match) {
    const count = Number(match[1]);
    if (count >= 10) return 'bulk';
    if (count >= 2) return `multi_${count}`;
  }
  const matchKit = normalized.match(/\bkit\s*(\d{1,2})\b/);
  if (matchKit) {
    const count = Number(matchKit[1]);
    if (count >= 2) return `multi_${count}`;
  }
  if (/\b(kit|combo|conjunto)\b/.test(normalized)) return 'kit';
  return 'single';
}

function extractVariantClass(text) {
  const normalized = normalizeText(text);
  // Capacity / mAh
  const matchMah = normalized.match(/\b(5000|5\s*000|10000|10\s*000|20000|20\s*000|30000|30\s*000|40000|40\s*000|50000|50\s*000)\s*mah\b/);
  if (matchMah) return `${matchMah[1].replace(/\s+/g, '')}mah`;

  // Bedding thread count & size
  const matchFios = normalized.match(/\b(200|300|400|600|800|1000)\s*fios\b/);
  const bedSize = normalized.match(/\b(solteiro|casal|queen|king|berco)\b/);
  if (matchFios || bedSize) {
    const f = matchFios ? `${matchFios[1]}fios` : 'standard';
    const s = bedSize ? bedSize[1] : 'all';
    return `${f}_${s}`;
  }

  // Tools pieces
  const matchPcs = normalized.match(/\b(40|46|53|82|108|120)\s*(pecas|pcs|soquetes)\b/);
  if (matchPcs) return `${matchPcs[1]}pcs`;

  return 'standard';
}

function extractFunctionalFamily(text) {
  const t = normalizeText(text);

  // Power bank / bateria portátil
  if (/\b(power\s*bank|bateria\s*externa|carregador\s*portatil)\b/.test(t)) {
    return { family: 'power_bank', macro: 'eletronicos' };
  }

  // Fones de ouvido bluetooth / TWS
  if (/\b(fone|auricular|headset|earbuds|airdots)\b.*\b(bluetooth|tws|sem\s*fio)\b|\b(tws|bluetooth)\b.*\b(fone|auricular|headset)\b/.test(t)) {
    return { family: 'fone_bluetooth_tws', macro: 'eletronicos' };
  }

  // Smartwatch / Relógio inteligente
  if (/\b(smartwatch|relogio\s*inteligente|relogio\s*digital\s*smart)\b/.test(t)) {
    return { family: 'smartwatch', macro: 'eletronicos' };
  }

  // Câmera de segurança
  if (/\b(camera|lampada\s*camera)\b.*\b(seguranca|wifi|ip|360|vigilancia)\b/.test(t)) {
    return { family: 'camera_seguranca', macro: 'eletronicos' };
  }

  // Mixer / Misturador elétrico portátil
  if (/\b(mixer|misturador|batedor)\b.*\b(eletrico|portatil|leite|cafe|bebidas)\b/.test(t)) {
    return { family: 'mixer_misturador_portatil', macro: 'casa' };
  }

  // Cama / Jogo de lençol
  if (/\b(lencol|jogo\s*de\s*lencol|jogo\s*de\s*cama|colcha|fronha)\b/.test(t)) {
    return { family: 'jogo_lencol', macro: 'casa' };
  }

  // Ferramentas / Chave catraca
  if (/\b(maleta|jogo|kit)\b.*\b(catraca|ferramenta|soquete|chave\s*catraca)\b|\bchave\s*t\b.*\b(maquina|lavar)\b/.test(t)) {
    return { family: 'jogo_chave_ferramentas', macro: 'ferramentas' };
  }

  // Suporte de TV
  if (/\bsuporte\b.*\b(tv|televisao|monitor)\b/.test(t)) {
    return { family: 'suporte_tv', macro: 'casa' };
  }

  // Suporte / organizador de parede
  if (/\b(suporte|rack|prateleira|porta\s*shampoo)\b.*\b(parede|banheiro|cozinha|adesiv)\b/.test(t)) {
    return { family: 'suporte_organizador_parede', macro: 'casa' };
  }

  // Cordão / Salva celular
  if (/\b(cordao|salva\s*celular|crossbody|strap)\b.*\bcelular\b/.test(t)) {
    return { family: 'cordao_salva_celular', macro: 'eletronicos' };
  }

  // Borrifador de azeite / vinagre
  if (/\b(borrifador|pulverizador|spray|galheteiro)\b.*\b(azeite|oleo|vinagre|culinario)\b/.test(t)) {
    return { family: 'borrifador_azeite', macro: 'casa' };
  }

  // Garrafa motivacional / Squeeze
  if (/\b(garrafa|copo|squeeze)\b.*\b(motivacional|academia|termic|agua)\b/.test(t)) {
    return { family: 'garrafa_squeeze', macro: 'utilidades' };
  }

  // Torneira 360 / Chuveirinho
  if (/\btorneira\b.*\b(360|chuveirinho|arejador|flexivel)\b/.test(t)) {
    return { family: 'torneira_chuveiro_360', macro: 'casa' };
  }

  // Adaptador de tomada
  if (/\b(adaptador|benjamim|pino\s*t)\b.*\b(tomada|articulado|dobravel|eletric)\b/.test(t)) {
    return { family: 'adaptador_tomada', macro: 'casa' };
  }

  // Umidificador / Difusor
  if (/\b(umidificador|difusor|aromatizador)\b.*\b(ar|ambiente|ultrassonico|led)\b/.test(t)) {
    return { family: 'umidificador_ar', macro: 'casa' };
  }

  // Ring light / Iluminador
  if (/\b(ring\s*light|iluminador\s*led|tripe\s*ring)\b/.test(t)) {
    return { family: 'ring_light', macro: 'eletronicos' };
  }

  // Acessórios de cabelo / Elásticos / Xuxinhas
  if (/\b(elastico|xuxinha|rabico|amarrador|presilha|piranha)\b.*\bcabelo\b|\bcabelo\b.*\b(elastico|xuxinha|rabico|amarrador|presilha|piranha)\b|\bxuxinha(s)?\b/.test(t)) {
    return { family: 'elastico_cabelo', macro: 'beleza' };
  }

  // Skincare / Cosméticos
  if (/\b(karseell|mascara\s*capilar|reparador\s*pontas)\b/.test(t)) {
    return { family: 'cabelo_tratamento', macro: 'beleza' };
  }
  if (/\b(serum|roll\s*on|clareador|anti\s*idade|protetor\s*solar)\b.*\b(olho|rosto|facial|pele|virilha|axila)\b/.test(t)) {
    return { family: 'skincare_tratamento', macro: 'beleza' };
  }
  if (/\b(cilios|pestanas|extensao\s*cilios)\b/.test(t)) {
    return { family: 'cilios_estojo', macro: 'beleza' };
  }

  // Vestuário básico
  if (/\bmeia(s)?\b/.test(t) && /\b(kit|par|pares|soquete|invisivel)\b/.test(t)) {
    return { family: 'kit_meias', macro: 'vestuario' };
  }
  if (/\bcueca(s)?\b/.test(t)) {
    return { family: 'kit_cuecas', macro: 'vestuario' };
  }
  if (/\b(camiseta|camisa|t\s*shirt)\b.*\b(basica|algodao|lisa)\b/.test(t)) {
    return { family: 'camiseta_basica', macro: 'vestuario' };
  }

  // Fallback: semantic key extraction (extract first 2 significant noun tokens)
  const stopWords = new Set(['de', 'da', 'do', 'das', 'dos', 'para', 'em', 'com', 'sem', 'e', 'ou', 'por', 'um', 'uma', 'kit', 'par', 'pecas', 'unidades', 'promo', 'oferta', 'original', 'novo', 'pronta', 'entrega', 'envio', 'rapido']);
  const tokens = t.split(' ').filter((w) => w.length > 2 && !stopWords.has(w) && !/^\d+$/.test(w));
  if (tokens.length >= 2) {
    return { family: `semantic_${tokens.slice(0, 2).sort().join('_')}`, macro: 'geral' };
  }

  return { family: 'item_isolado', macro: 'outros' };
}

function classifyBenchmarkFamily(candidate = {}) {
  const title = candidate.productName || candidate.product_term || candidate.title || '';
  const quantityClass = extractQuantityClass(title);
  const variantClass = extractVariantClass(title);
  const { family, macro } = extractFunctionalFamily(title);

  return {
    functionalFamily: family,
    peerFamily: family,
    peerType: family,
    macroGroup: macro,
    variantClass,
    quantityClass,
    familyKey: `${family}:${variantClass}:${quantityClass}`,
  };
}

function sameNativeIdentity(a = {}, b = {}) {
  if (a === b) return true;

  const marketplace = String(a.marketplace || a.platform || b.marketplace || b.platform || '').toLowerCase();
  const aItem = String(a.itemId || a.item_id || '').trim();
  const bItem = String(b.itemId || b.item_id || '').trim();

  if (marketplace.includes('shopee')) {
    const aShop = String(a.shopId || a.shop_id || '').trim();
    const bShop = String(b.shopId || b.shop_id || '').trim();
    return Boolean(aItem && bItem && aShop && bShop && aItem === bItem && aShop === bShop);
  }

  if (aItem && bItem) return aItem === bItem;

  const aProduct = String(a.productId || a.product_id || '').trim();
  const bProduct = String(b.productId || b.product_id || '').trim();
  return Boolean(aProduct && bProduct && aProduct === bProduct);
}

function quantityCompatible(a = {}, b = {}) {
  const qa = a.quantityClass || 'single';
  const qb = b.quantityClass || 'single';
  if (qa === qb) return true;
  if (qa === 'single' || qb === 'single') return false;
  return false;
}

function variantsCompatible(a = {}, b = {}) {
  const va = a.variantClass || 'standard';
  const vb = b.variantClass || 'standard';
  if (va === vb) return true;
  if (va === 'standard' || vb === 'standard') return true;
  return false;
}

function peerConfidenceForCount(peerCount) {
  if (peerCount >= 5) return 'HIGH';
  if (peerCount >= 3) return 'MEDIUM';
  if (peerCount >= 1) return 'LOW';
  return 'NONE';
}

function canonicalOfferKey(candidate = {}) {
  const marketplace = String(candidate.marketplace || candidate.platform || '').trim().toLowerCase();
  const shopId = String(candidate.shopId || candidate.shop_id || '').trim();
  const itemId = String(candidate.itemId || candidate.item_id || '').trim();
  const productId = String(candidate.productId || candidate.product_id || '').trim();

  if (marketplace.includes('shopee') && itemId) {
    return `${marketplace}:${shopId || '0'}:${itemId}`;
  }
  if (productId) return `${marketplace}:p:${productId}`;
  if (itemId) return `${marketplace}:i:${itemId}`;

  return `${marketplace}:t:${String(candidate.productName || candidate.product_term || '').trim().toLowerCase()}`;
}

function createPeerBenchmarkIndex(pool = []) {
  const candidateList = Array.isArray(pool) ? pool.filter(Boolean) : [];
  const peersByFunctionalFamily = new Map();
  const classificationByCandidate = new Map();
  const seenOfferKeys = new Set();

  let classificationCalls = 0;
  let peerComparisonsTotal = 0;

  // 1. Classificação única e indexação em buckets compatíveis O(N)
  for (const candidate of candidateList) {
    classificationCalls += 1;
    const family = classifyBenchmarkFamily(candidate);
    const price = finitePositive(candidate.currentPrice ?? candidate.price);
    const offerKey = canonicalOfferKey(candidate);

    classificationByCandidate.set(candidate, {
      family,
      price,
      offerKey,
    });

    if (price === null || family.functionalFamily === 'item_isolado') {
      continue;
    }

    // Deduplicação nativa no índice de peers para evitar inflação por repetição da mesma oferta
    if (seenOfferKeys.has(offerKey)) {
      continue;
    }
    seenOfferKeys.add(offerKey);

    const bucketKey = family.functionalFamily;
    let bucket = peersByFunctionalFamily.get(bucketKey);
    if (!bucket) {
      bucket = [];
      peersByFunctionalFamily.set(bucketKey, bucket);
    }

    bucket.push({
      candidate,
      family,
      price,
      offerKey,
    });
  }

  // Estatísticas de bucket para observabilidade e testes
  let maxBucketSize = 0;
  let totalBucketItems = 0;
  for (const bucket of peersByFunctionalFamily.values()) {
    if (bucket.length > maxBucketSize) maxBucketSize = bucket.length;
    totalBucketItems += bucket.length;
    peerComparisonsTotal += (bucket.length * (bucket.length - 1));
  }
  const avgBucketSize = peersByFunctionalFamily.size > 0 ? (totalBucketItems / peersByFunctionalFamily.size) : 0;

  return {
    isPeerBenchmarkIndex: true,
    peersByFunctionalFamily,
    classificationByCandidate,
    metrics: {
      candidateCount: candidateList.length,
      uniqueCandidateCount: seenOfferKeys.size,
      classificationCalls,
      peerComparisonsTotal,
      maxBucketSize,
      avgBucketSize,
      bucketCount: peersByFunctionalFamily.size,
    },
  };
}

function buildBenchmarkContext(candidate = {}, poolOrIndex = []) {
  const currentPrice = finitePositive(candidate.currentPrice ?? candidate.price);

  let index = null;
  let family = null;

  if (poolOrIndex && poolOrIndex.isPeerBenchmarkIndex) {
    index = poolOrIndex;
    const cached = index.classificationByCandidate.get(candidate);
    family = cached?.family || classifyBenchmarkFamily(candidate);
  } else {
    family = classifyBenchmarkFamily(candidate);
  }

  const empty = (benchmarkStatus) => ({
    version: BENCHMARK_PEER_ENGINE_VERSION,
    ...family,
    peers: [],
    peerCount: 0,
    peerConfidence: 'NONE',
    peerPriceMin: null,
    peerPriceMedian: null,
    peerPriceMax: null,
    priceVsMedianPercent: null,
    benchmarkStatus,
    priceCompetitive: false,
  });

  if (currentPrice === null) return empty('invalid_price');
  if (family.functionalFamily === 'item_isolado') return empty('unclassified_family');

  let rawPeers = [];
  if (index) {
    const bucket = index.peersByFunctionalFamily.get(family.functionalFamily) || [];
    const targetKey = canonicalOfferKey(candidate);
    for (const item of bucket) {
      if (item.offerKey === targetKey || sameNativeIdentity(candidate, item.candidate)) continue;
      if (quantityCompatible(family, item.family) && variantsCompatible(family, item.family)) {
        rawPeers.push(item.candidate);
      }
    }
  } else {
    const pool = Array.isArray(poolOrIndex) ? poolOrIndex : [];
    rawPeers = pool.filter((other) => {
      if (!other || sameNativeIdentity(candidate, other)) return false;
      const otherPrice = finitePositive(other.currentPrice ?? other.price);
      if (otherPrice === null) return false;

      const otherFamily = classifyBenchmarkFamily(other);
      return otherFamily.functionalFamily === family.functionalFamily
        && quantityCompatible(family, otherFamily)
        && variantsCompatible(family, otherFamily);
    });
  }

  const prices = rawPeers
    .map((peer) => finitePositive(peer.currentPrice ?? peer.price))
    .filter((price) => price !== null);
  const peerCount = prices.length;
  const peerConfidence = peerConfidenceForCount(peerCount);
  const peerPriceMedian = median(prices);
  const priceVsMedianPercent = peerPriceMedian === null
    ? null
    : Math.round((((peerPriceMedian - currentPrice) / peerPriceMedian) * 100) * 10) / 10;
  const authoritative = peerConfidence === 'MEDIUM' || peerConfidence === 'HIGH';

  return {
    version: BENCHMARK_PEER_ENGINE_VERSION,
    ...family,
    peers: rawPeers,
    peerCount,
    peerConfidence,
    peerPriceMin: prices.length ? Math.min(...prices) : null,
    peerPriceMedian,
    peerPriceMax: prices.length ? Math.max(...prices) : null,
    priceVsMedianPercent,
    benchmarkStatus: authoritative ? 'authoritative' : 'insufficient_peers',
    priceCompetitive: authoritative
      && priceVsMedianPercent !== null
      && priceVsMedianPercent >= -15,
  };
}

module.exports = {
  BENCHMARK_PEER_ENGINE_VERSION,
  classifyBenchmarkFamily,
  buildBenchmarkContext,
  createPeerBenchmarkIndex,
  canonicalOfferKey,
  peerConfidenceForCount,
  extractQuantityClass,
  extractVariantClass,
  extractFunctionalFamily,
};
