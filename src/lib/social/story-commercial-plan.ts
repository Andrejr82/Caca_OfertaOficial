import type { CopyV4Facts } from "@/core/ai/copy-v4";

export type StoryCommercialTemplate = "DISCOUNT_HERO" | "PROOF_HERO" | "PRICE_HERO";

export interface StoryCommercialPlan {
  template: StoryCommercialTemplate;
  title: string;
  currentPrice: number;
  originalPrice: number | null;
  discountPercent: number | null;
  savings: number | null;
  proof: string | null;
  freeShipping: boolean;
  frameCount: 1 | 2;
}

function compactTitle(value: string) {
  const normalized = value.replace(/\s+/gu, " ").trim() || "Oferta selecionada";
  if (normalized.length <= 52) return normalized;
  const cut = normalized.lastIndexOf(" ", 52);
  return normalized.slice(0, cut >= 28 ? cut : 52).replace(/[\s,;:–—-]+$/gu, "");
}

function validPrice(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function normalizedEvidence(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(normalizedEvidence).join(" ");
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).map(normalizedEvidence).join(" ");
  return "";
}

function proofFromEvidence(evidence: Record<string, unknown>) {
  const rating = Number(evidence.rating ?? evidence.average_rating ?? evidence.review_rating);
  if (Number.isFinite(rating) && rating >= 4 && rating <= 5) {
    return `${rating.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ★`;
  }

  const text = normalizedEvidence(evidence);
  const top = text.match(/(?:best[_\s-]?seller|bestseller|mais\s+vendid[oa])[^\d#]{0,24}#?\s*(\d{1,3})/iu);
  if (top) return `Top #${top[1]} entre os mais vendidos`;
  if (/best[_\s-]?seller|bestseller|mais vendido/iu.test(text)) return "Entre os mais vendidos";
  if (/official[_\s-]?store|loja oficial/iu.test(text)) return "Loja oficial";
  if (/\bmall\b/iu.test(text)) return "Selo Mall";
  return null;
}

export function buildStoryCommercialPlan(facts: CopyV4Facts): StoryCommercialPlan {
  const currentPrice = validPrice(facts.currentPrice);
  const originalCandidate = validPrice(facts.originalPrice);
  const originalPrice = originalCandidate > currentPrice && currentPrice > 0 ? originalCandidate : null;
  const savings = originalPrice ? originalPrice - currentPrice : null;
  const discountPercent = originalPrice && savings ? Math.round((savings / originalPrice) * 100) : null;
  const discountIsStrong = Boolean(discountPercent !== null && savings !== null && (discountPercent >= 10 || savings >= 30));
  const proof = proofFromEvidence(facts.evidence ?? {});
  const freeShipping = facts.freeShipping === true;

  const template: StoryCommercialTemplate = discountIsStrong
    ? "DISCOUNT_HERO"
    : proof
      ? "PROOF_HERO"
      : "PRICE_HERO";

  // Uma arte forte é o padrão. A segunda só existe quando há um reforço factual
  // adicional além do argumento principal (prova ou frete grátis confirmado).
  const hasExtraReinforcement = template === "DISCOUNT_HERO"
    ? Boolean(proof || freeShipping)
    : template === "PROOF_HERO"
      ? freeShipping
      : false;

  return {
    template,
    title: compactTitle(facts.shortName?.trim() || facts.productName),
    currentPrice,
    originalPrice,
    discountPercent,
    savings,
    proof,
    freeShipping,
    frameCount: hasExtraReinforcement ? 2 : 1,
  };
}
