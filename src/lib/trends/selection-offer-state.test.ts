import { describe, expect, it } from "vitest";
import { resolveTrendOfferHandoff, resolveTrendSnapshotImageUrl } from "./selection-offer-state";

describe("resolveTrendOfferHandoff", () => {
  it("reuses offers that already reached selected or approved", () => {
    expect(resolveTrendOfferHandoff("selected")).toBe("reuse");
    expect(resolveTrendOfferHandoff("approved")).toBe("reuse");
  });

  it("selects only offers awaiting manual review", () => {
    expect(resolveTrendOfferHandoff("pending_manual_review")).toBe("select");
  });

  it("fails closed for unsupported states", () => {
    expect(resolveTrendOfferHandoff("posted")).toBe("reject");
    expect(resolveTrendOfferHandoff("unknown")).toBe("reject");
  });
});

describe("resolveTrendSnapshotImageUrl", () => {
  it("accepts persisted HTTPS marketplace images", () => {
    expect(resolveTrendSnapshotImageUrl({ image_url: "https://cf.shopee.com.br/file/example.jpg" }))
      .toBe("https://cf.shopee.com.br/file/example.jpg");
  });

  it("rejects missing or non-HTTPS images", () => {
    expect(resolveTrendSnapshotImageUrl({})).toBeNull();
    expect(resolveTrendSnapshotImageUrl({ image_url: "http://example.com/image.jpg" })).toBeNull();
  });
});
