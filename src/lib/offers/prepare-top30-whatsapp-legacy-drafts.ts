import type { SupabaseClient } from "@supabase/supabase-js";
import { buildCommercialQueue, type CommercialQueueCandidate } from "@/lib/offers/commercial-curation-queue";
import { routeCommercialCandidates, selectOperationalTopCandidates, type RoutedCommercialCandidate } from "@/lib/offers/commercial-channel-router";
import { createSubId, createTrackedUrl } from "@/lib/tracking/sub-id";
import type { Offer } from "@/types/domain";

const TOP30_LIMIT = 30;
const WHATSAPP_CHANNEL = "whatsapp" as const;
const BRAZIL_TIME_ZONE = "America/Sao_Paulo";

export type Top30WindowUsed = "today_brt" | "latest_cycle_today" | "24h_fallback";

export type Top30WhatsappResult = {
  windowUsed: Top30WindowUsed;
  created: number;
  reusedTodayDrafts: number;
  reused: number;
  skippedAlreadyPosted: number;
  skippedAlreadyApproved: number;
  skippedAlreadySeenToday: number;
  skippedOldDraft: number;
  skippedNotFresh: number;
  skippedAffiliateFailed: number;
  skipped: number;
  reasons: Record<string, number>;
};

type AffiliateLinkRow = { offer_id: string; channel: typeof WHATSAPP_CHANNEL; id: string; tracked_url: string };
type WhatsappPostRow = {
  id: string;
  offer_id: string;
  channel: typeof WHATSAPP_CHANNEL;
  status: string;
  created_at: string;
  posted_at: string | null;
  external_id: string | null;
};

export interface Top30WhatsappRepository {
  listOffersBetween(start: Date, end: Date): Promise<Offer[]>;
  listAffiliateLinks(): Promise<AffiliateLinkRow[]>;
  listWhatsappPosts(): Promise<WhatsappPostRow[]>;
  createAffiliateLink(input: { userId: string; offerId: string; originalUrl: string; trackedUrl: string; subId: string }): Promise<{ id: string; tracked_url: string }>;
  insertDraft(input: { userId: string; offerId: string; affiliateLinkId: string; content: string }): Promise<{ id: string; status: "draft"; channel: typeof WHATSAPP_CHANNEL }>;
}

export function getTodayBrtStart(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BRAZIL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), 3, 0, 0, 0));
}

export function prepareTop30WhatsappLegacyDrafts(repository: Top30WhatsappRepository, options: { now?: Date } = {}): Promise<Top30WhatsappResult> {
  return prepare(repository, options);
}

async function prepare(repository: Top30WhatsappRepository, options: { now?: Date }): Promise<Top30WhatsappResult> {
  const now = options.now ?? new Date();
  const todayStart = getTodayBrtStart(now);
  const fallbackStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [todayOffers, linksRows, postRows] = await Promise.all([
    repository.listOffersBetween(todayStart, now),
    repository.listAffiliateLinks(),
    repository.listWhatsappPosts(),
  ]);
  const links = new Map(linksRows.map((row) => [row.offer_id, row]));
  const reasons: Record<string, number> = { telegram_blocked: 1 };
  const postedOfferIds = new Set<string>();
  const approvedOfferIds = new Set<string>();
  const protectedPostIds = new Set<string>();
  const seenTodayIds = new Set<string>();
  const oldDraftIds = new Set<string>();
  const todayDraftIds = new Set<string>();

  for (const post of postRows) {
    const createdAt = new Date(post.created_at).getTime();
    const isToday = Number.isFinite(createdAt) && createdAt >= todayStart.getTime() && createdAt <= now.getTime();
    const hasPublicationEvidence = Boolean(post.posted_at || post.external_id);
    const isPosted = post.status === "posted" || hasPublicationEvidence || post.status === "published";
    const isApproved = post.status === "approved";
    if (isToday) seenTodayIds.add(post.offer_id);
    if (isPosted) {
      protectedPostIds.add(post.offer_id);
      if (post.status === "posted" || post.status === "published" || hasPublicationEvidence) postedOfferIds.add(post.offer_id);
    }
    if (isApproved) {
      protectedPostIds.add(post.offer_id);
      approvedOfferIds.add(post.offer_id);
    }
    if (post.status === "draft") {
      if (isToday && !hasPublicationEvidence) todayDraftIds.add(post.offer_id);
      if (!isToday) oldDraftIds.add(post.offer_id);
    }
  }

  const classifyFreshOffers = (offers: Offer[], minimumCreatedAt: Date) => {
    const fresh = offers.filter((offer) => {
      const createdAt = new Date(offer.created_at).getTime();
      if (!Number.isFinite(createdAt) || createdAt < minimumCreatedAt.getTime() || createdAt > now.getTime()) {
        increment(reasons, "not_fresh");
        return false;
      }
      return true;
    });
    return filterAndRoute(fresh, { protectedPostIds, postedOfferIds, approvedOfferIds, seenTodayIds, todayDraftIds, oldDraftIds, reasons });
  };

  const todayCandidates = classifyFreshOffers(todayOffers, todayStart);
  const latestCycle = latestCycleKey(todayCandidates);
  let selected = selectWithCyclePriority(todayCandidates, latestCycle);
  let windowUsed: Top30WindowUsed = latestCycle && selected.length > 0 ? "latest_cycle_today" : "today_brt";

  if (selected.length < TOP30_LIMIT) {
    const fallbackOffers = await repository.listOffersBetween(fallbackStart, now);
    const merged = [...new Map([...todayOffers, ...fallbackOffers].map((offer) => [offer.id, offer])).values()];
    const fallbackCandidates = classifyFreshOffers(merged, fallbackStart);
    selected = selectWithCyclePriority(fallbackCandidates, latestCycle);
    windowUsed = "24h_fallback";
  }

  for (const id of postedOfferIds) increment(reasons, "already_posted", 1);
  for (const id of approvedOfferIds) increment(reasons, "already_approved", 1);
  for (const id of oldDraftIds) increment(reasons, "old_draft", 1);
  const seenOnlyIds = [...seenTodayIds].filter((id) => !todayDraftIds.has(id) && !protectedPostIds.has(id));
  for (const id of seenOnlyIds) increment(reasons, "already_seen_today", 1);

  let created = 0;
  let reusedTodayDrafts = 0;
  let skippedAffiliateFailed = 0;
  let skippedCreateFailed = 0;
  for (const candidate of selected) {
    if (todayDraftIds.has(candidate.id)) {
      reusedTodayDrafts += 1;
      continue;
    }
    const offer = candidate as Offer;
    let link = links.get(candidate.id);
    if (!link) {
      try {
        const subId = createSubId(WHATSAPP_CHANNEL, offer.product_name, offer.id);
        const trackedUrl = createTrackedUrl(offer.original_url, subId);
        const createdLink = await repository.createAffiliateLink({ userId: offer.user_id, offerId: offer.id, originalUrl: offer.original_url, trackedUrl, subId });
        link = { offer_id: offer.id, channel: WHATSAPP_CHANNEL, ...createdLink };
      } catch {
        skippedAffiliateFailed += 1;
        increment(reasons, "affiliate_link_failed");
        continue;
      }
    }
    if (!link.tracked_url || link.tracked_url === offer.original_url) {
      skippedAffiliateFailed += 1;
      increment(reasons, "affiliate_link_failed");
      continue;
    }
    try {
      await repository.insertDraft({ userId: offer.user_id, offerId: offer.id, affiliateLinkId: link.id, content: materializeDraftContent(candidate.suggestedCopy, link.tracked_url) });
      created += 1;
    } catch (error) {
      if (isDuplicateError(error)) {
        reusedTodayDrafts += 1;
        continue;
      }
      skippedCreateFailed += 1;
      increment(reasons, "draft_create_failed");
    }
  }

  const skippedAlreadyPosted = postedOfferIds.size;
  const skippedAlreadyApproved = approvedOfferIds.size;
  const skippedAlreadySeenToday = seenOnlyIds.length;
  const skippedOldDraft = oldDraftIds.size;
  const skippedNotFresh = reasons.not_fresh ?? 0;
  const skipped = skippedAlreadyPosted + skippedAlreadyApproved + skippedAlreadySeenToday + skippedOldDraft + skippedNotFresh + skippedAffiliateFailed + skippedCreateFailed;
  return {
    windowUsed,
    created,
    reusedTodayDrafts,
    reused: reusedTodayDrafts,
    skippedAlreadyPosted,
    skippedAlreadyApproved,
    skippedAlreadySeenToday,
    skippedOldDraft,
    skippedNotFresh,
    skippedAffiliateFailed,
    skipped,
    reasons,
  };
}

function filterAndRoute(
  offers: Offer[],
  context: {
    protectedPostIds: Set<string>;
    postedOfferIds: Set<string>;
    approvedOfferIds: Set<string>;
    seenTodayIds: Set<string>;
    todayDraftIds: Set<string>;
    oldDraftIds: Set<string>;
    reasons: Record<string, number>;
  },
) {
  const eligibleOffers = offers.filter((offer) => {
    if (offer.status === "posted") {
      context.postedOfferIds.add(offer.id);
      return false;
    }
    if (offer.status === "approved") {
      context.approvedOfferIds.add(offer.id);
      return false;
    }
    if (context.protectedPostIds.has(offer.id)) return false;
    if (context.oldDraftIds.has(offer.id)) return false;
    if (context.seenTodayIds.has(offer.id) && !context.todayDraftIds.has(offer.id)) return false;
    return true;
  });
  return routeWhatsappCandidates(buildCommercialQueue(eligibleOffers, { limit: eligibleOffers.length }));
}

function latestCycleKey(offers: Offer[]): string | null {
  const ordered = [...offers].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return ordered.map((offer) => cycleKey(offer)).find(Boolean) ?? null;
}

function cycleKey(offer: Offer): string | null {
  const explainability = offer.explainability && typeof offer.explainability === "object" ? offer.explainability : null;
  const value = explainability?.correlation_id;
  return typeof value === "string" && value.trim() ? value : null;
}

function selectWithCyclePriority(candidates: RoutedCommercialCandidate[], latestCycle: string | null) {
  if (!latestCycle) return selectOperationalTopCandidates(candidates, { channel: "manual_whatsapp", limit: TOP30_LIMIT, diversity: true });
  const cycleCandidates = candidates.filter((candidate) => cycleKey(candidate) === latestCycle);
  const otherCandidates = candidates.filter((candidate) => cycleKey(candidate) !== latestCycle);
  const first = selectOperationalTopCandidates(cycleCandidates, { channel: "manual_whatsapp", limit: TOP30_LIMIT, diversity: true });
  if (first.length >= TOP30_LIMIT) return first;
  const selectedIds = new Set(first.map((candidate) => candidate.id));
  const rest = selectOperationalTopCandidates(otherCandidates.filter((candidate) => !selectedIds.has(candidate.id)), { channel: "manual_whatsapp", limit: TOP30_LIMIT - first.length, diversity: true });
  return [...first, ...rest];
}

function routeWhatsappCandidates(candidates: CommercialQueueCandidate[]) {
  return routeCommercialCandidates(candidates.filter((candidate) => candidate.status !== "posted" && candidate.status !== "approved" && !candidate.rejected && Boolean(candidate.image_url)))
    .filter((candidate) => candidate.targetQueue === "manual_whatsapp");
}

function materializeDraftContent(copy: string, trackedUrl: string) {
  const cleanCopy = copy.trimEnd();
  const urls = cleanCopy.match(/https?:\/\/\S+/g) ?? [];
  return urls.length > 0 ? cleanCopy.replace(/https?:\/\/\S+/g, trackedUrl).trimEnd() : `${cleanCopy}\n\n👉 ${trackedUrl}`;
}

function increment(reasons: Record<string, number>, reason: string, amount = 1) {
  reasons[reason] = (reasons[reason] ?? 0) + amount;
}

function isDuplicateError(error: unknown) {
  const message = String(error).toLowerCase();
  return message.includes("duplicate key") || message.includes("unique constraint");
}

export class SupabaseTop30WhatsappRepository implements Top30WhatsappRepository {
  constructor(private readonly client: SupabaseClient, private readonly userId: string) {}

  async listOffersBetween(start: Date, end: Date) {
    const { data, error } = await this.client.from("offers").select("*").eq("user_id", this.userId).in("platform", ["Shopee", "Mercado Livre"]).gte("created_at", start.toISOString()).lte("created_at", end.toISOString()).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Offer[];
  }

  async listAffiliateLinks() {
    const { data, error } = await this.client.from("affiliate_links").select("offer_id,channel,id,tracked_url").eq("user_id", this.userId).eq("channel", WHATSAPP_CHANNEL);
    if (error) throw new Error(error.message);
    return (data ?? []) as AffiliateLinkRow[];
  }

  async listWhatsappPosts() {
    const { data, error } = await this.client.from("posts").select("id,offer_id,channel,status,created_at,posted_at,external_id").eq("user_id", this.userId).eq("channel", WHATSAPP_CHANNEL).neq("status", "deleted");
    if (error) throw new Error(error.message);
    return (data ?? []) as WhatsappPostRow[];
  }

  async createAffiliateLink(input: { userId: string; offerId: string; originalUrl: string; trackedUrl: string; subId: string }) {
    const { data, error } = await this.client.from("affiliate_links").upsert({ user_id: input.userId, offer_id: input.offerId, channel: WHATSAPP_CHANNEL, original_url: input.originalUrl, tracked_url: input.trackedUrl, sub_id: input.subId }, { onConflict: "offer_id,channel" }).select("id,tracked_url").single();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("affiliate link unavailable after upsert");
    return data;
  }

  async insertDraft(input: { userId: string; offerId: string; affiliateLinkId: string; content: string }) {
    const { data, error } = await this.client.from("posts").insert({ user_id: input.userId, offer_id: input.offerId, affiliate_link_id: input.affiliateLinkId, channel: WHATSAPP_CHANNEL, content: input.content, status: "draft" }).select("id,status,channel").single();
    if (error || !data) throw new Error(error?.message ?? "draft insert failed");
    return data as { id: string; status: "draft"; channel: typeof WHATSAPP_CHANNEL };
  }
}
