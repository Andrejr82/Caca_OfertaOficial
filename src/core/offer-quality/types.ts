export const OFFER_QUALITY_MARKETPLACES = [
  "Mercado Livre",
  "Amazon",
  "Shopee",
] as const;

export type OfferQualityMarketplace = (typeof OFFER_QUALITY_MARKETPLACES)[number];
export type DecisionKind = "winner" | "rejected" | "duplicate" | "missing_data";
export type DiscountConfidence = "verified" | "unverified" | "none";
export type MonetizationStatus = "complete" | "incomplete" | "not_checked";

export interface OfferQualityCandidateInput {
  marketplace: OfferQualityMarketplace;
  nativeIdentity?: string | null;
  sourceItemId?: string | null;
  title: string;
  sourceUrl: string;
  imageUrl: string;
  currentPrice: number;
  originalPrice?: number | null;
  marketplaceMetrics?: Readonly<Record<string, unknown>>;
  currentFlowStatus?: string | null;
  discountEvidence?: Readonly<Record<string, unknown>> | null;
  affiliateLinks?: readonly OfferQualityAffiliateLink[];
}

export interface OfferQualityCandidate extends OfferQualityCandidateInput {
  nativeIdentity: string;
  sourceItemId: string;
  originalPrice: number | null;
  marketplaceMetrics: Readonly<Record<string, unknown>>;
  currentFlowStatus: string | null;
}

export interface OfferQualityAffiliateLink {
  channel: "telegram" | "whatsapp" | "facebook" | "instagram";
  trackedUrl: string;
  subId?: string | null;
}

export interface ValidationResult {
  valid: boolean;
  code?: string;
  reasons: readonly string[];
}

export interface GroupKeyResult {
  key: string;
  evidence: readonly string[];
  confidence: number;
}

export interface DiscountResult {
  percent: number;
  savings: number;
  confidence: DiscountConfidence;
  reason: string;
}

export interface ScoreBreakdown {
  total: number;
  version: "offer-quality-v1";
  price: number;
  discount: number;
  trust: number;
  socialProof: number;
  logistics: number;
  desire: number;
  blockers: readonly string[];
  reasons: readonly string[];
}

export interface OfferQualityDecision {
  candidate: OfferQualityCandidate;
  decision: DecisionKind;
  groupKey: string | null;
  groupEvidence: readonly string[];
  winnerSourceItemId: string | null;
  score: ScoreBreakdown | null;
  discount: DiscountResult | null;
  monetizationStatus: MonetizationStatus;
  reasons: readonly string[];
}

export interface OfferQualityReport {
  runId: string;
  generatedAt: string;
  recordCount: number;
  decisions: readonly OfferQualityDecision[];
  winners: readonly OfferQualityDecision[];
  rejectionCounts: Readonly<Record<string, number>>;
  groupCount: number;
  persistAttemptCount: 0;
}

function requireText(value: unknown, field: string): string {
  const result = String(value ?? "").trim();
  if (!result) throw new Error(`Invalid offer-quality candidate: ${field}`);
  return result;
}

export function createOfferQualityCandidate(input: OfferQualityCandidateInput): OfferQualityCandidate {
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
    marketplaceMetrics: Object.freeze({ ...(input.marketplaceMetrics ?? {}) }),
    currentFlowStatus: input.currentFlowStatus ?? null,
  });
}

export function createEmptyOfferQualityReport(input: {
  runId: string;
  generatedAt: string;
}): OfferQualityReport {
  return Object.freeze({
    runId: requireText(input.runId, "runId"),
    generatedAt: requireText(input.generatedAt, "generatedAt"),
    recordCount: 0,
    decisions: Object.freeze([]),
    winners: Object.freeze([]),
    rejectionCounts: Object.freeze({}),
    groupCount: 0,
    persistAttemptCount: 0,
  });
}
