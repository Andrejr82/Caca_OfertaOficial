import type { TrendOfferCandidate } from "@/core/trends/offer-matching";

export interface TrendCandidateRejection {
  candidateId: string;
  marketplace: string;
  reason: string;
}

export interface TrendCandidateFilterResult {
  accepted: TrendOfferCandidate[];
  rejected: TrendCandidateRejection[];
}

const BLOCKED_RULES = [
  ["regulated_weapon", /\b(?:airsoft|arma|armas|municao|munição|taser|spray de pimenta)\b/i],
  ["regulated_nicotine", /\b(?:vape|cigarro eletronico|cigarro eletrônico|nicotina|pod descartavel|pod descartável)\b/i],
  ["regulated_medication", /\b(?:remedio|remédio|medicamento|minoxidil|anabolizante|injetavel|injetável)\b/i],
  ["adult_product", /\b(?:vibrador|dildo|masturbador|sex shop)\b/i]
] as const;
const ACCESSORY_RULE = /\b(?:capa|capinha|pelicula|case|cabo|carregador|suporte|peca|display|tela|pistao|rodizio|rodizios|rodinhas|ima|cartao|tag|personalizad[oa]?)\b/i;
const GENERIC_TERMS = new Set(["produto", "oferta", "novo", "nova", "kit"]);

function normalize(value: unknown): string {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

function tokens(value: unknown): string[] {
  return normalize(value).match(/[a-z0-9]+/g) ?? [];
}

function httpsUrl(value: unknown): boolean {
  return /^https:\/\//i.test(String(value ?? "").trim());
}

function nativeIdentity(candidate: TrendOfferCandidate): boolean {
  const metrics = candidate.marketplaceMetrics ?? {};
  return candidate.marketplace === "Shopee"
    ? Boolean(candidate.shopeeItemId || candidate.itemId || metrics.shopee_item_id || metrics.itemId)
    : Boolean(candidate.itemId || candidate.productId || metrics.itemId || metrics.item_id || metrics.productId);
}

function rejectionReason(candidate: TrendOfferCandidate, normalizedTerm: string): string | null {
  const searchable = `${candidate.productName} ${candidate.category ?? ""}`;
  if (candidate.marketplace !== "Shopee" && candidate.marketplace !== "Mercado Livre") return "marketplace_invalid";
  for (const [reason, pattern] of BLOCKED_RULES) if (pattern.test(searchable)) return reason;
  const termTokens = tokens(normalizedTerm).filter((token) => token.length >= 3 && !GENERIC_TERMS.has(token));
  const titleTokens = new Set(tokens(candidate.productName));
  if (ACCESSORY_RULE.test(normalize(candidate.productName)) || normalizedTerm.toLocaleLowerCase("pt-BR").includes("smartphone") && !titleTokens.has("smartphone") && !titleTokens.has("celular")) return "accessory_or_variant";
  if (!nativeIdentity(candidate)) return "native_identity_invalid";
  const price = Number(candidate.currentPrice);
  if (!Number.isFinite(price) || price <= 0) return "price_invalid";
  const metrics = candidate.marketplaceMetrics ?? {};
  if (!httpsUrl(metrics.imageUrl)) return "image_invalid";
  if (!httpsUrl(metrics.affiliateUrl)) return "affiliate_url_invalid";
  if (termTokens.length === 0 || termTokens.some((token) => !titleTokens.has(token))) return "term_mismatch";
  return null;
}

export function filterTrendCommercialCandidates(normalizedTerm: string, candidates: TrendOfferCandidate[]): TrendCandidateFilterResult {
  const rejected: TrendCandidateRejection[] = [];
  const accepted = candidates.flatMap((candidate) => {
    const reason = rejectionReason(candidate, normalizedTerm);
    if (reason) {
      rejected.push({ candidateId: candidate.id, marketplace: candidate.marketplace, reason });
      return [];
    }
    return [candidate];
  });
  return { accepted, rejected };
}
