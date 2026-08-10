import { load } from "cheerio";
import type { TrendDirection, TrendSignal } from "@/core/trends/types";

const SOURCE = "google_trends";
const REGION = "BR";

function parseTraffic(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/\s/g, "").replace(/,/g, ".");
  const match = normalized.match(/^([\d.]+)(k|m|b|mil|mi)?\+?$/);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  const multiplier = match[2] === "k" || match[2] === "mil" ? 1_000 : match[2] === "m" || match[2] === "mi" ? 1_000_000 : match[2] === "b" ? 1_000_000_000 : 1;
  return amount * multiplier;
}

function dayEntries(payload: any): any[] {
  return Array.isArray(payload?.default?.trendingSearchesDays)
    ? payload.default.trendingSearchesDays.flatMap((day: any) => Array.isArray(day?.trendingSearches) ? day.trendingSearches : [])
    : [];
}

export function normalizeGoogleTrendsResponse(payload: unknown, observedAt: Date): TrendSignal[] {
  return dayEntries(payload).flatMap((entry: any, index) => {
    const term = typeof entry?.title?.query === "string" ? entry.title.query.trim() : "";
    if (!term) return [];

    const capturedAt = observedAt.toISOString();
    return [{
      id: `google-trends:${REGION}:${term.toLowerCase()}:${capturedAt.slice(0, 10)}`,
      sourceType: "external",
      sourceName: SOURCE,
      source: SOURCE,
      region: REGION,
      externalId: `${term}:${capturedAt.slice(0, 10)}`,
      term,
      title: term,
      evidence: {
        rank: index + 1,
        formattedTraffic: entry.formattedTraffic || null,
        exploreLink: entry.title?.exploreLink || null,
        relatedQueries: entry.relatedQueries || [],
        articles: entry.articles || []
      },
      observedAt: capturedAt,
      capturedAt,
      trendStrength: parseTraffic(entry.formattedTraffic),
      trendDirection: "rising",
      offerId: null
    }];
  });
}

export function normalizeGoogleTrendsRss(xml: string, observedAt: Date): TrendSignal[] {
  const parser = load(xml, { xmlMode: true });
  const items = parser("item").toArray();
  const capturedAt = observedAt.toISOString();

  return items.flatMap((item, index) => {
    const node = parser(item);
    const term = node.find("title").first().text().trim();
    if (!term) return [];
    const formattedTraffic = node.find("ht\\:approx_traffic").first().text().trim();
    const pubDate = node.find("pubDate").first().text().trim() || null;
    const link = node.find("link").first().text().trim() || null;

    return [{
      id: `google-trends:${REGION}:${term.toLowerCase()}:${capturedAt.slice(0, 10)}`,
      sourceType: "external",
      sourceName: SOURCE,
      source: SOURCE,
      region: REGION,
      externalId: `${term}:${capturedAt.slice(0, 10)}`,
      term,
      title: term,
      evidence: { rank: index + 1, formattedTraffic: formattedTraffic || null, pubDate, link },
      observedAt: capturedAt,
      capturedAt,
      trendStrength: parseTraffic(formattedTraffic),
      trendDirection: "rising" as TrendDirection,
      offerId: null
    }];
  });
}

export async function fetchGoogleTrendSignals(observedAt = new Date()): Promise<TrendSignal[]> {
  const response = await fetch(`https://trends.google.com/trending/rss?geo=${REGION}`, {
    headers: { accept: "application/rss+xml, application/xml, text/xml" },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`Google Trends RSS respondeu HTTP ${response.status}.`);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("xml")) throw new Error("Google Trends RSS retornou formato inesperado.");
  return normalizeGoogleTrendsRss(await response.text(), observedAt);
}
