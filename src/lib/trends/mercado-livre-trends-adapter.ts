import type { TrendDirection, TrendSignal } from "@/core/trends/types";

const SOURCE = "mercado_livre_trends";
const REGION = "BR";
const SITE_ID = "MLB";

type MercadoLivreTrend = { keyword?: unknown; url?: unknown };

function trendBucket(index: number): "fastest_growing" | "most_wanted" | "most_popular" {
  if (index < 10) return "fastest_growing";
  if (index < 30) return "most_wanted";
  return "most_popular";
}

export function normalizeMercadoLivreTrendsResponse(payload: unknown, observedAt: Date): TrendSignal[] {
  if (!Array.isArray(payload)) return [];
  const capturedAt = observedAt.toISOString();
  const seen = new Set<string>();

  return payload.flatMap((entry: MercadoLivreTrend, index) => {
    const term = typeof entry.keyword === "string" ? entry.keyword.trim() : "";
    const normalizedTerm = term.toLocaleLowerCase("pt-BR");
    if (!term || seen.has(normalizedTerm)) return [];
    seen.add(normalizedTerm);

    const bucket = trendBucket(index);
    const direction: TrendDirection | null = bucket === "fastest_growing" ? "rising" : null;
    return [{
      id: `${SOURCE}:${SITE_ID}:${normalizedTerm}`,
      sourceType: "external",
      sourceName: SOURCE,
      source: SOURCE,
      region: REGION,
      externalId: `${SITE_ID}:${normalizedTerm}`,
      term,
      title: term,
      evidence: {
        rank: index + 1,
        trendBucket: bucket,
        url: typeof entry.url === "string" ? entry.url : null,
        siteId: SITE_ID
      },
      observedAt: capturedAt,
      capturedAt,
      trendStrength: null,
      trendDirection: direction,
      offerId: null
    }];
  });
}

export async function fetchMercadoLivreTrendSignals(accessToken: string, observedAt = new Date()): Promise<TrendSignal[]> {
  const response = await fetch(`https://api.mercadolibre.com/trends/${SITE_ID}`, {
    headers: { accept: "application/json", authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`Mercado Livre Trends respondeu HTTP ${response.status}.`);
  const payload = await response.json();
  return normalizeMercadoLivreTrendsResponse(payload, observedAt);
}
