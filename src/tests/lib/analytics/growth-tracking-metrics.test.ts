import { describe, expect, it } from "vitest";
import {
  countClicksByAffiliateLink,
  normalizeTrafficSource,
  summarizeClickEvents,
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
});
