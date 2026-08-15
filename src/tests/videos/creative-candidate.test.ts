import { describe, expect, it } from "vitest";
import {
  certifyCreativeCandidate,
  canApproveCreative,
  type CreativeCandidateInput,
} from "@/lib/videos/creative-candidate";

const strongCandidate: CreativeCandidateInput = {
  rightsStatus: "owned",
  width: 1080,
  height: 1920,
  durationSeconds: 9,
  productVisible: true,
  demonstratesUse: true,
  strongHook: true,
};

describe("creative candidate policy", () => {
  it("certifies an authorized vertical demonstrative creative", () => {
    const result = certifyCreativeCandidate(strongCandidate);

    expect(result.rightsCertified).toBe(true);
    expect(result.score).toBe(100);
    expect(result.grade).toBe("excellent");
    expect(canApproveCreative({ creativeCandidate: result })).toBe(true);
  });

  it("fails closed when rights are not explicitly authorized", () => {
    const result = certifyCreativeCandidate({
      ...strongCandidate,
      rightsStatus: "unverified",
    });

    expect(result.rightsCertified).toBe(false);
    expect(canApproveCreative({ creativeCandidate: result })).toBe(false);
  });

  it("scores weak catalog-like media below strong social-first media", () => {
    const result = certifyCreativeCandidate({
      rightsStatus: "seller_authorized",
      width: 1280,
      height: 720,
      durationSeconds: 28,
      productVisible: true,
      demonstratesUse: false,
      strongHook: false,
    });

    expect(result.rightsCertified).toBe(true);
    expect(result.score).toBeLessThan(60);
    expect(result.grade).toBe("weak");
  });
});
