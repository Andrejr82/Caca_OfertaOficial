import { describe, expect, it } from "vitest";
import { buildTrendSocialDraftCommand, TREND_SOCIAL_CHANNELS } from "./selection-social-drafts";

describe("Trends social draft handoff", () => {
  it("builds one idempotent omnichannel draft command without automatic publication", () => {
    const command = buildTrendSocialDraftCommand({
      userId: "user-1",
      offerId: "offer-1",
      productId: "trend-product-1",
      requestedAt: "2026-08-17T00:00:00.000Z",
    });

    expect(command.offerId).toBe("offer-1");
    expect(command.channels).toEqual([...TREND_SOCIAL_CHANNELS]);
    expect(command.commandId).toBe("trend-social-drafts:trend-product-1:offer-1:v1");
    expect(command.idempotencyKey).toBe(command.commandId);
    expect(command.origin).toBe("trends.approve-test");
    expect(command.metadata?.automaticPublication).toBe(false);
  });
});
