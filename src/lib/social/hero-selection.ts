export type SocialOfferClassification = "HERO" | "TEST" | "NORMAL" | "SKIP_SOCIAL";

export interface SocialOfferCandidate {
  id: string;
  productName: string;
  marketplace: string;
  currentPrice: number;
  originalPrice: number | null;
  url: string | null;
  category?: string | null;
  evidence?: Record<string, unknown>;
  clusterKey?: string | null;
  publishedRecently?: boolean;
}

export interface SocialOfferDecision {
  id: string;
  classification: SocialOfferClassification;
  score: number;
  reasons: string[];
  penalties: string[];
  clusterKey: string;
}

function flattenEvidence(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value === "number" || typeof value === "boolean") return [String(value)];
  if (Array.isArray(value)) return value.flatMap(flattenEvidence);
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, nested]) => [key, ...flattenEvidence(nested)]);
  }
  return [];
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

function validUrl(value: string | null) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function discountPercentage(currentPrice: number, originalPrice: number | null) {
  if (!(currentPrice > 0) || !originalPrice || originalPrice <= currentPrice) return null;
  return Math.round((1 - currentPrice / originalPrice) * 100);
}

function absoluteSaving(currentPrice: number, originalPrice: number | null) {
  if (!(currentPrice > 0) || !originalPrice || originalPrice <= currentPrice) return null;
  return originalPrice - currentPrice;
}

function inferredCluster(candidate: SocialOfferCandidate) {
  if (candidate.clusterKey?.trim()) return normalize(candidate.clusterKey);
  const words = normalize(candidate.productName)
    .split(" ")
    .filter((word) => word.length >= 4 && !/^(?:para|com|sem|preto|preta|branco|branca|modelo|produto)$/u.test(word));
  return words.slice(0, 5).join(" ") || normalize(candidate.productName);
}

function evidenceSignals(candidate: SocialOfferCandidate) {
  const text = flattenEvidence(candidate.evidence ?? {}).join(" | ");
  const normalized = normalize(text);
  const bestseller = /best seller|bestseller|mais vendido/u.test(normalized);
  const officialStore = /loja oficial|official store|official_store/u.test(normalized);
  const mall = /\bmall\b/u.test(normalized);
  const ratingMatch = text.match(/(?:rating|avalia[cç][aã]o)[^\d]{0,10}(\d(?:[.,]\d)?)/iu);
  const rating = ratingMatch ? Number(ratingMatch[1].replace(",", ".")) : null;
  const salesMatch = text.match(/(?:sales|sold|vendas?|vendidos?)[^\d]{0,12}(\d{2,})/iu);
  const sales = salesMatch ? Number(salesMatch[1]) : null;
  return { bestseller, officialStore, mall, rating, sales };
}

function readabilitySignal(candidate: SocialOfferCandidate) {
  const text = normalize(`${candidate.productName} ${candidate.category ?? ""}`);
  return /mochila|fone|headset|mouse|teclado|camera|cafeteira|airfryer|aspirador|panela|creatina|whey|smartwatch|relogio|bolsa|tenis|controle|microfone/u.test(text);
}

function rawDecision(candidate: SocialOfferCandidate): SocialOfferDecision {
  const reasons: string[] = [];
  const penalties: string[] = [];
  const clusterKey = inferredCluster(candidate);

  if (!(candidate.currentPrice > 0)) {
    return { id: candidate.id, classification: "SKIP_SOCIAL", score: 0, reasons, penalties: ["invalid_price"], clusterKey };
  }
  if (!validUrl(candidate.url)) {
    return { id: candidate.id, classification: "SKIP_SOCIAL", score: 0, reasons, penalties: ["invalid_link"], clusterKey };
  }

  let score = 20;
  reasons.push("valid_identity_price_link");

  if (candidate.currentPrice < 100) {
    score += 18;
    reasons.push("impulse_price_under_100");
  } else if (candidate.currentPrice <= 200) {
    score += 8;
    reasons.push("accessible_price_band");
  }

  const discount = discountPercentage(candidate.currentPrice, candidate.originalPrice);
  const saving = absoluteSaving(candidate.currentPrice, candidate.originalPrice);
  if (discount !== null) {
    if (discount >= 50) {
      score += 24;
      reasons.push("verified_discount_50_plus");
    } else if (discount >= 30) {
      score += 18;
      reasons.push("verified_discount_30_plus");
    } else if (discount >= 15) {
      score += 10;
      reasons.push("verified_discount_15_plus");
    }
  }
  if (saving !== null && saving >= 100) {
    score += 8;
    reasons.push("strong_absolute_saving");
  } else if (saving !== null && saving >= 30) {
    score += 4;
    reasons.push("meaningful_absolute_saving");
  }

  const signals = evidenceSignals(candidate);
  if (signals.bestseller) {
    score += 20;
    reasons.push("marketplace_bestseller");
  }
  if (signals.officialStore || signals.mall) {
    score += 8;
    reasons.push(signals.officialStore ? "official_store" : "mall_store");
  }
  if (signals.rating !== null && signals.rating >= 4.5 && signals.rating <= 5) {
    score += 6;
    reasons.push("strong_marketplace_rating");
  }
  if (signals.sales !== null && signals.sales >= 100) {
    score += 6;
    reasons.push("marketplace_sales_evidence");
  }

  if (readabilitySignal(candidate)) {
    score += 5;
    reasons.push("social_readability");
  }

  if (candidate.publishedRecently === true) {
    score -= 25;
    penalties.push("recent_social_exposure");
  } else {
    score += 5;
    reasons.push("novelty_available");
  }

  const boundedScore = Math.max(0, Math.min(100, score));
  let classification: SocialOfferClassification = "NORMAL";
  if (boundedScore >= 65) classification = "HERO";
  else if (boundedScore >= 45) classification = "TEST";

  return { id: candidate.id, classification, score: boundedScore, reasons, penalties, clusterKey };
}

export function classifySocialOffer(candidate: SocialOfferCandidate): SocialOfferDecision {
  return rawDecision(candidate);
}

export function selectSocialHeroOffers(candidates: readonly SocialOfferCandidate[], maxHeroes = 3): SocialOfferDecision[] {
  const ranked = candidates.map(rawDecision).sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  const heroClusters = new Set<string>();
  let heroCount = 0;

  return ranked.map((decision) => {
    if (decision.classification !== "HERO") return decision;
    if (heroCount >= Math.max(0, maxHeroes)) {
      return { ...decision, classification: "TEST", penalties: [...decision.penalties, "hero_quota_reached"] };
    }
    if (heroClusters.has(decision.clusterKey)) {
      return { ...decision, classification: "TEST", penalties: [...decision.penalties, "duplicate_hero_cluster"] };
    }
    heroCount += 1;
    heroClusters.add(decision.clusterKey);
    return decision;
  });
}
