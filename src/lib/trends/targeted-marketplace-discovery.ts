import type { TrendMatchingMarketplace, TrendOfferCandidate } from "@/core/trends/offer-matching";

export type MarketplaceDiscoveryStatus = "found" | "no_candidates" | "source_unavailable";

export interface TargetedMarketplaceDiscovery {
  candidates: TrendOfferCandidate[];
  query_used: string[];
  source: "shopee_v1_official" | "mercado_livre_official";
  discovery_status: MarketplaceDiscoveryStatus;
}

export interface DiscoverMarketplaceCandidatesInput {
  marketplace: TrendMatchingMarketplace;
  normalizedProductTerm: string;
  productIdentity: string;
  queryVariants?: string[];
  searchShopee?: (query: string) => Promise<TrendOfferCandidate[]>;
  searchMercadoLivre?: (query: string) => Promise<TrendOfferCandidate[]>;
}

function canonicalTokens(value: string): string[] {
  return value
    .replace(/\b(\d{1,3}(?:[.,]\d{3})+)\b/g, (group) => group.replace(/[.,]/g, ""))
    .match(/[\p{L}0-9]+/gu) ?? [];
}

function isIdentityToken(value: string) {
  return /\d/.test(value);
}

/**
 * Expands coverage only. The complete normalized identity remains the sole
 * authority for matching after discovery.
 */
export function expandMarketplaceQueries(normalizedProductTerm: string): string[] {
  const tokens = canonicalTokens(normalizedProductTerm);
  const complete = tokens.join(" ").replace(/(\d+)\s+(mah|gb|tb|w|v|l|ml|kg|g)$/i, "$1$2");
  const identityIndex = tokens.findIndex(isIdentityToken);
  if (!complete || identityIndex < 0) return complete ? [complete] : [];

  const identity = tokens[identityIndex];
  const before = tokens.slice(Math.max(0, identityIndex - 2), identityIndex);
  const nextUnit = tokens[identityIndex + 1] && /^(mah|gb|tb|w|v|l|ml|kg|g)$/i.test(tokens[identityIndex + 1])
    ? tokens[identityIndex + 1]
    : null;
  const brandModel = [...before, `${identity}${nextUnit ?? ""}`].join(" ");
  return [...new Set([complete, brandModel, identity].filter(Boolean))].slice(0, 3);
}

export async function discoverMarketplaceCandidates(input: DiscoverMarketplaceCandidatesInput): Promise<TargetedMarketplaceDiscovery> {
  const query_used = input.queryVariants?.length
    ? [...new Set(input.queryVariants.map((query) => query.trim()).filter(Boolean))].slice(0, 3)
    : expandMarketplaceQueries(input.normalizedProductTerm || input.productIdentity);
  const source = input.marketplace === "Shopee" ? "shopee_v1_official" : "mercado_livre_official";
  const search = input.marketplace === "Shopee" ? input.searchShopee : input.searchMercadoLivre;
  if (!search || query_used.length === 0) return { candidates: [], query_used, source, discovery_status: "source_unavailable" };

  try {
    const responses = await Promise.all(query_used.map((query) => search(query)));
    const seen = new Set<string>();
    const candidates = responses.flat().filter((candidate) => {
      const key = `${candidate.marketplace}:${candidate.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return { candidates, query_used, source, discovery_status: candidates.length ? "found" : "no_candidates" };
  } catch {
    return { candidates: [], query_used, source, discovery_status: "source_unavailable" };
  }
}
