import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function getGrowthMetrics(days = 30) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return null;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  // 1. Fetch raw clicks for the period
  const { data: clicksData } = await supabase
    .from("click_events")
    .select("created_at, source, device_type, affiliate_link_id")
    .gte("created_at", startDate.toISOString());

  const clicks = clicksData || [];

  // 2. Fetch Affiliate Links & Offers for context
  const { data: linksData } = await supabase
    .from("affiliate_links")
    .select(`
      id,
      channel,
      offers (
        product_name,
        platform
      )
    `);

  const links = linksData || [];

  // 3. Fetch Sales to calculate CR%
  const { data: salesData } = await supabase
    .from("sales")
    .select("affiliate_link_id, status, commission_value")
    .gte("sold_at", startDate.toISOString());

  const sales = salesData || [];

  // === AGGREGATIONS ===

  // A. Traffic Over Time (grouped by YYYY-MM-DD)
  const trafficByDate = clicks.reduce<Record<string, number>>((acc, click) => {
    const dateStr = new Date(click.created_at).toISOString().split('T')[0];
    acc[dateStr] = (acc[dateStr] || 0) + 1;
    return acc;
  }, {});
  
  // Sort dates chronologically
  const trafficTrends = Object.entries(trafficByDate)
    .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
    .map(([date, count]) => ({ date, clicks: count }));

  // B. Source Breakdown
  const sourceBreakdown = clicks.reduce<Record<string, number>>((acc, click) => {
    const src = click.source || 'unknown';
    acc[src] = (acc[src] || 0) + 1;
    return acc;
  }, {});

  const sourceData = Object.entries(sourceBreakdown)
    .sort((a, b) => b[1] - a[1])
    .map(([source, count]) => ({ source, count }));

  // C. Device Breakdown
  const deviceBreakdown = clicks.reduce<Record<string, number>>((acc, click) => {
    const dev = click.device_type || 'unknown';
    acc[dev] = (acc[dev] || 0) + 1;
    return acc;
  }, {});

  const deviceData = Object.entries(deviceBreakdown)
    .sort((a, b) => b[1] - a[1])
    .map(([device, count]) => ({ device, count }));

  // D. Funnel Metrics (Top Converters)
  // Agrupar cliques por link
  const linkClicks = clicks.reduce<Record<string, number>>((acc, click) => {
    acc[click.affiliate_link_id] = (acc[click.affiliate_link_id] || 0) + 1;
    return acc;
  }, {});

  const funnelData = links.map(link => {
    const linkSales = sales.filter(s => s.affiliate_link_id === link.id);
    const confirmedSales = linkSales.filter(s => s.status === 'confirmed');
    
    const clickCount = linkClicks[link.id] || 0;
    const saleCount = confirmedSales.length;
    const revenue = confirmedSales.reduce((sum, s) => sum + Number(s.commission_value || 0), 0);
    
    const conversionRate = clickCount > 0 ? (saleCount / clickCount) * 100 : 0;
    const revenuePerClick = clickCount > 0 ? revenue / clickCount : 0;

    return {
      id: link.id,
      productName: (link.offers as any)?.product_name || "Desconhecido",
      platform: (link.offers as any)?.platform || "Outro",
      channel: link.channel,
      clicks: clickCount,
      sales: saleCount,
      conversionRate,
      revenue,
      revenuePerClick
    };
  }).filter(item => item.clicks > 0); // Só exibe quem teve clique no período

  // Sort by Conversion Rate or Revenue
  funnelData.sort((a, b) => b.revenue - a.revenue || b.conversionRate - a.conversionRate);

  return {
    trafficTrends,
    sourceData,
    deviceData,
    funnelData,
    totalClicks: clicks.length,
    totalSales: sales.filter(s => s.status === 'confirmed').length
  };
}
