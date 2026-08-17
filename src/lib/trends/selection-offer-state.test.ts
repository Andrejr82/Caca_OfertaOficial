import { describe, expect, it } from "vitest";
import { resolveTrendOfferHandoff } from "./selection-offer-state";

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
