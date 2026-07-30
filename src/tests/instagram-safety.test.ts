import { describe, expect, it } from "vitest";
import { evaluateInstagramSafety } from "@/lib/instagram/safety";

describe("Instagram publication safety", () => {
  const now = Date.parse("2026-07-30T20:00:00.000Z");

  it("permite uma publicação válida fora do cooldown", () => {
    expect(evaluateInstagramSafety({
      caption: "Oferta editorial sem link direto",
      publishedAt: ["2026-07-30T18:00:00.000Z"],
      recentCaptions: [],
      now
    })).toEqual({ ok: true });
  });

  it("bloqueia cooldown, excesso diário, duplicata e URL direta", () => {
    expect(evaluateInstagramSafety({ caption: "Oferta", publishedAt: ["2026-07-30T19:45:00.000Z"], recentCaptions: [], now })).toMatchObject({ ok: false, code: "INSTAGRAM_COOLDOWN" });
    expect(evaluateInstagramSafety({ caption: "Oferta", publishedAt: Array.from({ length: 6 }, () => "2026-07-30T10:00:00.000Z"), recentCaptions: [], now })).toMatchObject({ ok: false, code: "INSTAGRAM_DAILY_LIMIT" });
    expect(evaluateInstagramSafety({ caption: "Oferta", publishedAt: [], recentCaptions: [" oferta "], now })).toMatchObject({ ok: false, code: "INSTAGRAM_DUPLICATE_CAPTION" });
    expect(evaluateInstagramSafety({ caption: "Oferta https://example.com", publishedAt: [], recentCaptions: [], now })).toMatchObject({ ok: false, code: "INSTAGRAM_CAPTION_INVALID" });
  });
});
