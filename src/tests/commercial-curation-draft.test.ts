import { describe, expect, it } from "vitest";
import { COMMERCIAL_DRAFT_CHANNELS, validateCommercialDraftRequest } from "@/lib/offers/commercial-draft-validation";

describe("commercial draft action", () => {
  it("requires an explicit channel", () => {
    expect(validateCommercialDraftRequest({ offerId: "offer-1" })).toMatchObject({ ok: false, code: "CHANNEL_REQUIRED" });
    expect(COMMERCIAL_DRAFT_CHANNELS).toEqual(["telegram", "manual_whatsapp", "reels_manual", "panel_only"]);
  });

  it("validates offer id and critical-risk confirmation separately", () => {
    expect(validateCommercialDraftRequest({ selectedChannel: "panel_only" })).toMatchObject({ ok: false, code: "MISSING_OFFER_ID" });
    expect(validateCommercialDraftRequest({ offerId: "offer-1", selectedChannel: "panel_only", confirmCriticalRisk: true })).toMatchObject({ ok: true, confirmCriticalRisk: true });
  });
});
