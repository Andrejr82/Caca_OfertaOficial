import { describe, expect, it, vi } from "vitest";
import {
  normalizeMarketplaceSale,
  upsertCanonicalSale,
} from "@/lib/sales/canonical-sales";
import { normalizeMarketplaceReportRows, parseCsvReport } from "@/lib/sales/marketplace-report-import";

const links = [
  { id: "link-1", sub_id: "tg_offer-1", offer_id: "offer-1", channel: "telegram" as const },
];

describe("canonical marketplace sales", () => {
  it("normalizes a new Shopee sale into the canonical sales schema", () => {
    expect(normalizeMarketplaceSale({
      marketplace: "Shopee",
      userId: "user-1",
      sourceEventId: "shopee-order-1",
      offerId: "offer-1",
      subId: "tg_offer-1",
      grossValue: "R$ 129,90",
      commissionValue: "12,99",
      status: "approved",
      soldAt: "2026-08-09T12:00:00.000Z",
    }, links)).toEqual(expect.objectContaining({
      marketplace: "Shopee",
      source_event_id: "shopee-order-1",
      offer_id: "offer-1",
      affiliate_link_id: "link-1",
      channel: "telegram",
      gross_value: 129.9,
      commission_value: 12.99,
      status: "confirmed",
      sold_at: "2026-08-09T12:00:00.000Z",
    }));
  });

  it("normalizes Mercado Livre into the same schema", () => {
    const sale = normalizeMarketplaceSale({
      marketplace: "Mercado Livre",
      userId: "user-1",
      sourceEventId: "ml-order-1",
      offerId: "offer-1",
      affiliateLinkId: "link-1",
      channel: "telegram",
      grossValue: 200,
      commissionValue: 20,
      status: "pending",
      soldAt: "2026-08-09T12:00:00.000Z",
    }, links);

    expect(sale).toEqual(expect.objectContaining({
      marketplace: "Mercado Livre",
      source_event_id: "ml-order-1",
      gross_value: 200,
      commission_value: 20,
      status: "pending",
    }));
  });

  it("resolves a sale link by affiliate link id or sub_id", () => {
    expect(normalizeMarketplaceSale({
      marketplace: "Shopee", userId: "user-1", sourceEventId: "evt-1",
      offerId: "offer-1", subId: "tg_offer-1", grossValue: 1, commissionValue: 0.1,
      status: "pending", soldAt: "2026-08-09T12:00:00.000Z",
    }, links).affiliate_link_id).toBe("link-1");
  });

  it("keeps a missing affiliate link explicit without inventing one", () => {
    const sale = normalizeMarketplaceSale({
      marketplace: "Shopee", userId: "user-1", sourceEventId: "evt-2",
      offerId: "offer-1", subId: "missing-sub-id", channel: "telegram", grossValue: 1,
      commissionValue: 0.1, status: "pending", soldAt: "2026-08-09T12:00:00.000Z",
    }, links);

    expect(sale.affiliate_link_id).toBeNull();
    expect(sale.link_resolution).toBe("missing");
  });

  it("updates pending to confirmed or cancelled through the same upsert key", async () => {
    const upsert = vi.fn().mockResolvedValue({ data: [{ id: "sale-1" }], error: null });
    const sale = normalizeMarketplaceSale({
      marketplace: "Mercado Livre", userId: "user-1", sourceEventId: "evt-3",
      offerId: "offer-1", affiliateLinkId: "link-1", channel: "telegram", grossValue: 10,
      commissionValue: 1, status: "cancelled", soldAt: "2026-08-09T12:00:00.000Z",
    }, links);

    await upsertCanonicalSale(sale, { upsert });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: "cancelled", source_event_id: "evt-3" }),
      { onConflict: "user_id,marketplace,source_event_id" },
    );
  });

  it("does not derive a sale from a click-only record", () => {
    expect(() => normalizeMarketplaceSale({
      marketplace: "Shopee", userId: "user-1", sourceEventId: "",
      offerId: "offer-1", affiliateLinkId: "link-1", channel: "telegram", grossValue: 0,
      commissionValue: 0, status: "pending", soldAt: "2026-08-09T12:00:00.000Z",
    }, links)).toThrow(/sourceEventId/i);
  });

  it("parses an official CSV report and feeds the same canonical normalizer", () => {
    const rows = parseCsvReport([
      "order_id;offer_id;sub_id;gross_value;commission_value;status;sold_at",
      "shopee-order-2;offer-1;tg_offer-1;R$ 50,00;5,00;approved;2026-08-09T12:00:00.000Z",
    ].join("\n"));

    const [sale] = normalizeMarketplaceReportRows("Shopee", "user-1", rows, links);

    expect(sale).toEqual(expect.objectContaining({
      source_event_id: "shopee-order-2",
      gross_value: 50,
      commission_value: 5,
      status: "confirmed",
    }));
  });
});
