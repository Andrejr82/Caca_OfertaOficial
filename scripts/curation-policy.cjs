'use strict';

/**
 * Feature flag: desire_score permanece OBSERVACIONAL nesta sprint.
 * Somente ativado via DESIRE_SCORE_ENABLED=true em ambiente de simulação.
 * NÃO altera o ranking produtivo enquanto false (padrão).
 */
const DESIRE_SCORE_ENABLED = process.env.DESIRE_SCORE_ENABLED === 'true';

const { validateProductTitle } = require('./product-title-quality.cjs');

const PRICE_TIERS = Object.freeze({
  IMPULSE: 'impulse',
  MEDIUM: 'medium',
  HIGH: 'high',
});

const MAIN_PRODUCT_TERMS = /\b(air\s*fryer|cafeteira|batedeira|liquidificador|mixer|sanduicheira|chaleira|panela|processador|forno|televis[aã]o|smart\s*tv|geladeira|refrigerador|m[aá]quina\s*de\s*lavar|lava\s*e\s*seca|lava[-\s]*lou[cç]as|cooktop|micro[-\s]*ondas|ar[-\s]*condicionado|fog[aã]o|sof[aá]|guarda[-\s]*roupa|cama|colch[aã]o|mesa|escrivaninha|cadeira|rack|painel|c[oô]moda|celular|smartphone|notebook|tablet|monitor|console|climatizador|aspirador|t[eê]nis|camiseta|cal[cç]a|moletom|legging|whey|creatina|fralda|mamadeira|carrinho|cama\s*pet|ra[cç][aã])\b/i;
const ACCESSORY_ONLY_TERMS = /\b(acess[oó]rio|adaptador|cabo|case|capa|cart[aã]o\s*de\s*mem[oó]ria|controle|filtro|forro|kit\s*limpeza|pel[ií]cula|pe[cç]a|refil|reparo|suporte|tampa|chave|pastilha|protetor|espuma|papel\s*(?:manteiga|antiaderente))\b/i;
const ACCESSORY_LEAD_TERMS = /^(?:acess[oó]rio|adaptador|cabo|case|capa|cart[aã]o\s*de\s*mem[oó]ria|controle|filtro|forro|kit\s*limpeza|pel[ií]cula|pe[cç]a|refil|reparo|suporte|tampa|chave|pastilha|protetor|espuma|papel\s*(?:manteiga|antiaderente)|cesto)\b/i;
const HIGH_VALUE_TERMS = /\b(televis[aã]o|smart\s*tv|geladeira|refrigerador|m[aá]quina\s*de\s*lavar|lava\s*e\s*seca|lava[-\s]*lou[cç]as|cooktop|forno|micro[-\s]*ondas|ar[-\s]*condicionado|fog[aã]o|sof[aá]|guarda[-\s]*roupa|cama|colch[aã]o|mesa|escrivaninha|cadeira|rack|painel|c[oô]moda|notebook|tablet|monitor|console|celular|smartphone|aspirador\s*rob[oô])\b/i;
const AMAZON_GENERIC_PROMO_QUERIES = new Set(['oferta', 'desconto', 'promocao', 'mais vendido', 'frete gratis']);

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function firstFiniteNumber(values, { min = 0, max = Number.POSITIVE_INFINITY } = {}) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= min && parsed <= max) return parsed;
  }
  return null;
}

function firstPresentValue(values) {
  for (const value of values) {
    if (value !== null && value !== undefined && value !== '') return value;
  }
  return null;
}

function nativeCommercialSignals(product) {
  const metrics = product?.marketplaceMetrics || {};
  const raw = product?.rawPayload || {};
  const marketplace = marketplaceName(product);

  const rating = firstFiniteNumber([
    metrics.rating,
    metrics.ratingStar,
    raw.rating,
    raw.ratingStar,
    raw.rating_average,
  ], { min: 1, max: 5 });
  const reviewCount = firstFiniteNumber([
    metrics.reviewCount,
    metrics.review_count,
    raw.review_count,
    raw.reviewCount,
    raw.reviews?.paging?.total,
  ]);
  const sales = firstFiniteNumber([
    metrics.sales,
    metrics.soldQuantity,
    metrics.sold_quantity,
    raw.sold_quantity,
    raw.sales,
  ]);
  const availableQuantity = firstFiniteNumber([
    metrics.availableQuantity,
    metrics.available_quantity,
    raw.available_quantity,
  ]);
  const discountPercent = firstFiniteNumber([
    metrics.discountPercent,
    metrics.discount,
    raw.discount_percent,
    raw.priceDiscountRate,
  ], { min: 0, max: 100 });
  const officialStoreId = firstPresentValue([
    metrics.officialStoreId,
    metrics.official_store_id,
    raw.official_store_id,
  ]);
  const shippingFree = Boolean(metrics.shippingFree || metrics.hasFreeShipping || raw.shipping_free === true);
  const prime = Boolean(metrics.prime || metrics.isPrime || raw.prime === true);
  const coupon = Boolean(metrics.coupon || metrics.hasVerifiedCoupon || raw.coupon === true);
  const promotion = Boolean(metrics.promotion || metrics.verifiedPromotion || raw.promotion === true);
  const sourcePosition = firstFiniteNumber([
    metrics.sourcePosition,
    metrics.position,
    raw.source_position,
    raw.rank,
  ], { min: 1 });

  const hasSocialProof = rating !== null || reviewCount !== null || sales !== null;
  const hasCommercialEvidence = Boolean(
    product?.originalPrice != null
    || hasSocialProof
    || discountPercent > 0
    || officialStoreId
    || shippingFree
    || prime
    || coupon
    || promotion
  );

  return Object.freeze({
    marketplace,
    rating,
    reviewCount,
    sales,
    availableQuantity,
    discountPercent,
    officialStoreId,
    shippingFree,
    prime,
    coupon,
    promotion,
    sourcePosition,
    hasSocialProof,
    hasCommercialEvidence,
  });
}

function explicitAccessoryIntentMatchesTitle(intent, title) {
  const normalizedIntent = normalizeText(intent);
  const normalizedTitle = normalizeText(title);
  if (!normalizedIntent || !normalizedTitle) return false;

  const intentAccessory = normalizedIntent.match(ACCESSORY_ONLY_TERMS)?.[0];
  if (!intentAccessory) return false;

  const normalizedAccessory = normalizeText(intentAccessory);
  const titleWords = ` ${normalizedTitle.replace(/[^a-z0-9]+/g, ' ')} `;
  const accessoryWords = ` ${normalizedAccessory.replace(/[^a-z0-9]+/g, ' ')} `;
  return titleWords.includes(accessoryWords);
}

function amazonSearchQuery(product) {
  const source = String(product?.rawPayload?.source_url || product?.category?.evidenceUrl || product?.marketplaceMetrics?.browseNodeEvidenceUrl || '');
  if (!source) return '';
  try {
    return normalizeText(new URL(source).searchParams.get('k') || '');
  } catch {
    const match = source.match(/[?&]k=([^&]+)/i);
    return match ? normalizeText(decodeURIComponent(match[1].replace(/\+/g, ' '))) : '';
  }
}

function amazonQueryMatchesProduct(product) {
  const query = amazonSearchQuery(product);
  if (!query) return true;
  const title = normalizeText(product?.title || '');
  if (AMAZON_GENERIC_PROMO_QUERIES.has(query)) return false;

  if (query === 'galaxy') {
    return /\b(?:smartphone|celular|samsung)\b/.test(title) || /\bgalaxy\s+(?:a|m|s|z)\d{1,3}\b/.test(title);
  }
  if (query === 'celular' || query === 'smartphone') {
    if (/\b(?:projetor|projector|capa|case|cabo|carregador|suporte|pelicula|adaptador)\b/.test(title)) return false;
    return /\b(?:smartphone|iphone|redmi|galaxy\s+(?:a|m|s|z)\d{1,3}|celular\s+(?:desbloqueado|android|5g|4g))\b/.test(title);
  }
  if (query === 'tv led') {
    return /\b(?:smart\s*tv|televisao|tv\s+(?:led|4k|uhd|qled|oled|mini\s*led))\b/.test(title);
  }
  if (query === 'halter') {
    if (/\b(?:top|cropped|blusa|vestido|biquini|modelo\s+halter)\b/.test(title)) return false;
    return /\b(?:halter|dumbbell|peso|musculacao|academia)\b/.test(title);
  }

  const significantTokens = query.split(/\s+/).filter((token) => token.length >= 4);
  return significantTokens.length === 0 || significantTokens.some((token) => title.includes(token));
}

function classifyPriceTier(price) {
  const value = Number(price || 0);
  if (value <= 0) return null;
  if (value <= 120) return PRICE_TIERS.IMPULSE;
  if (value <= 700) return PRICE_TIERS.MEDIUM;
  return PRICE_TIERS.HIGH;
}

function classifyProductFamily(product) {
  const text = normalizeText(`${product?.title || ''} ${product?.category?.name || ''}`);
  if (HIGH_VALUE_TERMS.test(text)) {
    if (/televis|smart tv|celular|smartphone|notebook|tablet|monitor|console|aspirador robo/.test(text)) return 'technology_desire';
    if (/sofa|guarda roupa|cama|colchao|mesa|escrivaninha|cadeira|rack|painel|comoda/.test(text)) return 'home_furniture';
    return 'large_appliance';
  }
  if (/pet|cachorro|gato|bebe|fralda|mamadeira/.test(text)) return 'pet_baby';
  if (/tenis|camiseta|calca|moletom|legging|whey|creatina|academia|fitness/.test(text)) return 'fashion_fitness';
  if (/beleza|perfume|skincare|hidratante|maquiagem|secador|chapinha/.test(text)) return 'beauty';
  if (/mala|viagem|camping|trilha/.test(text)) return 'travel';
  return 'impulse_home';
}

function discountPercent(product) {
  const current = Number(product?.currentPrice || 0);
  const original = Number(product?.originalPrice || 0);
  return original > current && current > 0 ? ((original - current) / original) * 100 : 0;
}

function absoluteSavings(product) {
  const current = Number(product?.currentPrice || 0);
  const original = Number(product?.originalPrice || 0);
  return original > current ? original - current : 0;
}

function marketplaceName(product) {
  return normalizeText(product?.marketplace || '');
}

function qualityGate(product) {
  const reasons = [];
  const warnings = [];
  const title = String(product?.title || '').trim();
  const titleQuality = validateProductTitle(title);
  const price = Number(product?.currentPrice || 0);
  const tier = classifyPriceTier(price);
  const marketplace = marketplaceName(product);
  const signals = nativeCommercialSignals(product);
  const discount = Math.max(discountPercent(product), Number(signals.discountPercent || 0));
  const hasVerifiedCommercialSignal = Boolean(
    signals.coupon || signals.prime || signals.promotion || Number(signals.discountPercent || 0) > 0
  );

  if (!titleQuality.valid) reasons.push(titleQuality.reason);
  if (!/^https:\/\//i.test(String(product?.sourceUrl || ''))) reasons.push('LINK_INVALIDO');
  if (!/^https:\/\//i.test(String(product?.imageUrl || ''))) reasons.push('IMAGEM_INVALIDA');
  if (!tier) reasons.push('PRECO_INVALIDO');

  const normalizedTitle = normalizeText(title);
  const explicitSearchIntent = normalizeText(product?.searchIntent || product?.intent || '');
  const explicitIntentMatchesTitle = explicitSearchIntent.length >= 4 && normalizedTitle.includes(explicitSearchIntent);
  const explicitAccessoryMatch = explicitAccessoryIntentMatchesTitle(explicitSearchIntent, normalizedTitle);
  const accessoryAllowedByScenario = product?.allowAccessory === true || explicitIntentMatchesTitle || explicitAccessoryMatch;
  if (!accessoryAllowedByScenario && ACCESSORY_ONLY_TERMS.test(title) && (!MAIN_PRODUCT_TERMS.test(title) || ACCESSORY_LEAD_TERMS.test(title))) reasons.push('ACESSORIO_OU_CONSUMIVEL');

  if (marketplace === 'shopee') {
    const rating = Number(signals.rating || 0);
    const sales = Number(signals.sales || 0);
    if (rating > 0 && rating < 4.7) reasons.push('AVALIACAO_SHOPEE_BAIXA');
    if (sales > 0 && sales < 100) reasons.push('VENDAS_SHOPEE_BAIXAS');
  }

  if (marketplace === 'mercado livre') {
    if (signals.availableQuantity === 0) reasons.push('MERCADO_LIVRE_SEM_ESTOQUE');
    if (signals.rating !== null && signals.reviewCount !== null && signals.reviewCount >= 10 && signals.rating < 4.4) {
      reasons.push('MERCADO_LIVRE_AVALIACAO_BAIXA');
    }
    if (!signals.hasSocialProof && !hasVerifiedCommercialSignal && !signals.officialStoreId) {
      warnings.push('MERCADO_LIVRE_EVIDENCIA_COMERCIAL_FRACA');
    }
  }

  const hasCommercialData = signals.hasCommercialEvidence;

  if (marketplace === 'amazon') {
    if (!amazonQueryMatchesProduct(product)) reasons.push('AMAZON_INTENCAO_INCOMPATIVEL');
    const rating = Number(signals.rating || 0);
    if (rating > 0 && rating < 4.0) reasons.push('AMAZON_AVALIACAO_BAIXA');

    if (!hasCommercialData) {
      warnings.push('DADOS_COMERCIAIS_INDISPONIVEIS');
    } else if (discount <= 0 && !hasVerifiedCommercialSignal) {
      warnings.push('AMAZON_SEM_VANTAGEM_COMPROVADA');
    }
  }

  if (hasCommercialData) {
    if (tier === PRICE_TIERS.HIGH && discount < 10 && !hasVerifiedCommercialSignal) warnings.push('ALTO_VALOR_SEM_VANTAGEM');
    if (tier === PRICE_TIERS.MEDIUM && discount < 10 && !hasVerifiedCommercialSignal) warnings.push('VALOR_MEDIO_SEM_VANTAGEM');
    if (tier === PRICE_TIERS.IMPULSE && discount < 10 && !hasVerifiedCommercialSignal && Number(signals.sales || 0) < 1000) warnings.push('IMPULSO_SEM_VANTAGEM');
  } else {
    warnings.push('AVALIACAO_DE_VANTAGEM_INDISPONIVEL');
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    warnings,
    tier,
    family: classifyProductFamily(product),
    discountPercent: Number(discount.toFixed(2)),
    absoluteSavings: Number(absoluteSavings(product).toFixed(2)),
    commercialEvidence: signals,
  };
}

function qualityScore(product, gate = qualityGate(product)) {
  const signals = gate.commercialEvidence || nativeCommercialSignals(product);
  const tier = gate.tier || classifyPriceTier(product?.currentPrice);
  const discount = gate.discountPercent;
  const savings = gate.absoluteSavings;
  const base = Math.max(0, Math.min(10, Number(product?.deterministicScore || 0))) * 4;
  const rating = Number(signals.rating || 0);
  const socialProofCount = Math.max(Number(signals.sales || 0), Number(signals.reviewCount || 0));
  const officialStore = signals.officialStoreId ? 8 : 0;
  const shipping = signals.shippingFree ? 5 : 0;
  const discountScore = tier === PRICE_TIERS.HIGH
    ? Math.min(20, discount * 0.5)
    : tier === PRICE_TIERS.MEDIUM
      ? Math.min(22, discount * 0.6)
      : Math.min(18, discount * 0.35);
  const savingsScore = tier === PRICE_TIERS.HIGH
    ? (savings >= 1000 ? 30 : savings >= 500 ? 24 : savings >= 250 ? 18 : savings >= 100 ? 12 : 0)
    : tier === PRICE_TIERS.MEDIUM
      ? Math.min(15, savings / 100)
      : Math.min(8, discount * 0.2);
  const trustScore = Math.min(15, (rating >= 4.7 ? 10 : rating >= 4.5 ? 6 : 0) + (socialProofCount >= 1000 ? 5 : socialProofCount >= 100 ? 2 : 0));

  let penalty = 0;
  if ((gate.warnings || []).includes('DADOS_COMERCIAIS_INDISPONIVEIS')) {
    const rawPenalty = Number(process.env.AMAZON_MISSING_COMMERCIAL_DATA_PENALTY ?? -8);
    penalty += (Number.isFinite(rawPenalty) && rawPenalty <= 0) ? rawPenalty : -8;
  }
  if ((gate.warnings || []).includes('MERCADO_LIVRE_EVIDENCIA_COMERCIAL_FRACA')) {
    const rawPenalty = Number(process.env.MERCADO_LIVRE_WEAK_COMMERCIAL_EVIDENCE_PENALTY ?? -8);
    penalty += (Number.isFinite(rawPenalty) && rawPenalty <= 0) ? rawPenalty : -8;
  }

  return Number(Math.max(0, base + discountScore + savingsScore + trustScore + officialStore + shipping + penalty).toFixed(2));
}

function desireScore(product, gate = qualityGate(product)) {
  if (!DESIRE_SCORE_ENABLED) return null;
  const signals = gate.commercialEvidence || nativeCommercialSignals(product);
  const rating = Number(signals.rating || 0);
  const reviewCount = Math.max(Number(signals.reviewCount || 0), Number(signals.sales || 0));
  const discount = gate.discountPercent;
  const hasPrime = signals.prime;
  const hasCoupon = signals.coupon;

  const ratingSignal = rating >= 4.7 ? 25 : rating >= 4.5 ? 18 : rating >= 4.0 ? 10 : 0;
  const socialProof = reviewCount >= 5000 ? 20 : reviewCount >= 1000 ? 15 : reviewCount >= 100 ? 8 : 0;
  const discountSignal = discount >= 30 ? 20 : discount >= 15 ? 12 : discount >= 5 ? 5 : 0;
  const primeSignal = hasPrime ? 10 : 0;
  const couponSignal = hasCoupon ? 8 : 0;
  const noveltySignal = product.novelty === 'NEW' ? 5 : 0;

  return Number((ratingSignal + socialProof + discountSignal + primeSignal + couponSignal + noveltySignal).toFixed(2));
}

function scoreCandidate(product, gate = qualityGate(product)) {
  const _desire = desireScore(product, gate);
  if (_desire !== null) {
    // Observacional: não altera retorno produtivo.
  }
  return qualityScore(product, gate);
}

module.exports = {
  DESIRE_SCORE_ENABLED,
  PRICE_TIERS,
  classifyPriceTier,
  classifyProductFamily,
  discountPercent,
  absoluteSavings,
  amazonSearchQuery,
  amazonQueryMatchesProduct,
  explicitAccessoryIntentMatchesTitle,
  nativeCommercialSignals,
  qualityGate,
  qualityScore,
  desireScore,
  scoreCandidate,
};
