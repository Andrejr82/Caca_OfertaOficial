import type { SupabaseClient } from "@supabase/supabase-js";
import { getTodayBrtStart } from "@/lib/offers/prepare-top30-whatsapp-legacy-drafts";
import { isManualExpressDraft } from "@/lib/offers/panel-draft-selection";

export interface PostWithOffer {
  id: string;
  offer_id?: string;
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
  todayStart?: Date;
  limit?: number;
}

function isActiveWhatsappDraft(post: PostWithOffer): boolean {
  const offerStatus = String(post.offers?.status || "").toLowerCase();
  return post.status === "draft"
    && !post.deleted_at
    && !post.posted_at
    && !post.external_id
    && !["posted", "rejected", "deferred"].includes(offerStatus);
}

function offerIdOf(post: PostWithOffer): string {
  return post.offers?.id || post.offer_id || "";
}

function dedupeByOfferId(posts: PostWithOffer[]): PostWithOffer[] {
  const seen = new Set<string>();
  const result: PostWithOffer[] = [];
  for (const post of posts) {
    const offerId = offerIdOf(post);
    if (!offerId || seen.has(offerId)) continue;
    seen.add(offerId);
    result.push(post);
  }
  return result;
}

export async function loadWhatsappDashboardDrafts({
  supabase,
  userId,
  todayStart = getTodayBrtStart(),
  limit = 30,
}: LoadWhatsappDashboardDraftsInput): Promise<PostWithOffer[]> {
  if (!supabase || !userId) return [];

  const requestedLimit = typeof limit === "number" && limit > 0 ? limit : 30;

  // Editorial: a aba exibe drafts ativos já gerados pelos ciclos do dia.
  // A renderização não depende do Top30, cohort atual ou status approved da oferta pai.
  let editorialDrafts: PostWithOffer[] = [];
  try {
    const { data, error } = await supabase
      .from("posts")
      .select("*, offers(*), affiliate_links(tracked_url)")
      .eq("user_id", userId)
      .eq("channel", "whatsapp")
      .eq("status", "draft")
      .gte("created_at", todayStart.toISOString())
      .order("created_at", { ascending: false })
      .limit(Math.max(requestedLimit * 4, 120));

    if (error) throw error;

    editorialDrafts = dedupeByOfferId(
      ((data || []) as PostWithOffer[])
        .filter((post) => isActiveWhatsappDraft(post) && !isManualExpressDraft(post)),
    );
  } catch (error) {
    console.error("[WhatsApp] Falha ao carregar drafts editoriais", error);
    editorialDrafts = [];
  }

  // Express: continua fora do Top30 e é resolvido pela origem manual_source=true.
  let expressDrafts: PostWithOffer[] = [];
  try {
    const { data: expressOffers, error: expressOffersError } = await supabase
      .from("offers")
      .select("id")
      .eq("user_id", userId)
      .contains("explainability", { manual_source: true })
      .order("created_at", { ascending: false })
      .limit(100);

    if (expressOffersError) throw expressOffersError;

    const expressOfferIds = (expressOffers || [])
      .map((offer: { id?: string | null }) => offer.id)
      .filter((id): id is string => Boolean(id));

    if (expressOfferIds.length > 0) {
      const { data: expressData, error: expressDraftsError } = await supabase
        .from("posts")
        .select("*, offers(*), affiliate_links(tracked_url)")
        .eq("user_id", userId)
        .eq("channel", "whatsapp")
        .eq("status", "draft")
        .in("offer_id", expressOfferIds)
        .order("created_at", { ascending: false })
        .limit(Math.max(requestedLimit, 50));

      if (expressDraftsError) throw expressDraftsError;

      expressDrafts = dedupeByOfferId(
        ((expressData || []) as PostWithOffer[])
          .filter((post) => isActiveWhatsappDraft(post) && isManualExpressDraft(post)),
      );
    }
  } catch (error) {
    console.error("[WhatsApp] Falha ao carregar drafts Express", error);
    expressDrafts = [];
  }

  // Express tem prioridade visual; editorial completa o restante da capacidade da aba.
  return dedupeByOfferId([...expressDrafts, ...editorialDrafts]).slice(0, requestedLimit);
}
