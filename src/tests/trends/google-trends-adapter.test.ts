import { describe, expect, it } from "vitest";
import { normalizeGoogleTrendsResponse, normalizeGoogleTrendsRss } from "@/lib/trends/google-trends-adapter";

describe("Google Trends adapter", () => {
  it("normaliza dailyTrends BR em sinais sem criar associação de oferta", () => {
    const signals = normalizeGoogleTrendsResponse({
      default: { trendingSearchesDays: [{ trendingSearches: [{ title: { query: "air fryer", exploreLink: "/trends/explore?q=air+fryer" }, formattedTraffic: "100K+" }] }] }
    }, new Date("2026-08-10T12:00:00.000Z"));
    expect(signals[0]).toMatchObject({ term: "air fryer", source: "google_trends", region: "BR", trendStrength: 100000, trendDirection: "rising", offerId: null });
  });

  it("normaliza o RSS oficial do Google Trends", () => {
    const signals = normalizeGoogleTrendsRss("<?xml version=\"1.0\"?><rss><channel><item><title>latam airlines brasil</title><ht:approx_traffic>500+</ht:approx_traffic><pubDate>Mon, 10 Aug 2026 09:30:00 -0700</pubDate><link>https://trends.google.com/trending/story/1</link></item></channel></rss>", new Date("2026-08-10T12:00:00.000Z"));
    expect(signals[0]).toMatchObject({ term: "latam airlines brasil", source: "google_trends", region: "BR", trendStrength: 500, trendDirection: "rising" });
  });

  it("ignora entradas sem termo", () => {
    expect(normalizeGoogleTrendsResponse({ default: { trendingSearchesDays: [{ trendingSearches: [{ title: {} }] }] } }, new Date())).toEqual([]);
  });
});
