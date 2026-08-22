import { describe, expect, it } from "vitest";

import { normalizeMarketplaceSale } from "@/lib/sales/canonical-sales";

describe("canonical sales facebook attribution", () => {
  it("keeps facebook as a canonical channel instead of dropping attribution", () => {
    const sale = normalizeMarketplaceSale({
      marketplace: "Shopee",
      userId: "user-1",
      sourceEventId: "evt-facebook-1",
      offerId: "offer-1",
      channel: "facebook",
      grossValue: 20,
      commissionValue: 2,
      status: "approved",
      soldAt: "2026-08-22T12:00:00.000Z",
    }, []);

    expect(sale.channel).toBe("facebook");
    expect(sale.attribution_method).toBe("channel_only");
  });
});
