import { describe, expect, it } from "vitest";
import {
  INSTAGRAM_META_FALLBACK_LIMIT_24H,
  evaluateInstagramSafety
} from "@/lib/instagram/safety";
import { fetchInstagramContentPublishingLimit } from "@/lib/instagram/content-publishing-limit";

const now = Date.parse("2026-08-08T12:00:00.000Z");
const caption = "Oferta válida";

describe("Instagram Meta publishing limits", () => {
  it("permits two posts one minute apart", () => {
    const result = evaluateInstagramSafety({
      caption,
      publishedAt: [new Date(now - 60_000).toISOString()],
      recentCaptions: [],
      now,
      metaLimit: { quotaUsage: 1, quotaTotal: 100 }
    });

    expect(result).toEqual({ ok: true });
  });

  it("permits several posts below the official limit", () => {
    const result = evaluateInstagramSafety({
      caption,
      publishedAt: Array.from({ length: 7 }, (_, index) => new Date(now - (index + 1) * 60_000).toISOString()),
      recentCaptions: [],
      now,
      metaLimit: { quotaUsage: 7, quotaTotal: 100 }
    });

    expect(result).toEqual({ ok: true });
  });

  it("blocks when Meta reports the official limit reached", () => {
    const result = evaluateInstagramSafety({
      caption,
      publishedAt: [],
      recentCaptions: [],
      now,
      metaLimit: { quotaUsage: 100, quotaTotal: 100 }
    });

    expect(result).toMatchObject({ ok: false, code: "INSTAGRAM_META_LIMIT" });
    expect(result).toHaveProperty("message", "Limite de publicações via API do Instagram atingido na janela móvel de 24 horas. Utilização: 100/100.");
  });

  it("uses the Meta response as the authority", () => {
    const result = evaluateInstagramSafety({
      caption,
      publishedAt: Array.from({ length: 6 }, () => new Date(now - 60_000).toISOString()),
      recentCaptions: [],
      now,
      metaLimit: { quotaUsage: 99, quotaTotal: 100 }
    });

    expect(result).toEqual({ ok: true });
  });

  it("uses the official-limit local fallback when Meta is unavailable", () => {
    const result = evaluateInstagramSafety({
      caption,
      publishedAt: Array.from({ length: INSTAGRAM_META_FALLBACK_LIMIT_24H }, (_, index) => new Date(now - (index + 1) * 60_000).toISOString()),
      recentCaptions: [],
      now
    });

    expect(result).toMatchObject({ ok: false, code: "INSTAGRAM_META_LIMIT" });
  });

  it("keeps duplicate captions blocked", () => {
    const result = evaluateInstagramSafety({ caption, publishedAt: [], recentCaptions: ["  OFERTA   VÁLIDA "], now });
    expect(result).toMatchObject({ ok: false, code: "INSTAGRAM_DUPLICATE_CAPTION" });
  });

  it("keeps invalid captions blocked", () => {
    const result = evaluateInstagramSafety({ caption: "https://example.com", publishedAt: [], recentCaptions: [], now });
    expect(result).toMatchObject({ ok: false, code: "INSTAGRAM_CAPTION_INVALID" });
  });
});

describe("Instagram content_publishing_limit", () => {
  it("makes the endpoint response available to the publisher", async () => {
    const result = await fetchInstagramContentPublishingLimit("ig-user", "token", async (input) => {
      expect(String(input)).toContain("/ig-user/content_publishing_limit");
      return new Response(JSON.stringify({ data: [{ quota_usage: 12, config: { quota_total: 100 } }] }), { status: 200 });
    });

    expect(result).toEqual({ available: true, quotaUsage: 12, quotaTotal: 100 });
  });

  it("falls back when the endpoint is unavailable", async () => {
    const result = await fetchInstagramContentPublishingLimit("ig-user", "token", async () => {
      throw new Error("network unavailable");
    });

    expect(result).toEqual({ available: false });
  });
});
