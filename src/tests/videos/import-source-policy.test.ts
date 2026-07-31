import { describe, expect, it } from "vitest";
import {
  assertSafeContentType,
  isAllowedRedirectHost,
  validateMediaSignature,
  validateSourceUrl
} from "@/lib/videos/import/source-policy";

describe("imported video source policy", () => {
  it("accepts the Shopee short-link host", () => {
    expect(validateSourceUrl("https://br.shp.ee/fz1a34gu?smtt=0.0.9")).toEqual({ ok: true });
  });

  it("rejects non-HTTPS URLs and embedded credentials", () => {
    expect(validateSourceUrl("http://br.shp.ee/video")).toEqual({ ok: false, code: "HTTPS_REQUIRED" });
    expect(validateSourceUrl("https://user:pass@br.shp.ee/video")).toEqual({ ok: false, code: "EMBEDDED_CREDENTIALS" });
  });

  it("rejects unsupported hosts and unsafe redirect targets", () => {
    expect(validateSourceUrl("https://example.com/video.mp4")).toEqual({ ok: false, code: "SOURCE_HOST_NOT_ALLOWED" });
    expect(isAllowedRedirectHost("down-zl-br.vod.susercontent.com", ["br.shp.ee"])).toBe(false);
    expect(isAllowedRedirectHost("sv.shopee.com.br", ["br.shp.ee", "shopee.com.br", "sv.shopee.com.br"])).toBe(true);
  });

  it("rejects private and metadata IPs", () => {
    expect(validateSourceUrl("https://127.0.0.1/video.mp4")).toEqual({ ok: false, code: "SOURCE_HOST_NOT_ALLOWED" });
    expect(validateSourceUrl("https://169.254.169.254/latest/meta-data")).toEqual({ ok: false, code: "SOURCE_HOST_NOT_ALLOWED" });
  });

  it("requires compatible MIME and a real MP4 signature", () => {
    expect(assertSafeContentType("video/mp4")).toEqual({ ok: true });
    expect(assertSafeContentType("text/html")).toEqual({ ok: false, code: "MIME_NOT_ALLOWED" });
    expect(validateMediaSignature(new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]))).toEqual({ ok: true });
    expect(validateMediaSignature(new Uint8Array([60, 104, 116, 109, 108, 62]))).toEqual({ ok: false, code: "MEDIA_SIGNATURE_INVALID" });
  });
});
