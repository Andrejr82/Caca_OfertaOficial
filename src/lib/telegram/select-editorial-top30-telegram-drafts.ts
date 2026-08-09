import type { Offer } from "@/types/domain";
import { selectEditorialTop30 } from "@/lib/offers/commercial-channel-router";
import { getTodayBrtStart } from "@/lib/offers/prepare-top30-whatsapp-legacy-drafts";

export type TelegramEditorialDraftRow = {
  id: string;
  offer_id: string;
  channel: "telegram";
  status: string;
  content: string;
  created_at: string;
  posted_at: string | null;
  external_id: string | null;
  offers: Offer | null;
};

const PROTECTED_POST_STATUSES = new Set(["published", "posted", "approved", "rejected", "deferred", "deleted", "publishing"]);

function hasPublicationEvidence(post: Pick<TelegramEditorialDraftRow, "status" | "posted_at" | "external_id">): boolean {
  return PROTECTED_POST_STATUSES.has(post.status.toLowerCase()) || Boolean(post.posted_at || post.external_id);
}

export function selectEditorialTop30TelegramOfferIds(rows: readonly TelegramEditorialDraftRow[], now = new Date()): string[] {
  const todayStart = getTodayBrtStart(now).getTime();
  const protectedOfferIds = new Set(rows.filter(hasPublicationEvidence).map((post) => post.offer_id));
  const eligibleDraftOffers = new Map<string, Offer>();

  for (const post of rows) {
    const createdAt = new Date(post.created_at).getTime();
    if (post.status !== "draft" || hasPublicationEvidence(post) || protectedOfferIds.has(post.offer_id)) continue;
    if (!Number.isFinite(createdAt) || createdAt < todayStart || createdAt > now.getTime() || !post.offers) continue;
    if (post.offers.explainability?.manual_source === true) continue;
    if (!eligibleDraftOffers.has(post.offer_id)) eligibleDraftOffers.set(post.offer_id, post.offers);
  }

  const eligibleOffers = [...eligibleDraftOffers.values()];
  const selectedShopeeIds = selectEditorialTop30(
    eligibleOffers.filter((offer) => offer.platform === "Shopee"),
    30,
    now,
  ).map((candidate) => candidate.id);
  const nonShopeeIds = eligibleOffers
    .filter((offer) => offer.platform === "Amazon" || offer.platform === "Mercado Livre")
    .map((offer) => offer.id);
  return [...new Set([...selectedShopeeIds, ...nonShopeeIds])];
}

export async function loadEditorialTop30TelegramOfferIds(client: { from: (table: string) => any }, now = new Date()): Promise<string[]> {
  const { data, error } = await client
    .from("posts")
    .select("id,offer_id,channel,status,content,created_at,posted_at,external_id,offers(*)")
    .eq("channel", "telegram");
  if (error) throw error;
  return selectEditorialTop30TelegramOfferIds((data || []) as TelegramEditorialDraftRow[], now);
}
