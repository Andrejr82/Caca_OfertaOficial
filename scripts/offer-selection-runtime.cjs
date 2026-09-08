"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/core/offer-selection/index.ts
var index_exports = {};
__export(index_exports, {
  MARKETPLACES_V2: () => MARKETPLACES_V2,
  calibrateCandidateScore: () => calibrateCandidateScore,
  computeCalibratedScoreV2: () => computeCalibratedScoreV2,
  computeIdentityGroups: () => computeIdentityGroups,
  deduplicateCandidatesByGroup: () => deduplicateCandidatesByGroup,
  extractEvidence: () => extractEvidence,
  normalizeCandidateToV2: () => normalizeCandidateToV2,
  selectCommercialPortfolioV2: () => selectCommercialPortfolioV2
});
module.exports = __toCommonJS(index_exports);

// src/core/offer-selection/types.ts
var MARKETPLACES_V2 = ["Shopee", "Mercado Livre", "Amazon"];

// src/core/offer-selection/evidence.ts
function firstFiniteNumber(values, { min = 0, max = Number.POSITIVE_INFINITY } = {}) {
  for (const value of values) {
    if (value === null || value === void 0 || value === "") continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= min && parsed <= max) return parsed;
  }
  return null;
}
function extractEvidence(input) {
  const metrics = input.marketplaceMetrics ?? {};
  const raw = input.rawPayload ?? {};
  const marketplace = String(input.marketplace ?? "").trim().toLowerCase();
  const provenance = [];
  const currentPrice = firstFiniteNumber([
    input.currentPrice,
    metrics.price,
    metrics.current_price,
    metrics.currentPrice,
    raw.price
  ], { min: 0.01 }) ?? 0;
  let originalPrice = firstFiniteNumber([
    input.originalPrice,
    metrics.originalPrice,
    metrics.original_price,
    metrics.oldPrice,
    metrics.old_price,
    raw.original_price,
    raw.old_price
  ], { min: 0.01 });
  let discountPercent = null;
  let discountConfidence = "none";
  if (originalPrice !== null && originalPrice > currentPrice && currentPrice > 0) {
    discountPercent = Number(((originalPrice - currentPrice) / originalPrice * 100).toFixed(2));
    const hasPriceEvidence = Boolean(
      metrics.priceHistoryVerified || raw.price_history_verified || metrics.discountPercent || raw.discount_percent
    );
    if (discountPercent > 85 && !hasPriceEvidence) {
      discountConfidence = "unverified";
    } else {
      discountConfidence = "verified";
      provenance.push(`${marketplace}.verified_discount`);
    }
  } else {
    originalPrice = null;
    discountPercent = null;
    discountConfidence = "none";
  }
  const rating = firstFiniteNumber([
    metrics.rating,
    metrics.ratingStar,
    metrics.rating_star,
    raw.rating,
    raw.ratingStar,
    raw.rating_average
  ], { min: 1, max: 5 });
  if (rating !== null) provenance.push(`${marketplace}.rating`);
  const reviewCount = firstFiniteNumber([
    metrics.reviewCount,
    metrics.review_count,
    metrics.reviewsCount,
    raw.review_count,
    raw.reviewCount
  ]);
  if (reviewCount !== null) provenance.push(`${marketplace}.review_count`);
  const sales = firstFiniteNumber([
    metrics.sales,
    metrics.soldQuantity,
    metrics.sold_quantity,
    raw.sold_quantity,
    raw.sales,
    metrics.salesCount
  ]);
  if (sales !== null) {
    provenance.push(
      marketplace === "mercado livre" || marketplace === "mercadolivre" ? "mercadolivre.sold_quantity" : `${marketplace}.sales`
    );
  }
  const shippingFree = metrics.shippingFree === true || metrics.hasFreeShipping === true || raw.shipping_free === true ? true : metrics.shippingFree === false || raw.shipping_free === false ? false : null;
  if (shippingFree === true) provenance.push(`${marketplace}.free_shipping`);
  const isMall = Boolean(metrics.isMall || metrics.is_shopee_mall || raw.is_mall);
  const isOfficial = Boolean(
    metrics.officialStore || metrics.official_store || metrics.isOfficialStore || metrics.is_official_store || metrics.officialStoreId || metrics.official_store_id || raw.official_store_id || isMall
  );
  const officialStore = isOfficial ? true : null;
  if (isMall) provenance.push("shopee.mall");
  if (isOfficial && !isMall) {
    provenance.push(
      marketplace === "mercado livre" || marketplace === "mercadolivre" ? "mercadolivre.official_store" : `${marketplace}.official_store`
    );
  }
  const prime = metrics.prime === true || metrics.isPrime === true || raw.prime === true ? true : null;
  if (prime === true) provenance.push("amazon.prime");
  const coupon = metrics.coupon === true || metrics.hasVerifiedCoupon === true || metrics.hasCoupon === true || raw.coupon === true ? true : null;
  if (coupon === true) provenance.push(`${marketplace}.coupon`);
  const hasExtraCommission = Boolean(
    metrics.hasExtraCommission || metrics.has_extra_commission || raw.has_extra_commission
  );
  if (hasExtraCommission) provenance.push("shopee.extra_commission");
  if (Object.keys(metrics).length > 0) {
    provenance.push(`${marketplace}.metrics`);
  }
  const monetizationValid = Boolean(
    input.prePersistMonetized === true || input.affiliateUrl || metrics.affiliateUrl || metrics.monetizationValid === true
  );
  return Object.freeze({
    currentPrice,
    originalPrice,
    discountPercent,
    discountConfidence,
    rating,
    reviewCount,
    sales,
    shippingFree,
    officialStore,
    prime,
    coupon,
    monetizationValid,
    provenance: Object.freeze([...new Set(provenance)])
  });
}

// src/core/offer-selection/normalize-candidate.ts
function normalizeMarketplaceName(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "amazon") return "Amazon";
  if (text === "shopee") return "Shopee";
  if (text === "mercado livre" || text === "mercadolivre") return "Mercado Livre";
  return "Mercado Livre";
}
function resolveNativeIdentity(marketplace, input) {
  const metrics = input.marketplaceMetrics ?? {};
  const raw = input.rawPayload ?? {};
  if (marketplace === "Amazon") {
    const asin = String(metrics.asin || metrics.product_id || raw.asin || input.sourceItemId || input.nativeIdentity || "").trim();
    return asin;
  }
  if (marketplace === "Mercado Livre") {
    const mlb = String(metrics.item_id || metrics.itemId || raw.id || input.sourceItemId || input.nativeIdentity || "").trim();
    return mlb;
  }
  if (marketplace === "Shopee") {
    const id = String(metrics.shopee_item_id || metrics.itemId || raw.item_id || input.sourceItemId || input.nativeIdentity || "").trim();
    return id;
  }
  return String(input.sourceItemId || input.nativeIdentity || "").trim();
}
function normalizeCandidateToV2(input, options = {}) {
  const marketplace = normalizeMarketplaceName(input.marketplace);
  const nativeIdentity = resolveNativeIdentity(marketplace, input);
  const sourceItemId = String(input.sourceItemId ?? nativeIdentity).trim();
  const evidence = extractEvidence(input);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const title = String(input.title ?? "").trim();
  const sourceUrl = String(input.sourceUrl || input.url || input.link || "").trim();
  const imageUrl = String(input.imageUrl ?? "").trim();
  const intentId = input.intentId || input.intent || null;
  return Object.freeze({
    contractVersion: "candidate-decision/v2",
    candidateId: `${marketplace.toLowerCase()}:${nativeIdentity || sourceItemId}`,
    marketplace,
    nativeIdentity,
    sourceItemId,
    sourceUrl,
    imageUrl,
    title,
    intentId,
    productRole: input.productRole ?? "main_product",
    classification: {
      status: input.classification?.status ?? "classified",
      productType: input.classification?.productType ?? null
    },
    identityGroup: {
      exactKey: `${marketplace.toLowerCase()}|${nativeIdentity}`,
      familyKey: null,
      crossMarketplaceKey: null,
      confidence: 1
    },
    evidence,
    freshness: {
      state: "new",
      eligible: true,
      reason: "initial_admission"
    },
    decision: "selected",
    score: {
      total: 0,
      semantic: 0,
      evidence: 0,
      value: 0,
      logistics: 0,
      freshness: 0,
      version: "candidate-decision/v2"
    },
    reasons: Object.freeze([]),
    trace: Object.freeze({
      correlationId: options.correlationId || "discovery-v2-trace",
      discoveredAt: options.discoveredAt || now,
      evaluatedAt: options.evaluatedAt || now
    })
  });
}

// src/core/offer-selection/score-calibration.ts
function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}
function calibrateCandidateScore(candidate) {
  const ev = candidate.evidence;
  const isMain = candidate.productRole === "main_product";
  const isClassified = candidate.classification.status === "classified";
  const semanticRole = isMain ? 20 : candidate.productRole === "accessory" ? 5 : 0;
  const semanticClass = isClassified ? 5 : 0;
  const semantic = clamp(semanticRole + semanticClass, 0, 25);
  const ratingVal = ev.rating ?? 0;
  const ratingScore = ratingVal >= 4.7 ? 10 : ratingVal >= 4.5 ? 7 : ratingVal >= 4 ? 4 : 0;
  const socialCount = Math.max(ev.sales ?? 0, ev.reviewCount ?? 0);
  const socialScore = socialCount >= 1e3 ? 8 : socialCount >= 100 ? 5 : socialCount > 0 ? 2 : 0;
  const trustScore = ev.officialStore || ev.prime ? 7 : 0;
  const evidence = clamp(ratingScore + socialScore + trustScore, 0, 25);
  const discountPct = ev.discountPercent ?? 0;
  const discountPoints = ev.discountConfidence === "verified" ? Math.min(15, discountPct / 60 * 15) : 3;
  const current = ev.currentPrice;
  const original = ev.originalPrice ?? current;
  const savings = Math.max(0, original - current);
  const savingsScore = savings >= 200 ? 10 : savings >= 50 ? 6 : savings >= 20 ? 3 : 0;
  const value = clamp(discountPoints + savingsScore, 0, 25);
  const shippingPoints = ev.shippingFree ? 10 : 3;
  const primePoints = ev.prime ? 5 : 0;
  const logistics = clamp(shippingPoints + primePoints, 0, 15);
  const freshState = candidate.freshness.state;
  const freshness = freshState === "new" || freshState === "material_change" ? 10 : freshState === "known_unpublished" ? 6 : 0;
  const total = Number(clamp(semantic + evidence + value + logistics + freshness, 0, 100).toFixed(2));
  return Object.freeze({
    total,
    semantic: Number(semantic.toFixed(2)),
    evidence: Number(evidence.toFixed(2)),
    value: Number(value.toFixed(2)),
    logistics: Number(logistics.toFixed(2)),
    freshness: Number(freshness.toFixed(2)),
    version: "candidate-decision/v2"
  });
}
function computeCalibratedScoreV2(candidate) {
  const score = calibrateCandidateScore(candidate);
  return Object.freeze({
    ...candidate,
    score
  });
}

// src/core/offer-selection/identity-groups.ts
var BRANDS = [
  "lg",
  "samsung",
  "kingston",
  "crucial",
  "dell",
  "acer",
  "lenovo",
  "logitech",
  "redragon",
  "mondial",
  "epson",
  "tp-link",
  "tplink",
  "d-link",
  "dlink",
  "mercusys",
  "brother",
  "qcy",
  "jbl",
  "amazfit",
  "electrolux",
  "cadence",
  "olympikus",
  "philips",
  "xiaomi",
  "apple",
  "intel",
  "amd",
  "beelink"
];
function normalizeText(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function computeIdentityGroups(candidate) {
  const normTitle = normalizeText(candidate.title);
  const words = normTitle.split(" ").filter((w) => w.length > 1);
  const brand = BRANDS.find((b) => normTitle.includes(b.replace("-", " ")) || normTitle.includes(b)) ?? "generic";
  const modelMatch = normTitle.match(/\b(ultragear|nv2|aspire\s*5?|ideapad\s*1?|c920s?|kumara|g203|ecotank\s*l\d+|tapo\s*c\d+|t13|go\s*3|bip\s*u|corre\s*3|s12\s*pro|bx500|fobos|es\s*50|ds\s*640|ac12g|tl\s*sg\d+|dgs\s*1016a|afn\s*40|dynamica)\b/i);
  const model = modelMatch ? modelMatch[0].replace(/\s+/g, "") : "";
  const rawSpecs = [];
  const screenMatch = normTitle.match(/\b(1[5-9]|2[0-9]|3[2-9]|4[0-9]|5[0-9]|6[5-9]|7[0-9]|8[5-9])\s*(?:polegadas|pol|"|''|\b)/gi);
  if (screenMatch && (normTitle.includes("monitor") || normTitle.includes("tv") || normTitle.includes("notebook") || normTitle.includes("smart tv"))) {
    const sizeNum = screenMatch[0].match(/\d+/)?.[0];
    if (sizeNum) rawSpecs.push(sizeNum);
  }
  const specMatch = normTitle.match(/\b(\d{1,4}(?:[.,]\d+)?\s*(?:tb|gb|mb|l|ml|w|hz|fps|v|k))\b/gi);
  if (specMatch) {
    for (const s of specMatch) {
      rawSpecs.push(s.replace(/\s+/g, "").toLowerCase());
    }
  }
  const specs = [...new Set(rawSpecs)].sort().join(":");
  const exactKey = `${candidate.marketplace.toLowerCase()}:${candidate.nativeIdentity.toLowerCase().startsWith("b0") ? "asin" : "item"}:${candidate.nativeIdentity.toLowerCase()}`;
  const familyKey = brand !== "generic" && model ? `${brand}:${model}${specs ? `:${specs}` : ""}` : `${brand}:${words.slice(0, 3).join("-")}`;
  const hasHighConfidence = brand !== "generic" && (model.length > 0 || specs.length > 0);
  const confidence = hasHighConfidence ? 90 : 60;
  const crossMarketplaceKey = hasHighConfidence ? `${brand}:${model || "model"}:${specs || "spec"}` : null;
  return Object.freeze({
    exactKey,
    familyKey,
    crossMarketplaceKey,
    confidence
  });
}
function deduplicateCandidatesByGroup(candidates) {
  const groups = /* @__PURE__ */ new Map();
  for (const candidate of candidates) {
    const identity = computeIdentityGroups(candidate);
    const key = identity.crossMarketplaceKey ?? identity.exactKey;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(candidate);
  }
  const selected = [];
  const duplicates = [];
  for (const [groupKey, items] of groups.entries()) {
    items.sort((a, b) => {
      const priceDiff = a.evidence.currentPrice - b.evidence.currentPrice;
      if (Math.abs(priceDiff) > 0.01) return priceDiff;
      const aRating = a.evidence.rating ?? 0;
      const bRating = b.evidence.rating ?? 0;
      return bRating - aRating;
    });
    const winner = items[0];
    selected.push(winner);
    for (let i = 1; i < items.length; i++) {
      const duplicateCandidate = {
        ...items[i],
        decision: "deferred",
        reasons: [
          ...items[i].reasons,
          {
            stage: "deduplication",
            code: "DUPLICATE_GROUP_OFFER",
            message: `Oferta duplicada com menor vantagem em rela\xE7\xE3o ao vencedor ${winner.sourceItemId}`
          }
        ]
      };
      duplicates.push({
        candidate: duplicateCandidate,
        winnerSourceItemId: winner.sourceItemId,
        groupKey
      });
    }
  }
  return { selected, duplicates };
}

// src/core/offer-selection/portfolio-selector.ts
var DEFAULT_LIMITS = Object.freeze({
  maxTotal: 30,
  maxPerMarketplace: 10,
  maxPerCategory: 10,
  maxPerFamily: 1,
  maxPerSeller: 3
});
function selectCommercialPortfolioV2(candidates, options = {}) {
  const limits = { ...DEFAULT_LIMITS, ...options };
  const pool = [...candidates].sort((a, b) => {
    const scoreDiff = b.score.total - a.score.total;
    if (Math.abs(scoreDiff) > 0.01) return scoreDiff;
    const priceDiff = a.evidence.currentPrice - b.evidence.currentPrice;
    if (Math.abs(priceDiff) > 0.01) return priceDiff;
    return a.nativeIdentity.localeCompare(b.nativeIdentity);
  });
  const selected = [];
  const rejected = [];
  const marketplaceCounts = {};
  const categoryCounts = {};
  const familyCounts = {};
  const sellerCounts = {};
  for (const candidate of pool) {
    const marketplace = candidate.marketplace;
    const category = candidate.classification.productType || "geral";
    const identity = computeIdentityGroups(candidate);
    const family = identity.familyKey || identity.exactKey;
    const seller = String(candidate.evidence.provenance[0] || "default_seller");
    let rejectionReason = null;
    if (selected.length >= limits.maxTotal) {
      rejectionReason = "limite_total";
    } else if ((marketplaceCounts[marketplace] || 0) >= limits.maxPerMarketplace) {
      rejectionReason = "limite_marketplace";
    } else if ((categoryCounts[category] || 0) >= limits.maxPerCategory) {
      rejectionReason = "limite_categoria";
    } else if ((familyCounts[family] || 0) >= limits.maxPerFamily) {
      rejectionReason = "limite_familia";
    } else if ((sellerCounts[seller] || 0) >= limits.maxPerSeller) {
      rejectionReason = "limite_vendedor";
    }
    if (rejectionReason) {
      const updatedCandidate = {
        ...candidate,
        decision: "rejected",
        reasons: [
          ...candidate.reasons,
          {
            stage: "portfolio_selection",
            code: rejectionReason.toUpperCase(),
            message: `Rejeitado na sele\xE7\xE3o de portf\xF3lio por: ${rejectionReason}`
          }
        ]
      };
      rejected.push({ candidate: updatedCandidate, reason: rejectionReason });
    } else {
      const updatedCandidate = {
        ...candidate,
        decision: "selected"
      };
      selected.push(updatedCandidate);
      marketplaceCounts[marketplace] = (marketplaceCounts[marketplace] || 0) + 1;
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
      familyCounts[family] = (familyCounts[family] || 0) + 1;
      sellerCounts[seller] = (sellerCounts[seller] || 0) + 1;
    }
  }
  return Object.freeze({
    selected: Object.freeze(selected),
    rejected: Object.freeze(rejected),
    counts: Object.freeze({
      total: selected.length,
      byMarketplace: Object.freeze(marketplaceCounts),
      byCategory: Object.freeze(categoryCounts)
    })
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  MARKETPLACES_V2,
  calibrateCandidateScore,
  computeCalibratedScoreV2,
  computeIdentityGroups,
  deduplicateCandidatesByGroup,
  extractEvidence,
  normalizeCandidateToV2,
  selectCommercialPortfolioV2
});
