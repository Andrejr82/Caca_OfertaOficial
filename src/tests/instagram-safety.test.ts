import { describe, expect, it } from "vitest";
import { evaluateInstagramSafety, validateInstagramReelMetadata } from "@/lib/instagram/safety";

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

  it("permite intervalo curto e volume abaixo do limite Meta, mantendo duplicata e URL direta bloqueadas", () => {
    expect(evaluateInstagramSafety({ caption: "Oferta em um minuto", publishedAt: ["2026-07-30T19:59:00.000Z"], recentCaptions: [], now })).toEqual({ ok: true });
    expect(evaluateInstagramSafety({ caption: "Oferta em volume", publishedAt: Array.from({ length: 6 }, () => "2026-07-30T10:00:00.000Z"), recentCaptions: [], now })).toEqual({ ok: true });
    expect(evaluateInstagramSafety({ caption: "Oferta", publishedAt: [], recentCaptions: [" oferta "], now })).toMatchObject({ ok: false, code: "INSTAGRAM_DUPLICATE_CAPTION" });
    expect(evaluateInstagramSafety({ caption: "Oferta https://example.com", publishedAt: [], recentCaptions: [], now })).toMatchObject({ ok: false, code: "INSTAGRAM_CAPTION_INVALID" });
  });

  it("valida metadados operacionais de Reel", () => {
    expect(validateInstagramReelMetadata({ durationSeconds: 30, width: 1080, height: 1920, sizeBytes: 8_000_000, mimeType: "video/mp4" })).toBeNull();
    expect(validateInstagramReelMetadata({ durationSeconds: 2 })).toContain("duração");
    expect(validateInstagramReelMetadata({ width: 1920, height: 1080 })).toContain("Proporção");
    expect(validateInstagramReelMetadata({ sizeBytes: 101 * 1024 * 1024 })).toContain("100 MB");
    expect(validateInstagramReelMetadata({ mimeType: "video/webm" })).toContain("MP4");
  });
});
