import type { DailyTrendRadarResult } from "@/core/trends/daily-radar";
import {
  calculateCommercialOpportunityScoreV2,
  type VerifiedInternalPerformance,
} from "@/core/trends/commercial-opportunity-score-v2";

export type NicheSignalAcceleration = "rising" | "stable" | "cooling" | "insufficient";

export interface StrongNicheProduct7d {
  productTerm: string;
  normalizedProductTerm: string;
  commercialScore: number;
  evidenceStatus: DailyTrendRadarResult["evidence_status"];
  marketplaces: string[];
}

export interface StrongNiche7d {
  niche: string;
  normalizedNiche: string;
  productCount: number;
  sourceCount: number;
  strengthScore: number;
  confidence: number;
  topProducts: StrongNicheProduct7d[];
  signalCadence: {
    recentObservationCount: number;
    priorObservationCount: number;
    acceleration: NicheSignalAcceleration;
  };
  internalPerformance: {
    productCount: number;
    averageScore: number;
  } | null;
}

export interface StrongestNiches7dOptions {
  asOf: string | Date;
  internalPerformanceByProduct?: Record<string, VerifiedInternalPerformance | undefined>;
  topProductsLimit?: number;
}

interface ScoredObservation {
  result: DailyTrendRadarResult;
  observedAt: Date;
  score: number;
}

function parseDate(value: string | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeLabel(value: string | null): { label: string; key: string } {
  const label = value?.trim() || "Sem categoria";
  return { label, key: label.toLocaleLowerCase("pt-BR") };
}

function sourceCount(observations: ScoredObservation[]): number {
  const types = new Set(observations.flatMap(({ result }) => result.source_types.filter(Boolean))).size;
  const urls = new Set(observations.flatMap(({ result }) => [
    ...result.source_urls.filter(Boolean),
    ...result.direct_evidence
      .map((item) => item.source_url)
      .filter((value): value is string => Boolean(value)),
  ])).size;
  return Math.max(types, urls);
}

function signalCadence(observations: ScoredObservation[], asOf: Date): StrongNiche7d["signalCadence"] {
  let recentObservationCount = 0;
  let priorObservationCount = 0;

  for (const observation of observations) {
    const ageDays = (asOf.getTime() - observation.observedAt.getTime()) / 86_400_000;
    if (ageDays <= 3) recentObservationCount += 1;
    else priorObservationCount += 1;
  }

  let acceleration: NicheSignalAcceleration = "insufficient";
  if (recentObservationCount > 0 && priorObservationCount > 0) {
    const recentDailyRate = recentObservationCount / 3;
    const priorDailyRate = priorObservationCount / 4;
    if (recentDailyRate > priorDailyRate * 1.2) acceleration = "rising";
    else if (recentDailyRate < priorDailyRate * 0.8) acceleration = "cooling";
    else acceleration = "stable";
  }

  return { recentObservationCount, priorObservationCount, acceleration };
}

function internalPerformanceSummary(
  productKeys: string[],
  map: StrongestNiches7dOptions["internalPerformanceByProduct"],
): StrongNiche7d["internalPerformance"] {
  if (!map) return null;
  const verifiedScores = productKeys.flatMap((key) => {
    const value = map[key];
    return value?.verified && Number.isFinite(value.score) ? [clamp(value.score, 0, 15)] : [];
  });
  if (verifiedScores.length === 0) return null;
  return {
    productCount: verifiedScores.length,
    averageScore: round(verifiedScores.reduce((sum, value) => sum + value, 0) / verifiedScores.length),
  };
}

function topProducts(
  observations: ScoredObservation[],
  limit: number,
): StrongNicheProduct7d[] {
  const byProduct = new Map<string, StrongNicheProduct7d>();

  for (const observation of observations) {
    const result = observation.result;
    const key = result.normalized_product_term;
    const current = byProduct.get(key);
    const candidate: StrongNicheProduct7d = {
      productTerm: result.product_term,
      normalizedProductTerm: key,
      commercialScore: observation.score,
      evidenceStatus: result.evidence_status,
      marketplaces: [...new Set(result.marketplaces)].sort((a, b) => a.localeCompare(b, "pt-BR")),
    };
    if (!current || candidate.commercialScore > current.commercialScore) byProduct.set(key, candidate);
  }

  return [...byProduct.values()]
    .sort((a, b) => b.commercialScore - a.commercialScore
      || a.normalizedProductTerm.localeCompare(b.normalizedProductTerm, "pt-BR"))
    .slice(0, limit);
}

export function buildStrongestNiches7d(
  results: DailyTrendRadarResult[],
  options: StrongestNiches7dOptions,
): StrongNiche7d[] {
  const asOf = parseDate(options.asOf);
  if (!asOf) throw new Error("asOf inválido para agregação de nichos.");
  const windowStart = asOf.getTime() - (7 * 86_400_000);
  const groups = new Map<string, { label: string; observations: ScoredObservation[] }>();

  for (const result of results) {
    if (result.evidence_status === "rejected" || result.evidence_status === "unverified" || !result.observed_at) continue;
    const observedAt = parseDate(result.observed_at);
    if (!observedAt || observedAt.getTime() < windowStart || observedAt.getTime() > asOf.getTime()) continue;
    const niche = normalizeLabel(result.category);
    const internalPerformance = options.internalPerformanceByProduct?.[result.normalized_product_term];
    const score = calculateCommercialOpportunityScoreV2(result, { asOf, internalPerformance }).total;
    const group = groups.get(niche.key) ?? { label: niche.label, observations: [] };
    group.observations.push({ result, observedAt, score });
    groups.set(niche.key, group);
  }

  const limit = Math.max(1, Math.floor(options.topProductsLimit ?? 5));
  return [...groups.entries()]
    .map(([normalizedNiche, group]): StrongNiche7d => {
      const products = topProducts(group.observations, limit);
      const productKeys = [...new Set(group.observations.map(({ result }) => result.normalized_product_term))];
      const verifiedCount = group.observations.filter(({ result }) => result.evidence_status === "verified").length;
      const sources = sourceCount(group.observations);
      const confidence = round(clamp(
        (verifiedCount / group.observations.length) * 60
          + (Math.min(sources, 3) / 3) * 25
          + (Math.min(productKeys.length, 3) / 3) * 15,
        0,
        100,
      ));
      const strengthScore = products.length > 0
        ? round(products.reduce((sum, product) => sum + product.commercialScore, 0) / products.length)
        : 0;

      return {
        niche: group.label,
        normalizedNiche,
        productCount: productKeys.length,
        sourceCount: sources,
        strengthScore,
        confidence,
        topProducts: products,
        signalCadence: signalCadence(group.observations, asOf),
        internalPerformance: internalPerformanceSummary(productKeys, options.internalPerformanceByProduct),
      };
    })
    .sort((a, b) => b.strengthScore - a.strengthScore
      || b.confidence - a.confidence
      || a.normalizedNiche.localeCompare(b.normalizedNiche, "pt-BR"));
}
