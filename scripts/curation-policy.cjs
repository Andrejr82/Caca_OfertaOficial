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

const MAIN_PRODUCT_TERMS = /\b(air\s*fryer|cafeteira|batedeira|liquidificador|mixer|sanduicheira|chaleira|panela|processador|forno|televis[aã]o|smart\s*tv|geladeira|refrigerador|m[aá]quina\s*de\s*lavar|lava\s*e\s*seca|lava[-\s]*lou[cç]as|cooktop|micro[-\s]*ondas|ar[-\s]*condicionado|fog[aã]o|sof[aá]|guarda[-\s]*roupa|cama|colch[aã]o|mesa|escrivaninha|cadeira|rack|painel|c[oô]moda|celular|smartphone|notebook|tablet|monitor|console|climatizador|aspirador|t[eê]nis|camiseta|cal[cç]a|moletom|legging|whey|creatina|fralda|mamadeira|carrinho|cama\s*pet|ra[cç][aã]o)\b/i;
const ACCESSORY_ONLY_TERMS = /\b(acess[oó]rio|adaptador|cabo|case|capa|cart[aã]o\s*de\s*mem[oó]ria|controle|filtro|forro|kit\s*limpeza|pel[ií]cula|pe[cç]a|refil|reparo|suporte|tampa|chave|pastilha|protetor|espuma|papel\s*(?:manteiga|antiaderente))\b/i;
const ACCESSORY_LEAD_TERMS = /^(?:acess[oó]rio|adaptador|cabo|case|capa|cart[aã]o\s*de\s*mem[oó]ria|controle|filtro|forro|kit\s*limpeza|pel[ií]cula|pe[cç]a|refil|reparo|suporte|tampa|chave|pastilha|protetor|espuma|papel\s*(?:manteiga|antiaderente)|cesto)\b/i;
const HIGH_VALUE_TERMS = /\b(televis[aã]o|smart\s*tv|geladeira|refrigerador|m[aá]quina\s*de\s*lavar|lava\s*e\s*seca|lava[-\s]*lou[cç]as|cooktop|forno|micro[-\s]*ondas|ar[-\s]*condicionado|fog[aã]o|sof[aá]|guarda[-\s]*roupa|cama|colch[aã]o|mesa|escrivaninha|cadeira|rack|painel|c[oô]moda|notebook|tablet|monitor|console|celular|smartphone|aspirador\s*rob[oô])\b/i;

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
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
  if (/pet|cachorro|gato|bebe|bebe|fralda|mamadeira/.test(text)) return 'pet_baby';
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
  const metrics = product?.marketplaceMetrics || {};
  const discount = discountPercent(product);
  const hasVerifiedCommercialSignal = Boolean(
    metrics.hasVerifiedCoupon || metrics.coupon || metrics.isPrime || metrics.prime
      || metrics.priceAdvantage || metrics.verifiedPromotion || metrics.discount
  );

  if (!titleQuality.valid) reasons.push(titleQuality.reason);
  if (!/^https:\/\//i.test(String(product?.sourceUrl || ''))) reasons.push('LINK_INVALIDO');
  if (!/^https:\/\//i.test(String(product?.imageUrl || ''))) reasons.push('IMAGEM_INVALIDA');
  if (!tier) reasons.push('PRECO_INVALIDO');
  if (ACCESSORY_ONLY_TERMS.test(title) && (!MAIN_PRODUCT_TERMS.test(title) || ACCESSORY_LEAD_TERMS.test(title))) reasons.push('ACESSORIO_OU_CONSUMIVEL');

  if (marketplace === 'shopee') {
    const rating = Number(metrics.rating || 0);
    const sales = Number(metrics.sales || 0);
    if (rating > 0 && rating < 4.7) reasons.push('AVALIACAO_SHOPEE_BAIXA');
    if (sales > 0 && sales < 100) reasons.push('VENDAS_SHOPEE_BAIXAS');
  }

  const hasCommercialData = Boolean(product?.originalPrice != null || metrics.rating != null || metrics.reviewCount != null || hasVerifiedCommercialSignal);

  if (marketplace === 'amazon') {
    if (!hasCommercialData) {
      warnings.push('DADOS_COMERCIAIS_INDISPONIVEIS');
    } else if (discount <= 0 && !hasVerifiedCommercialSignal) {
      reasons.push('AMAZON_SEM_VANTAGEM_COMPROVADA');
    }
  }

  if (hasCommercialData) {
    if (tier === PRICE_TIERS.HIGH && discount < 10 && !hasVerifiedCommercialSignal) reasons.push('ALTO_VALOR_SEM_VANTAGEM');
    if (tier === PRICE_TIERS.MEDIUM && discount < 10 && !hasVerifiedCommercialSignal) reasons.push('VALOR_MEDIO_SEM_VANTAGEM');
    if (tier === PRICE_TIERS.IMPULSE && discount < 10 && !hasVerifiedCommercialSignal && Number(metrics.sales || 0) < 1000) reasons.push('IMPULSO_SEM_VANTAGEM');
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
  };
}

/**
 * qualityScore — OPERACIONAL.
 * Mede integridade estrutural, preço válido, dados confiáveis.
 * Este é o score produtivo. scoreCandidate() é um alias direto.
 */
function qualityScore(product, gate = qualityGate(product)) {
  const metrics = product?.marketplaceMetrics || {};
  const tier = gate.tier || classifyPriceTier(product?.currentPrice);
  const discount = gate.discountPercent;
  const savings = gate.absoluteSavings;
  const base = Math.max(0, Math.min(10, Number(product?.deterministicScore || 0))) * 4;
  const rating = Number(metrics.rating || 0);
  const sales = Number(metrics.sales || 0);
  const officialStore = metrics.officialStoreId || metrics.isOfficialStore || metrics.isMall ? 8 : 0;
  const shipping = metrics.shippingFree || metrics.hasFreeShipping ? 5 : 0;
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
  const trustScore = Math.min(15, (rating >= 4.7 ? 10 : rating >= 4.5 ? 6 : 0) + (sales >= 1000 ? 5 : sales >= 100 ? 2 : 0));

  let penalty = 0;
  if ((gate.warnings || []).includes('DADOS_COMERCIAIS_INDISPONIVEIS')) {
    const rawPenalty = Number(process.env.AMAZON_MISSING_COMMERCIAL_DATA_PENALTY ?? -8);
    penalty = (Number.isFinite(rawPenalty) && rawPenalty <= 0) ? rawPenalty : -8;
  }

  return Number(Math.max(0, base + discountScore + savingsScore + trustScore + officialStore + shipping + penalty).toFixed(2));
}

/**
 * desireScore — OBSERVACIONAL (DESIRE_SCORE_ENABLED=false por padrão).
 * Mede apelo comercial: marca, tendência, rating, avaliações, novidade.
 * NÃO altera o ranking produtivo nesta sprint.
 * Retorna null quando DESIRE_SCORE_ENABLED=false.
 */
function desireScore(product, gate = qualityGate(product)) {
  if (!DESIRE_SCORE_ENABLED) return null;
  const metrics = product?.marketplaceMetrics || {};
  const rating = Number(metrics.rating || 0);
  const reviewCount = Number(metrics.reviewCount || metrics.sales || 0);
  const discount = gate.discountPercent;
  const hasPrime = Boolean(metrics.prime || metrics.isPrime);
  const hasCoupon = Boolean(metrics.coupon || metrics.hasVerifiedCoupon);

  // Componentes experimentais — pesos a calibrar após simulação
  const ratingSignal    = rating >= 4.7 ? 25 : rating >= 4.5 ? 18 : rating >= 4.0 ? 10 : 0;
  const socialProof     = reviewCount >= 5000 ? 20 : reviewCount >= 1000 ? 15 : reviewCount >= 100 ? 8 : 0;
  const discountSignal  = discount >= 30 ? 20 : discount >= 15 ? 12 : discount >= 5 ? 5 : 0;
  const primeSignal     = hasPrime ? 10 : 0;
  const couponSignal    = hasCoupon ? 8 : 0;
  const noveltySignal   = product.novelty === 'NEW' ? 5 : 0;

  return Number((ratingSignal + socialProof + discountSignal + primeSignal + couponSignal + noveltySignal).toFixed(2));
}

/**
 * scoreCandidate — COMPORTAMENTO PRODUTIVO PRESERVADO.
 * É um alias direto para qualityScore().
 * desireScore é calculado internamente mas não afeta o retorno produtivo.
 */
function scoreCandidate(product, gate = qualityGate(product)) {
  // Calcula desire_score de forma observacional (sem efeito no retorno)
  const _desire = desireScore(product, gate);
  if (_desire !== null) {
    // Em ambiente de debug, logar o desire_score observacional
    // (sem console.log para não poluir produção)
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
  qualityGate,
  qualityScore,
  desireScore,
  scoreCandidate,
};
