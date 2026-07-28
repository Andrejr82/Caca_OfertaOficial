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

// src/core/offer-quality/shadow-runtime.ts
var shadow_runtime_exports = {};
__export(shadow_runtime_exports, {
  evaluateDiscoveryShadow: () => evaluateDiscoveryShadow
});
module.exports = __toCommonJS(shadow_runtime_exports);

// src/core/offer-quality/types.ts
function requireText(value, field) {
  const result = String(value ?? "").trim();
  if (!result) throw new Error(`Invalid offer-quality candidate: ${field}`);
  return result;
}
function createOfferQualityCandidate(input) {
  return Object.freeze({
    ...input,
    marketplace: input.marketplace,
    nativeIdentity: requireText(input.nativeIdentity, "nativeIdentity"),
    sourceItemId: requireText(input.sourceItemId, "sourceItemId"),
    title: requireText(input.title, "title"),
    sourceUrl: requireText(input.sourceUrl, "sourceUrl"),
    imageUrl: requireText(input.imageUrl, "imageUrl"),
    currentPrice: Number(input.currentPrice),
    originalPrice: input.originalPrice == null ? null : Number(input.originalPrice),
    marketplaceMetrics: Object.freeze({ ...input.marketplaceMetrics ?? {} }),
    currentFlowStatus: input.currentFlowStatus ?? null
  });
}

// src/core/offer-quality/grouping.ts
var AMAZON_ASIN = /^[A-Z0-9]{10}$/i;
var HTTPS_URL = /^https:\/\//i;
function invalid(...reasons) {
  return { valid: false, code: reasons[0] ?? "invalid_candidate", reasons };
}
function valid() {
  return { valid: true, reasons: [] };
}
function validateNativeIdentity(candidate) {
  const metrics = candidate.marketplaceMetrics ?? {};
  const identity2 = String(candidate.nativeIdentity || "").trim();
  if (!identity2 || /^(null|undefined)$/i.test(identity2) || /https?:\/\//i.test(identity2) || identity2.includes("/")) {
    return invalid("invalid_native_identity");
  }
  if (candidate.marketplace === "Mercado Livre") {
    const itemId = String(metrics.item_id ?? metrics.itemId ?? identity2).trim();
    return itemId && !/^(null|undefined)$/i.test(itemId) ? valid() : invalid("missing_ml_item_id");
  }
  if (candidate.marketplace === "Amazon") {
    const asin = String(metrics.asin ?? metrics.product_id ?? identity2).trim();
    return AMAZON_ASIN.test(asin) ? valid() : invalid("invalid_amazon_asin");
  }
  if (candidate.marketplace === "Shopee") {
    const itemId = String(metrics.itemId ?? metrics.shopee_item_id ?? identity2).trim();
    return itemId && !/^(null|undefined)$/i.test(itemId) ? valid() : invalid("missing_shopee_item_id");
  }
  return invalid("unsupported_marketplace");
}
function validateCandidateBasics(candidate) {
  const reasons = [];
  if (!HTTPS_URL.test(candidate.sourceUrl)) reasons.push("invalid_source_url");
  if (!HTTPS_URL.test(candidate.imageUrl)) reasons.push("invalid_image_url");
  if (candidate.title.trim().length < 5) reasons.push("invalid_title");
  if (!Number.isFinite(candidate.currentPrice) || candidate.currentPrice <= 0) reasons.push("invalid_price");
  if (candidate.originalPrice != null && (!Number.isFinite(candidate.originalPrice) || candidate.originalPrice < candidate.currentPrice)) reasons.push("invalid_original_price");
  return reasons.length ? invalid(...reasons) : valid();
}
function getGroupKey(candidate) {
  const metrics = candidate.marketplaceMetrics ?? {};
  if (candidate.marketplace === "Mercado Livre") {
    const match = candidate.sourceUrl.match(/\/p\/(MLB\d+)/i);
    if (match) {
      return {
        key: `ml:catalog:/p/${match[1].toLowerCase()}`,
        evidence: ["catalog_url"],
        confidence: 100
      };
    }
    return {
      key: `ml:item:${candidate.nativeIdentity.toUpperCase()}`,
      evidence: ["native_item_id"],
      confidence: 100
    };
  }
  if (candidate.marketplace === "Amazon") {
    const asin = String(metrics.asin ?? metrics.product_id ?? candidate.nativeIdentity).toUpperCase();
    return {
      key: `amazon:asin:${asin}`,
      evidence: ["asin"],
      confidence: 100
    };
  }
  const itemId = String(metrics.itemId ?? metrics.shopee_item_id ?? candidate.nativeIdentity);
  const shopId = String(metrics.shopId ?? metrics.shop_id ?? "unknown");
  return {
    key: `shopee:item:${itemId}:shop:${shopId}`,
    evidence: shopId === "unknown" ? ["item_id_without_shop_id"] : ["item_id", "shop_id"],
    confidence: shopId === "unknown" ? 70 : 100
  };
}

// src/core/offer-quality/scoring.ts
var WEIGHTS = Object.freeze({
  price: 25,
  discount: 20,
  trust: 15,
  socialProof: 15,
  logistics: 10,
  desire: 15
});
function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}
function calculateDiscount(candidate) {
  const current = candidate.currentPrice;
  const original = candidate.originalPrice ?? 0;
  if (!(original > current && current > 0)) {
    return { percent: 0, savings: 0, confidence: "none", reason: "no_valid_previous_price" };
  }
  const evidence = candidate.discountEvidence ?? candidate.marketplaceMetrics.priceHistoryVerified;
  return {
    percent: Number(((original - current) / original * 100).toFixed(2)),
    savings: Number((original - current).toFixed(2)),
    confidence: evidence ? "verified" : "unverified",
    reason: evidence ? "explicit_price_evidence" : "mathematical_only"
  };
}
function metricNumber(candidate, ...keys) {
  for (const key of keys) {
    const value = Number(candidate.marketplaceMetrics[key]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return 0;
}
function scoreCandidate(candidate, context = {}) {
  const blockers = [...context.blockers ?? []];
  if (context.monetizationComplete === false) blockers.push("missing_monetization");
  if (!Number.isFinite(candidate.currentPrice) || candidate.currentPrice <= 0) {
    blockers.push("invalid_price");
  }
  const discount = calculateDiscount(candidate);
  if (blockers.length) {
    return {
      total: 0,
      version: "offer-quality-v1",
      price: 0,
      discount: 0,
      trust: 0,
      socialProof: 0,
      logistics: 0,
      desire: 0,
      blockers: [...new Set(blockers)],
      reasons: ["hard_blocker"]
    };
  }
  const price = clamp(WEIGHTS.price * (candidate.currentPrice <= 120 ? 1 : candidate.currentPrice <= 700 ? 0.7 : 0.4));
  const discountPoints = discount.confidence === "verified" ? clamp(discount.percent / 80 * WEIGHTS.discount) : 0;
  const rating = metricNumber(candidate, "rating", "sellerRating");
  const sales = metricNumber(candidate, "sales", "reviewCount", "sellerSales");
  const trust = clamp((rating >= 4.7 ? 1 : rating >= 4.5 ? 0.65 : rating >= 4 ? 0.35 : 0) * WEIGHTS.trust);
  const socialProof = clamp(Math.min(1, Math.log10(sales + 1) / 4) * WEIGHTS.socialProof);
  const logistics = candidate.marketplaceMetrics.shippingFree || candidate.marketplaceMetrics.hasFreeShipping ? WEIGHTS.logistics : WEIGHTS.logistics * 0.25;
  const desire = clamp(
    (discount.confidence === "verified" ? 0.5 : 0.2) * WEIGHTS.desire + (rating >= 4.7 ? 0.5 : 0) + (candidate.currentPrice <= 120 ? 2 : 0)
  );
  const total = Number(clamp(price + discountPoints + trust + socialProof + logistics + desire).toFixed(2));
  return {
    total,
    version: "offer-quality-v1",
    price: Number(price.toFixed(2)),
    discount: Number(discountPoints.toFixed(2)),
    trust: Number(trust.toFixed(2)),
    socialProof: Number(socialProof.toFixed(2)),
    logistics: Number(logistics.toFixed(2)),
    desire: Number(desire.toFixed(2)),
    blockers: [],
    reasons: [
      `discount_confidence=${discount.confidence}`,
      `price=${candidate.currentPrice.toFixed(2)}`
    ]
  };
}
function compareCandidates(a, b) {
  const aScore = scoreCandidate(a).total;
  const bScore = scoreCandidate(b).total;
  if (aScore !== bScore) return bScore - aScore;
  const aDiscount = calculateDiscount(a);
  const bDiscount = calculateDiscount(b);
  if (aDiscount.confidence !== bDiscount.confidence) {
    return aDiscount.confidence === "verified" ? -1 : 1;
  }
  if (a.currentPrice !== b.currentPrice) return a.currentPrice - b.currentPrice;
  return a.nativeIdentity.localeCompare(b.nativeIdentity);
}

// src/core/offer-quality/common-evaluator.ts
var UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
var CHANNELS = ["telegram", "whatsapp", "facebook", "instagram"];
var PREFIXES = { telegram: "tg_", whatsapp: "wp_", facebook: "fb_", instagram: "ig_" };
function validateMonetization(candidate) {
  const links2 = candidate.affiliateLinks ?? [];
  const byChannel = new Map(links2.map((link) => [link.channel, link]));
  if (byChannel.size !== 4 || CHANNELS.some((channel) => !byChannel.has(channel))) return "incomplete";
  for (const channel of CHANNELS) {
    const link = byChannel.get(channel);
    if (!link) return "incomplete";
    const expected = new RegExp("/go/" + PREFIXES[channel] + UUID + "(?:$|[?#])", "i");
    if (!expected.test(link.trackedUrl)) return "incomplete";
  }
  return "complete";
}
function reasonCount(counts, reason) {
  counts[reason] = (counts[reason] ?? 0) + 1;
}
function evaluateCandidates(rawCandidates, options) {
  const decisions = [];
  const rejectionCounts = {};
  const groups = /* @__PURE__ */ new Map();
  for (const raw of rawCandidates) {
    let candidate;
    try {
      candidate = createOfferQualityCandidate(raw);
    } catch (error) {
      const message = error instanceof Error ? error.message : "invalid_candidate";
      reasonCount(rejectionCounts, message);
      continue;
    }
    const basic = validateCandidateBasics(candidate);
    const identity2 = validateNativeIdentity(candidate);
    if (!basic.valid || !identity2.valid) {
      const reasons = [...basic.reasons, ...identity2.reasons];
      reasons.forEach((reason) => reasonCount(rejectionCounts, reason));
      decisions.push({
        candidate,
        decision: "rejected",
        groupKey: null,
        groupEvidence: [],
        winnerSourceItemId: null,
        score: null,
        discount: null,
        monetizationStatus: "not_checked",
        reasons
      });
      continue;
    }
    const group = getGroupKey(candidate);
    const list = groups.get(group.key) ?? [];
    list.push(candidate);
    groups.set(group.key, list);
  }
  for (const [groupKey, candidates] of groups) {
    const ranked = [...candidates].sort((a, b) => {
      const aMonetization = validateMonetization(a) === "complete";
      const bMonetization = validateMonetization(b) === "complete";
      const result = compareCandidates(
        a,
        b
      );
      if (aMonetization !== bMonetization) return aMonetization ? -1 : 1;
      return result;
    });
    const best = ranked[0];
    const groupEvidence = getGroupKey(best).evidence;
    const bestMonetization = validateMonetization(best);
    const bestScore = scoreCandidate(best, { monetizationComplete: bestMonetization === "complete" });
    const bestDecision = {
      candidate: best,
      decision: bestScore.total > 0 && bestMonetization === "complete" ? "winner" : "missing_data",
      groupKey,
      groupEvidence,
      winnerSourceItemId: bestScore.total > 0 && bestMonetization === "complete" ? best.sourceItemId : null,
      score: bestScore,
      discount: calculateDiscount(best),
      monetizationStatus: bestMonetization,
      reasons: bestScore.total > 0 && bestMonetization === "complete" ? [] : ["winner_blocked"]
    };
    decisions.push(bestDecision);
    if (bestDecision.decision === "winner") {
      ranked.slice(1).forEach((candidate) => {
        decisions.push({
          candidate,
          decision: "duplicate",
          groupKey,
          groupEvidence,
          winnerSourceItemId: best.sourceItemId,
          score: scoreCandidate(candidate, { monetizationComplete: validateMonetization(candidate) === "complete" }),
          discount: calculateDiscount(candidate),
          monetizationStatus: validateMonetization(candidate),
          reasons: ["lower_ranked_in_group"]
        });
        reasonCount(rejectionCounts, "duplicate");
      });
    } else {
      ranked.slice(1).forEach((candidate) => {
        const monetizationStatus = validateMonetization(candidate);
        decisions.push({
          candidate,
          decision: "missing_data",
          groupKey,
          groupEvidence,
          winnerSourceItemId: null,
          score: scoreCandidate(candidate, { monetizationComplete: monetizationStatus === "complete" }),
          discount: calculateDiscount(candidate),
          monetizationStatus,
          reasons: ["group_has_no_eligible_winner"]
        });
        reasonCount(rejectionCounts, "missing_data");
      });
      reasonCount(rejectionCounts, "missing_data");
    }
  }
  const winners = decisions.filter((decision) => decision.decision === "winner");
  return Object.freeze({
    runId: options.runId,
    generatedAt: options.generatedAt,
    recordCount: rawCandidates.length,
    decisions: Object.freeze(decisions),
    winners: Object.freeze(winners),
    rejectionCounts: Object.freeze(rejectionCounts),
    groupCount: groups.size,
    persistAttemptCount: 0
  });
}

// src/core/offer-quality/shadow-runtime.ts
var MARKETPLACES = /* @__PURE__ */ new Set(["Mercado Livre", "Amazon", "Shopee"]);
var CHANNELS2 = /* @__PURE__ */ new Set(["telegram", "whatsapp", "facebook", "instagram"]);
function text(value) {
  const result = String(value ?? "").trim();
  return result || null;
}
function normalizeMarketplace(value) {
  const result = text(value);
  return result && MARKETPLACES.has(result) ? result : null;
}
function identity(product, marketplace) {
  const metrics = product.marketplaceMetrics ?? {};
  if (marketplace === "Amazon") return text(metrics.asin) ?? text(product.sourceItemId);
  if (marketplace === "Mercado Livre") return text(metrics.itemId) ?? text(metrics.item_id) ?? text(product.sourceItemId);
  return text(metrics.itemId) ?? text(metrics.shopee_item_id) ?? text(product.sourceItemId);
}
function links(product) {
  return (product.affiliateLinks ?? []).flatMap((link) => {
    const channel = text(link.channel);
    const trackedUrl = text(link.trackedUrl) ?? text(link.tracked_url);
    if (!channel || !CHANNELS2.has(channel) || !trackedUrl) return [];
    return [{ channel, trackedUrl, subId: text(link.subId) ?? text(link.sub_id) }];
  });
}
function toCandidate(product) {
  const marketplace = normalizeMarketplace(product.marketplace);
  if (!marketplace) return null;
  const nativeIdentity = identity(product, marketplace);
  if (!nativeIdentity || !text(product.title) || !text(product.sourceUrl) || !text(product.imageUrl)) return null;
  return {
    marketplace,
    nativeIdentity,
    sourceItemId: nativeIdentity,
    title: text(product.title),
    sourceUrl: text(product.sourceUrl),
    imageUrl: text(product.imageUrl),
    currentPrice: Number(product.currentPrice),
    originalPrice: product.originalPrice == null ? null : Number(product.originalPrice),
    marketplaceMetrics: product.marketplaceMetrics ?? {},
    affiliateLinks: links(product)
  };
}
function evaluateDiscoveryShadow(rawProducts, queue, options) {
  const candidates = rawProducts.map(toCandidate).filter((candidate) => candidate !== null);
  const report = evaluateCandidates(candidates, options);
  const v1Selected = new Set((queue.selected ?? []).map((product) => text(product.sourceItemId)).filter((id) => Boolean(id)));
  const v2Winners = new Set(report.winners.map((decision) => decision.winnerSourceItemId).filter((id) => Boolean(id)));
  const v1Only = [...v1Selected].filter((id) => !v2Winners.has(id)).length;
  const v2Only = [...v2Winners].filter((id) => !v1Selected.has(id)).length;
  return Object.freeze({
    recordCount: candidates.length,
    v1Selected: v1Selected.size,
    v2Winners: v2Winners.size,
    v1Only,
    v2Only,
    groups: report.groupCount,
    rejected: report.decisions.filter((decision) => decision.decision === "rejected").length,
    duplicates: report.decisions.filter((decision) => decision.decision === "duplicate").length,
    incompleteMonetization: report.decisions.filter((decision) => decision.monetizationStatus === "incomplete").length,
    persistAttempts: report.persistAttemptCount
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  evaluateDiscoveryShadow
});
