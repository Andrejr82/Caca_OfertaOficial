import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AffiliateLink, Offer, Sale } from "@/types/domain";
import { countClicksByAffiliateLink, summarizeSales, type ClickEventMetric, type SaleMetric } from "@/lib/analytics/metrics";

export async function getCurrentUserId() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return null;
  const {
    data: { user }
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function listOffers() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return [] as Offer[];

  const { data } = await supabase.from("offers").select("*").order("updated_at", { ascending: false }).limit(5000);
  return (data || []) as Offer[];
}

export async function getOffer(id: string) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return null;

  const { data } = await supabase.from("offers").select("*").eq("id", id).single();
  return data as Offer | null;
}

export async function getOfferPosts(offerId: string) {
  const supabase = createSupabaseAdminClient() || (await createServerSupabaseClient());
  if (!supabase) return [];

  const { data } = await supabase
    .from("posts")
    .select("*")
    .eq("offer_id", offerId)
    .neq("status", "deleted");
  return data || [];
}

/**
 * Lista ofertas com contagem de drafts já gerados pela Official AI.
 * Permite ao painel exibir imediatamente o material preparado para revisão (ADR-014).
 * Ofertas em pending_manual_review com draft_count > 0 possuem conteúdo pronto para revisão.
 */
export async function listOffersWithDraftStatus() {
  const PANEL_OFFER_LIMIT = 5000;
  const supabase = await createServerSupabaseClient();
  if (!supabase) return [] as Array<Offer & { draft_count: number }>;

  const { data: recentDraftRows } = await supabase
    .from("posts")
    .select("offer_id,created_at")
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(PANEL_OFFER_LIMIT);
  const latestDraftOfferIds = [...new Set(
    ((recentDraftRows || []) as Array<{ offer_id: string }>).map((row) => row.offer_id)
  )].slice(0, PANEL_OFFER_LIMIT);

  const { data: draftOffers } = latestDraftOfferIds.length > 0
    ? await supabase.from("offers").select("*").in("id", latestDraftOfferIds)
    : { data: [] as Offer[] };

  const { data: recentOffers } = await supabase
    .from("offers")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(PANEL_OFFER_LIMIT);

  const draftOfferById = new Map(((draftOffers || []) as Offer[]).map((offer) => [offer.id, offer]));
  const actionable = latestDraftOfferIds.flatMap((id) => draftOfferById.get(id) ? [draftOfferById.get(id)!] : []);
  const actionableIds = new Set(actionable.map((offer) => offer.id));
  const offers = [...actionable, ...((recentOffers || []) as Offer[]).filter((offer) => !actionableIds.has(offer.id))].slice(0, PANEL_OFFER_LIMIT);
  if (offers.length === 0) return [] as Array<Offer & { draft_count: number }>;

  const offerIds = offers.map((o) => o.id);
  const { data: drafts } = await supabase
    .from("posts")
    .select("offer_id")
    .in("offer_id", offerIds)
    .eq("status", "draft");

  const draftCountByOffer: Record<string, number> = {};
  for (const d of (drafts || []) as Array<{ offer_id: string }>) {
    draftCountByOffer[d.offer_id] = (draftCountByOffer[d.offer_id] || 0) + 1;
  }

  return offers.map((offer) => ({
    ...offer,
    draft_count: draftCountByOffer[offer.id] || 0
  }));
}

export async function listAffiliateLinks() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return [] as AffiliateLink[];

  const { data } = await supabase.from("affiliate_links").select("*").order("created_at", { ascending: false }).limit(5000);
  return (data || []) as AffiliateLink[];
}

export async function listSales() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return [] as Sale[];

  const { data } = await supabase.from("sales").select("*").order("sold_at", { ascending: false }).limit(5000);
  return (data || []) as Sale[];
}

export async function getDashboardData() {
  const offers = await listOffers();
  const links = await listAffiliateLinks();
  const sales = await listSales();

  const byPlatform = offers.reduce<Record<string, number>>((acc, offer) => {
    acc[offer.platform] = (acc[offer.platform] || 0) + 1;
    return acc;
  }, {});

  const byChannel = links.reduce<Record<string, number>>((acc, link) => {
    acc[link.channel] = (acc[link.channel] || 0) + 1;
    return acc;
  }, {});

  // Agrega por categoria (somente ofertas com categoria preenchida)
  const byCategory = offers.reduce<Record<string, number>>((acc, offer) => {
    const cat = (offer as any).category || "Sem categoria";
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});

  return {
    offers,
    links,
    sales,
    totals: {
      offers: offers.length,
      approved: offers.filter((offer) => offer.status === "approved").length,
      posted: offers.filter((offer) => offer.status === "posted").length,
      estimatedCommission: offers.reduce((sum, offer) => sum + (offer.estimated_commission || 0), 0),
      confirmedCommission: sales.filter((sale) => sale.status === "confirmed").reduce((sum, sale) => sum + sale.commission_value, 0)
    },
    byPlatform,
    byChannel,
    byCategory,
    topOffers: [...offers].sort((a, b) => b.score - a.score).slice(0, 5)
  };
}

export async function getPostHistory(channel?: string, options?: { limit?: number } | number) {
  const limit = typeof options === "number" ? options : options?.limit;
  const supabase = createSupabaseAdminClient() || (await createServerSupabaseClient());
  if (!supabase) return [];

  // Busca os posts
  let query = supabase.from("posts").select(`
    id,
    channel,
    content,
    status,
    posted_at,
    created_at,
    external_id,
    offers (
      id,
      product_name,
      platform,
      category
    ),
    affiliate_links (
      id,
      tracked_url,
      clicks
    )
  `);

  if (channel) {
    query = query.eq("channel", channel);
  }

  query = query.neq("status", "deleted").order("created_at", { ascending: false });

  if (typeof limit === "number" && limit > 0) {
    query = query.limit(limit);
  }

  const { data: postsData } = await query;
  if (!postsData) return [];

  // Otimização: Coleta IDs de links afiliados dos posts e faz agregação única O(sales) em Map
  const linkIds = [...new Set(postsData.map((post: any) => post.affiliate_links?.id).filter(Boolean))];

  let salesData: Array<{ affiliate_link_id: string; commission_value: number; status: string }> = [];
  if (linkIds.length > 0) {
    const { data } = await supabase
      .from("sales")
      .select("affiliate_link_id, commission_value, status")
      .in("affiliate_link_id", linkIds);
    salesData = (data || []) as typeof salesData;
  }

  type LinkSalesAgg = { conversions: number; revenue: number };
  const salesByLinkId = new Map<string, LinkSalesAgg>();
  for (const sale of salesData) {
    if (!sale.affiliate_link_id) continue;
    let agg = salesByLinkId.get(sale.affiliate_link_id);
    if (!agg) {
      agg = { conversions: 0, revenue: 0 };
      salesByLinkId.set(sale.affiliate_link_id, agg);
    }
    agg.conversions += 1;
    if (sale.status === "confirmed") {
      agg.revenue += Number(sale.commission_value || 0);
    }
  }

  return postsData.map((post: any) => {
    const link = post.affiliate_links;
    const agg = link?.id ? salesByLinkId.get(link.id) : undefined;
    const conversions = agg?.conversions || 0;
    const revenue = agg?.revenue || 0;

    const postDate = post.posted_at || post.created_at;
    const dateObj = new Date(postDate);

    return {
      id: post.id,
      date: dateObj.toLocaleDateString("pt-BR"),
      time: dateObj.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      product: post.offers?.product_name || "Produto Desconhecido",
      platform: post.offers?.platform || "Outro",
      marketplace: post.offers?.platform || null,
      category: post.offers?.category || null,
      link: link?.tracked_url || "#",
      channel: post.channel,
      status: post.status,
      clicks: link?.clicks || 0,
      conversions,
      revenue
    };
  });
}

export async function getTrackingReports() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return [];

  const { data: linksData } = await supabase
    .from("affiliate_links")
    .select(`
      id,
      channel,
      sub_id,
      tracked_url,
      offers (
        id,
        product_name,
        platform
      )
    `)
    .order("created_at", { ascending: false });

  if (!linksData) return [];

  const { data: clickEventsData } = await supabase
    .from("click_events")
    .select("affiliate_link_id");
  const clicksByLink = countClicksByAffiliateLink((clickEventsData || []) as ClickEventMetric[]);

  const { data: salesData } = await supabase
    .from("sales")
    .select("affiliate_link_id, offer_id, channel, commission_value, status, gross_value");
  const salesSummary = summarizeSales((salesData || []) as SaleMetric[]);

  const reports = linksData.map((link: any) => {
    const linkSales = salesData?.filter((sale) => sale.affiliate_link_id === link.id) || [];
    const conversions = linkSales.length;
    const revenue = linkSales
      .filter((sale) => sale.status === "confirmed")
      .reduce((sum, sale) => sum + Number(sale.commission_value || 0), 0);

    const clicks = clicksByLink[link.id] || 0;
    const cost = clicks > 0 ? clicks * 0.15 : 0;
    const roi = cost > 0 ? ((revenue - cost) / cost) * 100 : 100;

    return {
      id: link.id,
      channel: link.channel,
      subId: link.sub_id,
      trackedUrl: link.tracked_url,
      clicks,
      conversions,
      revenue,
      roi: roi === 100 && revenue === 0 ? 0 : roi,
      isOrganic: cost === 0,
      productName: link.offers?.product_name || "Desconhecido",
      platform: link.offers?.platform || "Outro"
    };
  });

  if (salesSummary.unattributedSales > 0) {
    reports.push({
      id: "unattributed-sales",
      channel: "Não atribuída",
      subId: null,
      trackedUrl: "#",
      clicks: 0,
      conversions: salesSummary.unattributedSales,
      revenue: salesSummary.unattributedRevenue,
      roi: 0,
      isOrganic: true,
      productName: "Não atribuída",
      platform: "Marketplace",
    });
  }

  return reports;
}

/**
 * Lista ofertas filtradas por categoria principal.
 */
export async function listOffersByCategory(category: string) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return [] as Offer[];

  const { data } = await supabase
    .from("offers")
    .select("*")
    .ilike("category", `%${category}%`)
    .order("score", { ascending: false })
    .limit(100);
  return (data || []) as Offer[];
}

/**
 * Retorna todas as categorias distintas presentes no banco com contagem de ofertas.
 */
export async function getCategoryStats() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return [] as { category: string; count: number }[];

  const { data } = await supabase
    .from("offers")
    .select("category")
    .not("category", "is", null);

  if (!data) return [];

  const counts: Record<string, number> = {};
  for (const row of data) {
    const cat = (row as any).category || "Sem categoria";
    counts[cat] = (counts[cat] || 0) + 1;
  }

  return Object.entries(counts)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}
