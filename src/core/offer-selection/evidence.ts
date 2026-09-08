import type {
  CandidateEvidenceV2,
  DiscountConfidenceV2,
  RawCandidateInput,
} from "./types";

function firstFiniteNumber(
  values: readonly unknown[],
  { min = 0, max = Number.POSITIVE_INFINITY }: { min?: number; max?: number } = {},
): number | null {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= min && parsed <= max) return parsed;
  }
  return null;
}

export function extractEvidence(input: RawCandidateInput): CandidateEvidenceV2 {
  const metrics = (input.marketplaceMetrics ?? {}) as Record<string, unknown>;
  const raw = (input.rawPayload ?? {}) as Record<string, unknown>;
  const marketplace = String(input.marketplace ?? "").trim().toLowerCase();
  const provenance: string[] = [];

  const currentPrice =
    firstFiniteNumber([
      input.currentPrice,
      metrics.price,
      metrics.current_price,
      metrics.currentPrice,
      raw.price,
    ], { min: 0.01 }) ?? 0;

  let originalPrice = firstFiniteNumber([
    input.originalPrice,
    metrics.originalPrice,
    metrics.original_price,
    metrics.oldPrice,
    metrics.old_price,
    raw.original_price,
    raw.old_price,
  ], { min: 0.01 });

  let discountPercent: number | null = null;
  let discountConfidence: DiscountConfidenceV2 = "none";

  if (originalPrice !== null && originalPrice > currentPrice && currentPrice > 0) {
    discountPercent = Number((((originalPrice - currentPrice) / originalPrice) * 100).toFixed(2));
    const hasPriceEvidence = Boolean(
      metrics.priceHistoryVerified ||
      raw.price_history_verified ||
      metrics.discountPercent ||
      raw.discount_percent
    );

    if (discountPercent > 85 && !hasPriceEvidence) {
      discountConfidence = "unverified";
    } else {
      discountConfidence = "verified";
      provenance.push(`${marketplace}.verified_discount`);
    }
  } else {
    // Neutraliza preço anterior inválido ou menor/igual ao atual
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
    raw.rating_average,
  ], { min: 1, max: 5 });
  if (rating !== null) provenance.push(`${marketplace}.rating`);

  const reviewCount = firstFiniteNumber([
    metrics.reviewCount,
    metrics.review_count,
    metrics.reviewsCount,
    raw.review_count,
    raw.reviewCount,
  ]);
  if (reviewCount !== null) provenance.push(`${marketplace}.review_count`);

  const sales = firstFiniteNumber([
    metrics.sales,
    metrics.soldQuantity,
    metrics.sold_quantity,
    raw.sold_quantity,
    raw.sales,
    metrics.salesCount,
  ]);
  if (sales !== null) {
    provenance.push(
      marketplace === "mercado livre" || marketplace === "mercadolivre"
        ? "mercadolivre.sold_quantity"
        : `${marketplace}.sales`
    );
  }

  const shippingFree =
    metrics.shippingFree === true ||
    metrics.hasFreeShipping === true ||
    raw.shipping_free === true
      ? true
      : metrics.shippingFree === false || raw.shipping_free === false
        ? false
        : null;
  if (shippingFree === true) provenance.push(`${marketplace}.free_shipping`);

  const isMall = Boolean(metrics.isMall || metrics.is_shopee_mall || raw.is_mall);
  const isOfficial = Boolean(
    metrics.officialStore ||
    metrics.official_store ||
    metrics.isOfficialStore ||
    metrics.is_official_store ||
    metrics.officialStoreId ||
    metrics.official_store_id ||
    raw.official_store_id ||
    isMall
  );
  const officialStore = isOfficial ? true : null;
  if (isMall) provenance.push("shopee.mall");
  if (isOfficial && !isMall) {
    provenance.push(
      marketplace === "mercado livre" || marketplace === "mercadolivre"
        ? "mercadolivre.official_store"
        : `${marketplace}.official_store`
    );
  }

  const prime =
    metrics.prime === true || metrics.isPrime === true || raw.prime === true
      ? true
      : null;
  if (prime === true) provenance.push("amazon.prime");

  const coupon =
    metrics.coupon === true ||
    metrics.hasVerifiedCoupon === true ||
    metrics.hasCoupon === true ||
    raw.coupon === true
      ? true
      : null;
  if (coupon === true) provenance.push(`${marketplace}.coupon`);

  const hasExtraCommission = Boolean(
    metrics.hasExtraCommission ||
    metrics.has_extra_commission ||
    raw.has_extra_commission
  );
  if (hasExtraCommission) provenance.push("shopee.extra_commission");

  if (Object.keys(metrics).length > 0) {
    provenance.push(`${marketplace}.metrics`);
  }

  const monetizationValid = Boolean(
    input.prePersistMonetized === true ||
    input.affiliateUrl ||
    metrics.affiliateUrl ||
    metrics.monetizationValid === true
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
    provenance: Object.freeze([...new Set(provenance)]),
  });
}
