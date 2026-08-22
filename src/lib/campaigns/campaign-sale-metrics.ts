import {
  CAMPAIGN_CHANNELS,
  buildCampaignTrackingKey,
  type CampaignChannel,
  type CampaignOfficialLinks,
} from "@/lib/campaigns/offer-campaigns";

export type CampaignSaleMetric = {
  channel: CampaignChannel;
  orders: number;
  confirmedCommission: number;
  pendingOrders: number;
  cancelledOrders: number;
  measurement: "canonical_sales" | "marketplace_report_required" | "no_link";
};

type AffiliateLinkRow = { id: string; sub_id: string | null };
type SaleRow = {
  id: string;
  affiliate_link_id: string | null;
  source_sub_id: string | null;
  status: string;
  commission_value: number | string | null;
};
type SupabaseLike = { from(table: string): any };

export function summarizeCampaignSales(
  campaignId: string,
  officialLinks: CampaignOfficialLinks,
  affiliateLinks: AffiliateLinkRow[],
  sales: SaleRow[],
): CampaignSaleMetric[] {
  return CAMPAIGN_CHANNELS.map((channel) => {
    const trackingKey = buildCampaignTrackingKey(campaignId, channel);
    const affiliateLinkIds = new Set(
      affiliateLinks.filter((link) => link.sub_id === trackingKey).map((link) => link.id),
    );
    const attributed = sales.filter((sale) =>
      sale.source_sub_id === trackingKey
      || (sale.affiliate_link_id ? affiliateLinkIds.has(sale.affiliate_link_id) : false),
    );
    const unique = [...new Map(attributed.map((sale) => [sale.id, sale])).values()];
    const confirmed = unique.filter((sale) => sale.status === "confirmed");

    return {
      channel,
      orders: unique.length,
      confirmedCommission: confirmed.reduce((sum, sale) => sum + Number(sale.commission_value ?? 0), 0),
      pendingOrders: unique.filter((sale) => sale.status === "pending").length,
      cancelledOrders: unique.filter((sale) => sale.status === "cancelled").length,
      measurement: unique.length > 0 || affiliateLinkIds.size > 0
        ? "canonical_sales"
        : officialLinks[channel]?.official_url
          ? "marketplace_report_required"
          : "no_link",
    };
  });
}

export async function getCampaignSaleMetrics(
  supabase: SupabaseLike,
  userId: string,
  offerId: string,
  campaignId: string,
  officialLinks: CampaignOfficialLinks,
): Promise<CampaignSaleMetric[]> {
  const trackingKeys = CAMPAIGN_CHANNELS.map((channel) => buildCampaignTrackingKey(campaignId, channel));
  const { data: affiliateLinks, error: linkError } = await supabase
    .from("affiliate_links")
    .select("id,sub_id")
    .eq("user_id", userId)
    .eq("offer_id", offerId)
    .in("sub_id", trackingKeys);

  if (linkError) throw new Error(`Falha ao carregar links para vendas: ${linkError.message}`);

  const linkRows = (affiliateLinks ?? []) as AffiliateLinkRow[];
  const linkIds = linkRows.map((link) => link.id);
  const directQuery = supabase
    .from("sales")
    .select("id,affiliate_link_id,source_sub_id,status,commission_value")
    .eq("user_id", userId)
    .in("source_sub_id", trackingKeys);
  const linkQuery = linkIds.length > 0
    ? supabase
        .from("sales")
        .select("id,affiliate_link_id,source_sub_id,status,commission_value")
        .eq("user_id", userId)
        .in("affiliate_link_id", linkIds)
    : Promise.resolve({ data: [], error: null });

  const [directResult, linkResult] = await Promise.all([directQuery, linkQuery]);
  if (directResult.error) throw new Error(`Falha ao carregar vendas por Sub_id/Etiqueta: ${directResult.error.message}`);
  if (linkResult.error) throw new Error(`Falha ao carregar vendas por affiliate_link: ${linkResult.error.message}`);

  const sales = [
    ...((directResult.data ?? []) as SaleRow[]),
    ...((linkResult.data ?? []) as SaleRow[]),
  ];

  return summarizeCampaignSales(campaignId, officialLinks, linkRows, sales);
}
