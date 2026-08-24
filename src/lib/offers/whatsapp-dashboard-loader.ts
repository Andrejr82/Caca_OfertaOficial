import type { SupabaseClient } from "@supabase/supabase-js";
import { getTodayBrtStart } from "@/lib/offers/prepare-top30-whatsapp-legacy-drafts";
import { mergePanelDrafts } from "@/lib/offers/panel-draft-selection";

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
  selectedOfferIds: Set<string>;
  todayStart?: Date;
  limit?: number;
}

export async function loadWhatsappDashboardDrafts({
  supabase,
  userId,
  selectedOfferIds,
  todayStart = getTodayBrtStart(),
  limit = 30,
}: LoadWhatsappDashboardDraftsInput): Promise<PostWithOffer[]> {
  if (!supabase || !userId) {
    return [];
  }

  let query = supabase
    .from("posts")
    .select("*, offers(*), affiliate_links(tracked_url)")
    .eq("user_id", userId)
    .eq("channel", "whatsapp")
    .eq("status", "draft")
    .order("created_at", { ascending: false });

  if (selectedOfferIds.size > 0) {
    query = query.in("offer_id", Array.from(selectedOfferIds));
  }

  if (typeof limit === "number" && limit > 0) {
    query = query.limit(limit);
  }

  const { data: drafts } = await query;
  return mergePanelDrafts(
    drafts || [],
    selectedOfferIds,
    todayStart,
    undefined,
    true
  ) as unknown as PostWithOffer[];
}
