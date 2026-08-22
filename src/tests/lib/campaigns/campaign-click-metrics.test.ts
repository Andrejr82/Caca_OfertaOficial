import { describe, expect, it } from "vitest";

import { summarizeCampaignClicks } from "@/lib/campaigns/campaign-click-metrics";
import { buildCampaignTrackingKey, type CampaignOfficialLinks } from "@/lib/campaigns/offer-campaigns";

describe("campaign click metrics", () => {
  it("counts only click_events backed by the exact campaign tracking key", () => {
    const campaignId = "campaign-12345678";
    const key = buildCampaignTrackingKey(campaignId, "instagram_reel");
    const metrics = summarizeCampaignClicks(
      campaignId,
      {},
      [{ id: "link-1", sub_id: key }, { id: "legacy", sub_id: "ig_offer-old" }],
      [{ affiliate_link_id: "link-1" }, { affiliate_link_id: "link-1" }, { affiliate_link_id: "legacy" }],
    );

    expect(metrics.find((metric) => metric.channel === "instagram_reel")).toEqual({
      channel: "instagram_reel",
      clicks: 2,
      measurement: "internal",
      affiliateLinkId: "link-1",
    });
  });

  it("does not invent internal clicks for a direct official marketplace link", () => {
    const officialLinks: CampaignOfficialLinks = {
      whatsapp: {
        marketplace: "Shopee",
        tracking_type: "sub_id",
        tracking_key: "camp_x_wp",
        official_url: "https://s.shopee.com.br/example",
        saved_at: "2026-08-22T12:00:00.000Z",
        source: "manual_assisted",
      },
    };

    const metric = summarizeCampaignClicks("campaign-1", officialLinks, [], [])
      .find((item) => item.channel === "whatsapp");

    expect(metric).toEqual({
      channel: "whatsapp",
      clicks: null,
      measurement: "marketplace_report_required",
      affiliateLinkId: null,
    });
  });

  it("marks channels without a saved link as not measurable yet", () => {
    const metric = summarizeCampaignClicks("campaign-1", {}, [], [])
      .find((item) => item.channel === "facebook_group");

    expect(metric?.clicks).toBeNull();
    expect(metric?.measurement).toBe("no_link");
  });
});
