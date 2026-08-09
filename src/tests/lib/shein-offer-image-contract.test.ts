import { describe, expect, it } from "vitest";
import { assertOfferImageObjectPath } from "@/lib/publish/shein-upload-validation";

describe("SHEIN offer image storage contract", () => {
  it("uses upload.data.path as the relative object path exactly once", () => {
    const path = "user-1/express/file.webp";
    expect(assertOfferImageObjectPath("offer-images", path)).toBe(path);
  });

  it("does not accept a bucket-prefixed object path", () => {
    expect(() => assertOfferImageObjectPath("offer-images", "offer-images/file.webp"))
      .toThrow("OFFER_IMAGE_PATH_BUCKET_PREFIX");
  });
});
