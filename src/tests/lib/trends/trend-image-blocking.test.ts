import { describe, expect, it } from "vitest";
import {
  resolveTrendSnapshotImageUrl,
  validateTrendOfferImage,
  TREND_MISSING_IMAGE_MESSAGE,
} from "@/lib/trends/selection-offer-state";

describe("Trends image validation and factual fallback (Parte A)", () => {
  it("resolves valid https image_url from direct snapshot evidence", () => {
    const evidence = {
      image_url: "https://http2.mlstatic.com/D_NQ_NP_2X_615131-MLB.webp",
    };
    expect(resolveTrendSnapshotImageUrl(evidence)).toBe("https://http2.mlstatic.com/D_NQ_NP_2X_615131-MLB.webp");
  });

  it("resolves valid https imageUrl from evidence thumbnail/picture fallback", () => {
    const evidence = {
      thumbnail: "https://down-br.img.susercontent.com/file/br-11134207-7r98o-sample.jpg",
    };
    expect(resolveTrendSnapshotImageUrl(evidence)).toBe("https://down-br.img.susercontent.com/file/br-11134207-7r98o-sample.jpg");
  });

  it("resolves candidate/product fallback image if evidence is missing image_url", () => {
    const evidence = {};
    const candidate = {
      imageUrl: "https://http2.mlstatic.com/D_NQ_NP_2X_candidate.webp",
    };
    expect(resolveTrendSnapshotImageUrl(evidence, candidate)).toBe("https://http2.mlstatic.com/D_NQ_NP_2X_candidate.webp");
  });

  it("resolves existing offer image if available", () => {
    const evidence = {};
    const candidate = {};
    const existingOffer = {
      image_url: "https://http2.mlstatic.com/D_NQ_NP_2X_offer.webp",
    };
    expect(resolveTrendSnapshotImageUrl(evidence, candidate, existingOffer)).toBe("https://http2.mlstatic.com/D_NQ_NP_2X_offer.webp");
  });

  it("returns null if no valid HTTPS image is available across all layers", () => {
    expect(resolveTrendSnapshotImageUrl(null)).toBeNull();
    expect(resolveTrendSnapshotImageUrl({})).toBeNull();
    expect(resolveTrendSnapshotImageUrl({ image_url: "http://insecure.com/img.jpg" })).toBeNull();
    expect(resolveTrendSnapshotImageUrl({ image_url: "not-a-url" })).toBeNull();
    expect(resolveTrendSnapshotImageUrl({ image_url: "" }, { imageUrl: "" }, { image_url: "" })).toBeNull();
  });

  it("validateTrendOfferImage blocks invalid or missing image URLs with trend_missing_image", () => {
    const blockNull = validateTrendOfferImage(null);
    expect(blockNull).toEqual({
      code: "trend_missing_image",
      message: TREND_MISSING_IMAGE_MESSAGE,
    });

    const blockEmpty = validateTrendOfferImage("");
    expect(blockEmpty).toEqual({
      code: "trend_missing_image",
      message: TREND_MISSING_IMAGE_MESSAGE,
    });

    const blockHttp = validateTrendOfferImage("http://insecure.example.com/item.png");
    expect(blockHttp).toEqual({
      code: "trend_missing_image",
      message: TREND_MISSING_IMAGE_MESSAGE,
    });

    const blockInvalid = validateTrendOfferImage("Sem Imagem");
    expect(blockInvalid).toEqual({
      code: "trend_missing_image",
      message: TREND_MISSING_IMAGE_MESSAGE,
    });

    const passHttps = validateTrendOfferImage("https://down-br.img.susercontent.com/file/br-123.jpg");
    expect(passHttps).toBeNull();
  });
});
