import type { CopyV4Facts } from "@/core/ai/copy-v4";

export type StoryV5Template = "DISCOUNT_HERO" | "PROOF_HERO" | "PRICE_HERO";
export type StoryV5Reinforcement = "discount" | "proof" | "free_shipping";

export type StoryV5Proof =
  | { kind: "rating"; label: string }
  | { kind: "bestseller"; label: string }
  | { kind: "official_store"; label: string }
  | { kind: "mall"; label: string };

export interface StoryV5Plan {
  template: StoryV5Template;
  commercialTitle: string;
  currentPrice: number;
  originalPrice: number | null;
  discountPercent: number | null;
  savings: number | null;
  proof: StoryV5Proof | null;
  freeShipping: boolean;
  reinforcements: StoryV5Reinforcement[];
  frameCount: 1 | 2 | 3;
}

function normalizedText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(normalizedText).join(" ");
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .flatMap(([key, nested]) => [key, normalizedText(nested)])
      .join(" ");
  }
  return "";
}

function compactTitle(value: string) {
  const normalized = value.replace(/\s+/gu, " ").trim() || "Oferta selecionada";
  if (normalized.length <= 52) return normalized;
  const cut = normalized.lastIndexOf(" ", 52);
  const end = cut >= 28 ? cut : 52;
  return normalized.slice(0, end).replace(/[\s,;:–—-]+$/gu, "");
}

function validPrice(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function pricingFacts(currentPrice: number, originalPrice: number | null) {
  if (!originalPrice || originalPrice <= currentPrice || currentPrice <= 0) {
    return { discountPercent: null, savings: null };
  }

  const savings = originalPrice - currentPrice;
  const discountPercent = Math.round((savings / originalPrice) * 100);
  return { discountPercent, savings };
}

function strongDiscount(discountPercent: number | null, savings: number | null) {
  return Boolean(
    discountPercent !== null &&
    savings !== null &&
    (discountPercent >= 20 || savings >= 30),
  );
}

function numberFromEvidence(evidence: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const raw = evidence[key];
    const number = Number(typeof raw === "string" ? raw.replace(",", ".") : raw);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function proofFromEvidence(evidence: Record<string, unknown>): StoryV5Proof | null {
  const rating = numberFromEvidence(evidence, ["rating", "average_rating", "review_rating", "avaliacao", "avaliação"]);
  if (rating !== null && rating >= 4 && rating <= 5) {
    return {
      kind: "rating",
      label: `${rating.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ★`,
    };
  }

  const text = normalizedText(evidence);
  const semantic = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase("pt-BR");

  const topMatch = text.match(/(?:best[_\s-]?seller|bestseller|mais\s+vendid[oa])[^\d#]{0,24}#?\s*(\d{1,3})/iu);
  if (topMatch) {
    return { kind: "bestseller", label: `Top #${topMatch[1]} entre os mais vendidos` };
  }
  if (/best[_\s-]?seller|bestseller|mais vendido/iu.test(semantic)) {
    return { kind: "bestseller", label: "Entre os mais vendidos" };
  }
  if (/official[_\s-]?store|loja oficial/iu.test(semantic)) {
    return { kind: "official_store", label: "Loja oficial" };
  }
  if (/\bmall\b/iu.test(semantic)) {
    return { kind: "mall", label: "Selo Mall" };
  }
  return null;
}

export function buildStoryV5Plan(facts: CopyV4Facts): StoryV5Plan {
  const currentPrice = validPrice(facts.currentPrice);
  const originalCandidate = validPrice(facts.originalPrice);
  const originalPrice = originalCandidate > currentPrice && currentPrice > 0 ? originalCandidate : null;
  const { discountPercent, savings } = pricingFacts(currentPrice, originalPrice);
  const discountIsStrong = strongDiscount(discountPercent, savings);
  const proof = proofFromEvidence(facts.evidence ?? {});
  const freeShipping = facts.freeShipping === true;

  const reinforcements: StoryV5Reinforcement[] = [];
  if (discountIsStrong) reinforcements.push("discount");
  if (proof) reinforcements.push("proof");
  if (freeShipping) reinforcements.push("free_shipping");

  const template: StoryV5Template = discountIsStrong
    ? "DISCOUNT_HERO"
    : proof
      ? "PROOF_HERO"
      : "PRICE_HERO";

  const frameCount: 1 | 2 | 3 = reinforcements.length >= 2
    ? 3
    : reinforcements.length === 1
      ? 2
      : 1;

  return {
    template,
    commercialTitle: compactTitle(facts.shortName?.trim() || facts.productName),
    currentPrice,
    originalPrice,
    discountPercent,
    savings,
    proof,
    freeShipping,
    reinforcements,
    frameCount,
  };
}
