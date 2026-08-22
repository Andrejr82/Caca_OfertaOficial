import {
  CAMPAIGN_CHANNELS,
  buildCampaignTrackingKey,
  type CampaignChannel,
  type CampaignOfficialLinks,
} from "@/lib/campaigns/offer-campaigns";

export type CampaignClickMetric = {
  channel: CampaignChannel;
  clicks: number | null;
  measurement: "internal" | "marketplace_report_required" | "no_link";
  affiliateLinkId: string | null;
};

type AffiliateLinkRow = { id: string; sub_id: string | null };
type ClickEventRow = { affiliate_link_id: string };
type SupabaseLike = { from(table: string): any };

export function summarizeCampaignClicks(
  campaignId: string,
  officialLinks: CampaignOfficialLinks,
  affiliateLinks: AffiliateLinkRow[],
  clickEvents: ClickEventRow[],
): CampaignClickMetric[] {
  const clicksByLink = clickEvents.reduce<Record<string, number>>((acc, event) => {
    acc[event.affiliate_link_id] = (acc[event.affiliate_link_id] ?? 0) + 1;
    return acc;
  }, {});

  return CAMPAIGN_CHANNELS.map((channel) => {
    const trackingKey = buildCampaignTrackingKey(campaignId, channel);
    const matchedLink = affiliateLinks.find((link) => link.sub_id === trackingKey) ?? null;

    if (matchedLink) {
      return {
        channel,
        clicks: clicksByLink[matchedLink.id] ?? 0,
        measurement: "internal" as const,
        affiliateLinkId: matchedLink.id,
      };
    }

    return {
      channel,
      clicks: null,
      measurement: officialLinks[channel]?.official_url ? "marketplace_report_required" as const : "no_link" as const,
      affiliateLinkId: null,
    };
  });
}

export async function getCampaignClickMetrics(
  supabase: SupabaseLike,
  userId: string,
  offerId: string,
  campaignId: string,
  officialLinks: CampaignOfficialLinks,
): Promise<CampaignClickMetric[]> {
  const trackingKeys = CAMPAIGN_CHANNELS.map((channel) => buildCampaignTrackingKey(campaignId, channel));
  const { data: affiliateLinks, error: linkError } = await supabase
    .from("affiliate_links")
    .select("id,sub_id")
    .eq("user_id", userId)
    .eq("offer_id", offerId)
    .in("sub_id", trackingKeys);

  if (linkError) throw new Error(`Falha ao carregar links de tracking: ${linkError.message}`);

  const linkRows = (affiliateLinks ?? []) as AffiliateLinkRow[];
  if (linkRows.length === 0) return summarizeCampaignClicks(campaignId, officialLinks, [], []);

  const { data: clickEvents, error: clickError } = await supabase
    .from("click_events")
    .select("affiliate_link_id")
    .in("affiliate_link_id", linkRows.map((link) => link.id));

  if (clickError) throw new Error(`Falha ao carregar cliques: ${clickError.message}`);

  return summarizeCampaignClicks(
    campaignId,
    officialLinks,
    linkRows,
    (clickEvents ?? []) as ClickEventRow[],
  );
}
