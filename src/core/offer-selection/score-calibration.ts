import type { CandidateDecisionV2, CandidateScoreV2 } from "./types";

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

export function calibrateCandidateScore(
  candidate: CandidateDecisionV2,
): CandidateScoreV2 {
  const ev = candidate.evidence;
  const isMain = candidate.productRole === "main_product";
  const isClassified = candidate.classification.status === "classified";

  // 1. Semântica (0 a 25)
  const semanticRole = isMain ? 20 : candidate.productRole === "accessory" ? 5 : 0;
  const semanticClass = isClassified ? 5 : 0;
  const semantic = clamp(semanticRole + semanticClass, 0, 25);

  // 2. Evidência e Prova Social (0 a 25)
  const ratingVal = ev.rating ?? 0;
  const ratingScore = ratingVal >= 4.7 ? 10 : ratingVal >= 4.5 ? 7 : ratingVal >= 4.0 ? 4 : 0;

  const socialCount = Math.max(ev.sales ?? 0, ev.reviewCount ?? 0);
  const socialScore = socialCount >= 1000 ? 8 : socialCount >= 100 ? 5 : socialCount > 0 ? 2 : 0;

  const trustScore = (ev.officialStore || ev.prime) ? 7 : 0;
  const evidence = clamp(ratingScore + socialScore + trustScore, 0, 25);

  // 3. Valor Comercial e Economia Real (0 a 25)
  const discountPct = ev.discountPercent ?? 0;
  const discountPoints = ev.discountConfidence === "verified"
    ? Math.min(15, (discountPct / 60) * 15)
    : 3;

  const current = ev.currentPrice;
  const original = ev.originalPrice ?? current;
  const savings = Math.max(0, original - current);
  const savingsScore = savings >= 200 ? 10 : savings >= 50 ? 6 : savings >= 20 ? 3 : 0;
  const value = clamp(discountPoints + savingsScore, 0, 25);

  // 4. Logística e Frete (0 a 15)
  const shippingPoints = ev.shippingFree ? 10 : 3;
  const primePoints = ev.prime ? 5 : 0;
  const logistics = clamp(shippingPoints + primePoints, 0, 15);

  // 5. Freshness e Ciclo (0 a 10)
  const freshState = candidate.freshness.state;
  const freshness = freshState === "new" || freshState === "material_change"
    ? 10
    : freshState === "known_unpublished"
      ? 6
      : 0;

  const total = Number(clamp(semantic + evidence + value + logistics + freshness, 0, 100).toFixed(2));

  return Object.freeze({
    total,
    semantic: Number(semantic.toFixed(2)),
    evidence: Number(evidence.toFixed(2)),
    value: Number(value.toFixed(2)),
    logistics: Number(logistics.toFixed(2)),
    freshness: Number(freshness.toFixed(2)),
    version: "candidate-decision/v2",
  });
}

export function computeCalibratedScoreV2(
  candidate: CandidateDecisionV2,
): CandidateDecisionV2 {
  const score = calibrateCandidateScore(candidate);
  return Object.freeze({
    ...candidate,
    score,
  });
}
