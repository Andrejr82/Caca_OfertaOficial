import { describe, expect, it } from "vitest";

import { summarizeCampaignSales } from "@/lib/campaigns/campaign-sale-metrics";
import { buildCampaignTrackingKey, type CampaignOfficialLinks } from "@/lib/campaigns/offer-campaigns";

describe("campaign sale metrics", () => {
  it("attributes only sales with the exact campaign tracking key", () => {
    const campaignId = "campaign-12345678";
    const key = buildCampaignTrackingKey(campaignId, "instagram_reel");
    const other = buildCampaignTrackingKey("campaign-other", "instagram_reel");
    const metric = summarizeCampaignSales(campaignId, {}, [], [
      { id: "sale-1", affiliate_link_id: null, source_sub_id: key, status: "confirmed", commission_value: 2.4 },
      { id: "sale-2", affiliate_link_id: null, source_sub_id: other, status: "confirmed", commission_value: 9 },
    ]).find((item) => item.channel === "instagram_reel");

    expect(metric).toEqual(expect.objectContaining({ orders: 1, confirmedCommission: 2.4 }));
  });

  it("uses the exact campaign affiliate link when source_sub_id is absent", () => {
    const campaignId = "campaign-12345678";
    const key = buildCampaignTrackingKey(campaignId, "whatsapp");
    const metric = summarizeCampaignSales(
      campaignId,
      {},
      [{ id: "link-1", sub_id: key }],
      [{ id: "sale-1", affiliate_link_id: "link-1", source_sub_id: null, status: "pending", commission_value: 1 }],
    ).find((item) => item.channel === "whatsapp");

    expect(metric).toEqual(expect.objectContaining({ orders: 1, pendingOrders: 1, confirmedCommission: 0 }));
  });

  it("does not assign an offer-level sale without campaign evidence", () => {
    const metric = summarizeCampaignSales("campaign-1", {}, [], [
      { id: "sale-old", affiliate_link_id: null, source_sub_id: null, status: "confirmed", commission_value: 5 },
    ]).find((item) => item.channel === "facebook_feed");

    expect(metric).toEqual(expect.objectContaining({ orders: 0, confirmedCommission: 0, measurement: "no_link" }));
  });

  it("marks a saved official link without sales evidence as awaiting marketplace report", () => {
    const officialLinks: CampaignOfficialLinks = {
      facebook_group: {
        marketplace: "Shopee",
        tracking_type: "sub_id",
        tracking_key: "camp_x_fb_group",
        official_url: "https://s.shopee.com.br/example",
        saved_at: "2026-08-22T12:00:00.000Z",
        source: "manual_assisted",
      },
    };
    const metric = summarizeCampaignSales("campaign-1", officialLinks, [], [])
      .find((item) => item.channel === "facebook_group");

    expect(metric?.measurement).toBe("marketplace_report_required");
  });
});
