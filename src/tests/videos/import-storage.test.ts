import { describe, expect, it } from "vitest";
import { importedStoragePrefix, importedAssetPath } from "@/lib/videos/import/storage";

describe("imported video storage paths", () => {
  it("keeps source and generated assets isolated by tenant, offer and job", () => {
    expect(importedStoragePrefix({ id: "job-1", user_id: "user-1", offer_id: "offer-1" })).toBe("videos/user-1/offer-1/job-1");
    expect(importedAssetPath({ id: "job-1", user_id: "user-1", offer_id: "offer-1" }, "instagram-cover")).toBe("videos/user-1/offer-1/job-1/instagram-cover.jpg");
  });
});
