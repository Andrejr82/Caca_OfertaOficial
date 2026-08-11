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
      attribution_method: "sub_id",
      source_sub_id: "tg_offer-1",
      link_resolution: "matched",
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
      attribution_method: "affiliate_link_id",
      source_sub_id: null,
      link_resolution: "matched",
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
    expect(sale.attribution_method).toBe("channel_only");
    expect(sale.source_sub_id).toBe("missing-sub-id");
  });

  it("accepts a real unattributed marketplace sale without guessing attribution", async () => {
    const upsert = vi.fn().mockResolvedValue({ data: [{ id: "sale-unattributed" }], error: null });
    const sale = normalizeMarketplaceSale({
      marketplace: "Shopee", userId: "user-1",
      sourceEventId: "shopee:260803DKQ4FYSY:23294783398:229435420798",
      offerId: "", affiliateLinkId: null, subId: null, channel: "Websites",
      grossValue: "24.89", commissionValue: "0.7467",
      status: "Pendente", soldAt: "2026-08-03T14:50:55.000Z",
    }, []);

    expect(sale).toEqual(expect.objectContaining({
      offer_id: null, affiliate_link_id: null, channel: null,
      gross_value: 24.89, commission_value: 0.7467,
      attribution_method: "unattributed", source_sub_id: null, link_resolution: "missing",
    }));
    await upsertCanonicalSale(sale, { upsert });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ offer_id: null, affiliate_link_id: null, channel: null, attribution_method: "unattributed" }),
      { onConflict: "user_id,marketplace,source_event_id" },
    );
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
      attribution_method: "sub_id",
      source_sub_id: "tg_offer-1",
    }));
  });

  it("parses the real Shopee affiliate report headers with a multi-item-safe source key", () => {
    const rows = parseCsvReport([
      "ID do pedido,Status do Pedido,Horário do pedido,Valor de Compra(R$),ID do item,Modelo de ID,Comissão líquida do afiliado(R$),Status do item do afiliado,Sub_id1,Sub_id2,Sub_id3,Sub_id4,Sub_id5,Canal",
      "260803DKQ4FYSY,Pendente,2026-08-03 11:50:55,24.89,23294783398,229435420798,0.7467,Pendente,,,,,,Websites",
    ].join("\n"));

    const [sale] = normalizeMarketplaceReportRows("Shopee", "user-1", rows, []);

    expect(sale).toEqual(expect.objectContaining({
      source_event_id: "shopee:260803DKQ4FYSY:23294783398:229435420798",
      gross_value: 24.89,
      commission_value: 0.7467,
      status: "pending",
      sold_at: "2026-08-03T14:50:55.000Z",
      offer_id: null,
      affiliate_link_id: null,
      channel: null,
      attribution_method: "unattributed",
      source_sub_id: null,
      link_resolution: "missing",
    }));
  });
});
