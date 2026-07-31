import { describe, expect, it } from "vitest";
import { buildImportIdempotencyKey, validateImportRequest } from "@/lib/videos/import/import-job";

describe("import job contract", () => {
  it("accepts only Instagram and Facebook with rights confirmed", () => {
    expect(validateImportRequest({
      offerId: "offer-1",
      sourceUrl: "https://br.shp.ee/fz1a34gu?smtt=0.0.9",
      channels: ["instagram", "facebook"],
      rightsConfirmed: true
    })).toEqual({ ok: true });
  });

  it("rejects missing rights and unsupported channels", () => {
    expect(validateImportRequest({ offerId: "offer-1", sourceUrl: "https://br.shp.ee/video", channels: ["instagram"], rightsConfirmed: false })).toEqual({ ok: false, code: "RIGHTS_CONFIRMATION_REQUIRED" });
    expect(validateImportRequest({ offerId: "offer-1", sourceUrl: "https://br.shp.ee/video", channels: ["telegram"], rightsConfirmed: true })).toEqual({ ok: false, code: "CHANNEL_NOT_ALLOWED" });
    expect(validateImportRequest({ offerId: "offer-1", sourceUrl: "https://br.shp.ee/video", channels: [], rightsConfirmed: true })).toEqual({ ok: false, code: "CHANNEL_REQUIRED" });
  });

  it("normalizes equivalent URLs for idempotency", () => {
    const first = buildImportIdempotencyKey("user-1", "offer-1", "https://br.shp.ee/fz1a34gu?smtt=0.0.9");
    const second = buildImportIdempotencyKey("user-1", "offer-1", "https://BR.SHP.EE/fz1a34gu?smtt=0.0.9");
    expect(first).toBe(second);
    expect(first).toMatch(/^imported-video:[a-f0-9]{64}$/);
  });
});
