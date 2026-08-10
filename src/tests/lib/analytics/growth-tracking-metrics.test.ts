import { describe, expect, it } from "vitest";
import {
  countClicksByAffiliateLink,
  normalizeTrafficSource,
  summarizeClickEvents,
  summarizeSales,
} from "@/lib/analytics/metrics";

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
});
