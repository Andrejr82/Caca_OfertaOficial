import { describe, expect, it } from "vitest";
import {
  countClicksByAffiliateLink,
  getBrtCivilWindowStart,
  getBrtDayKey,
  normalizeTrafficSource,
  summarizeClickEvents,
  summarizeSales,
} from "@/lib/analytics/metrics";
import type { ClickEventMetric, SaleMetric } from "@/lib/analytics/metrics";

describe("growth and tracking click metrics", () => {
  it("counts the same 349 click_events for Growth and Tracking", () => {
    const events = Array.from({ length: 349 }, (_, index) => ({
      affiliate_link_id: `link-${index % 7}`,
      created_at: "2026-08-09T12:00:00.000Z",
      source: "direct",
      device_type: "desktop",
    }));

    const growth = summarizeClickEvents(events);
    const tracking = countClicksByAffiliateLink(events);

    expect(growth.totalClicks).toBe(349);
    expect(Object.values(tracking).reduce((total, clicks) => total + clicks, 0)).toBe(349);
  });

  it("normalizes Facebook URLs and referrers to one source", () => {
    expect(normalizeTrafficSource("https://facebook.com/some-post")).toBe("facebook");
    expect(normalizeTrafficSource("https://m.facebook.com/some-post")).toBe("facebook");
    expect(normalizeTrafficSource("facebook.com")).toBe("facebook");
  });

  it("keeps an empty sales result as zero sales", () => {
    expect(summarizeClickEvents([]).totalSales).toBe(0);
  });

  it("does not use the divergent legacy affiliate_links counter", () => {
    const events = [{ affiliate_link_id: "link-1" }, { affiliate_link_id: "link-1" }];

    expect(countClicksByAffiliateLink(events)["link-1"]).toBe(2);
    expect((countClicksByAffiliateLink(events) as Record<string, number>)["legacy_clicks"]).toBeUndefined();
  });

  it("counts unattributed confirmed sales globally and labels their breakdown explicitly", () => {
    const summary = summarizeSales([
      { status: "confirmed", offer_id: null, affiliate_link_id: null, channel: null, commission_value: 0.7467, gross_value: 24.89 },
      { status: "confirmed", offer_id: "offer-1", affiliate_link_id: "link-1", channel: "telegram", commission_value: 2, gross_value: 20 },
      { status: "pending", offer_id: null, affiliate_link_id: null, channel: null, commission_value: 9, gross_value: 90 },
    ]);

    expect(summary.totalSales).toBe(2);
    expect(summary.totalRevenue).toBe(2.7467);
    expect(summary.unattributedSales).toBe(1);
    expect(summary.unattributedRevenue).toBe(0.7467);
    expect(summary.channelBreakdown).toEqual(expect.arrayContaining([
      expect.objectContaining({ channel: "Não atribuída", sales: 1, revenue: 0.7467 }),
    ]));
    expect(summary.offerBreakdown).toEqual(expect.arrayContaining([
      expect.objectContaining({ offer: "Não atribuída", sales: 1, revenue: 0.7467 }),
    ]));
  });

  describe("A) sourceData normalization", () => {
    it("normalizes diverse sources correctly", () => {
      expect(normalizeTrafficSource("https://m.facebook.com/posts/123")).toBe("facebook");
      expect(normalizeTrafficSource("ref:l.facebook.com")).toBe("facebook");
      expect(normalizeTrafficSource("https://instagram.com/p/123")).toBe("instagram");
      expect(normalizeTrafficSource("https://t.me/cacaoferta")).toBe("telegram");
      expect(normalizeTrafficSource("whatsapp://send")).toBe("whatsapp");
      expect(normalizeTrafficSource("")).toBe("direct/other");
      expect(normalizeTrafficSource(null)).toBe("direct/other");
      expect(normalizeTrafficSource(undefined)).toBe("direct/other");
      expect(normalizeTrafficSource("https://google.com/search")).toBe("direct/other");
    });
  });

  describe("B & C) America/Sao_Paulo BRT day grouping", () => {
    it("groups 2026-08-25T01:30:00.000Z into 2026-08-24 in BRT", () => {
      const events: ClickEventMetric[] = [
        { affiliate_link_id: "link-1", created_at: "2026-08-25T01:30:00.000Z" },
      ];
      const summary = summarizeClickEvents(events);
      expect(summary.trafficTrends).toEqual([{ date: "2026-08-24", clicks: 1 }]);
    });

    it("groups 2026-08-25T03:30:00.000Z into 2026-08-25 in BRT", () => {
      const events: ClickEventMetric[] = [
        { affiliate_link_id: "link-1", created_at: "2026-08-25T03:30:00.000Z" },
      ];
      const summary = summarizeClickEvents(events);
      expect(summary.trafficTrends).toEqual([{ date: "2026-08-25", clicks: 1 }]);
    });
  });

  describe("D) BRT civil window boundaries", () => {
    it("computes 7-day civil window start as D-6 00:00 BRT (03:00 UTC)", () => {
      const now = new Date("2026-08-24T15:00:00.000Z"); // 2026-08-24 12:00 BRT
      const start7 = getBrtCivilWindowStart(7, now);
      // D-6 is 2026-08-18. 00:00:00 BRT = 2026-08-18T03:00:00.000Z
      expect(start7.toISOString()).toBe("2026-08-18T03:00:00.000Z");

      const start15 = getBrtCivilWindowStart(15, now);
      expect(start15.toISOString()).toBe("2026-08-10T03:00:00.000Z");

      const start30 = getBrtCivilWindowStart(30, now);
      expect(start30.toISOString()).toBe("2026-07-26T03:00:00.000Z");

      const start90 = getBrtCivilWindowStart(90, now);
      expect(start90.toISOString()).toBe("2026-05-27T03:00:00.000Z");
    });
  });

  describe("E & F) Pending vs confirmed sales and commission value vs gross value", () => {
    it("does not include pending sales in totalSales or commission, and sums commission_value not gross_value", () => {
      const sales: SaleMetric[] = [
        { status: "confirmed", commission_value: 5.5, gross_value: 100 },
        { status: "confirmed", commission_value: 10.0, gross_value: 200 },
        { status: "pending", commission_value: 50.0, gross_value: 1000 },
        { status: "cancelled", commission_value: 20.0, gross_value: 400 },
      ];
      const summary = summarizeSales(sales);
      expect(summary.totalSales).toBe(2);
      expect(summary.totalRevenue).toBe(15.5); // 5.5 + 10.0, not gross_value (300) and not pending (50)
    });
  });
});
