import type { SupabaseClient } from "@supabase/supabase-js";
import { getTodayBrtStart } from "@/lib/offers/prepare-top30-whatsapp-legacy-drafts";
import { mergePanelDrafts, isManualExpressDraft } from "@/lib/offers/panel-draft-selection";

export interface PostWithOffer {
  id: string;
  content: string;
  status: string;
  external_id: string | null;
  posted_at: string | null;
  created_at: string;
  deleted_at?: string | null;
  affiliate_links?: {
    tracked_url: string;
  } | null;
  offers: {
    id: string;
    product_name: string;
    platform: string;
    marketplace?: string | null;
    category?: string | null;
    current_price: number;
    old_price: number | null;
    image_url: string | null;
    original_url: string;
    coupon: string | null;
    notes: string | null;
    status: string;
    created_at: string;
    explainability?: Record<string, unknown> | null;
  };
}

export interface LoadWhatsappDashboardDraftsInput {
  supabase: SupabaseClient | null;
  userId: string | null | undefined;
  selectedOfferIds?: Set<string>;
  todayStart?: Date;
  limit?: number;
}

export async function loadWhatsappDashboardDrafts({
  supabase,
  userId,
  selectedOfferIds = new Set<string>(),
  todayStart = getTodayBrtStart(),
  limit = 30,
}: LoadWhatsappDashboardDraftsInput): Promise<PostWithOffer[]> {
  if (!supabase || !userId) {
    return [];
  }

  const editorialIds = selectedOfferIds ? Array.from(selectedOfferIds) : [];

  // 1. Carregar drafts editoriais Top30 (se houver IDs selecionados)
  let editorialDrafts: PostWithOffer[] = [];
  if (editorialIds.length > 0) {
    let query = supabase
      .from("posts")
      .select("*, offers(*), affiliate_links(tracked_url)")
      .eq("user_id", userId)
      .eq("channel", "whatsapp")
      .eq("status", "draft")
      .in("offer_id", editorialIds)
      .order("created_at", { ascending: false });

    if (typeof limit === "number" && limit > 0) {
      query = query.limit(limit);
    }

    const { data: drafts } = await query;
    editorialDrafts = mergePanelDrafts(
      drafts || [],
      selectedOfferIds,
      todayStart,
      undefined,
      true
    ) as unknown as PostWithOffer[];
  }

  // 2. Carregar separadamente drafts de Publicação Expressa (manual_source === true)
  let expressDrafts: PostWithOffer[] = [];
  try {
    const { data: expressData } = await supabase
      .from("posts")
      .select("*, offers(*), affiliate_links(tracked_url)")
      .eq("user_id", userId)
      .eq("channel", "whatsapp")
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(50);

    expressDrafts = (expressData || [])
      .filter((post: any) => {
        if (!post || !post.offers) return false;
        const isManual = isManualExpressDraft(post);
        const offerStatus = String(post.offers.status || "").toLowerCase();
        const isActive = post.status === "draft"
          && !post.deleted_at
          && !post.posted_at
          && !post.external_id
          && !["posted", "rejected", "deferred"].includes(offerStatus);
        return isManual && isActive;
      }) as unknown as PostWithOffer[];
  } catch {
    expressDrafts = [];
  }

  // 3. Unificar: Express primeiro no topo, depois Editorial Top30, sem duplicações por offer_id
  const seenOfferIds = new Set<string>();
  const combined: PostWithOffer[] = [];

  for (const post of expressDrafts) {
    const offerId = post.offers?.id || (post as any).offer_id;
    if (offerId && !seenOfferIds.has(offerId)) {
      seenOfferIds.add(offerId);
      combined.push(post);
    }
  }

  for (const post of editorialDrafts) {
    const offerId = post.offers?.id || (post as any).offer_id;
    if (offerId && !seenOfferIds.has(offerId)) {
      seenOfferIds.add(offerId);
      combined.push(post);
    }
  }

  return combined;
}
