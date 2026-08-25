import type { SupabaseClient } from "@supabase/supabase-js";
import { buildCommercialQueue, identifyLatestDiscoveryCohort, type CommercialQueueCandidate } from "@/lib/offers/commercial-curation-queue";
import { isManualExpressOffer, routeCommercialCandidates, selectOperationalTopCandidates, type RoutedCommercialCandidate } from "@/lib/offers/commercial-channel-router";
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
  selectedOfferIds: string[];
  currentCohortOfferIds: string[];
};

export type WhatsappEditorialBatchState = {
  version: 1;
  dayKey: string;
  activeOfferIds: string[];
  seenOfferIds: string[];
  exhausted: boolean;
};

export type WhatsappNextBatchResult = {
  mode: "next-batch";
  status: "selected" | "exhausted";
  selectedOfferIds: string[];
  selectedCount: number;
  availableBeforeSelection: number;
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

type HistoricalOfferIdentityRow = Pick<Offer, "id" | "platform" | "item_id" | "product_id" | "shopee_item_id" | "shopee_shop_id" | "original_url">;

export interface Top30WhatsappRepository {
  listOffersBetween(start: Date, end: Date): Promise<Offer[]>;
  listAffiliateLinks(): Promise<AffiliateLinkRow[]>;
  listWhatsappPosts(): Promise<WhatsappPostRow[]>;
  listHistoricalOffers: () => Promise<HistoricalOfferIdentityRow[]>;
  createAffiliateLink(input: { userId: string; offerId: string; originalUrl: string; trackedUrl: string; subId: string }): Promise<{ id: string; tracked_url: string }>;
  insertDraft(input: { userId: string; offerId: string; affiliateLinkId: string; content: string }): Promise<{ id: string; status: "draft"; channel: typeof WHATSAPP_CHANNEL }>;
  loadWhatsappEditorialBatchState?: () => Promise<WhatsappEditorialBatchState | null>;
  saveWhatsappEditorialBatchState?: (state: WhatsappEditorialBatchState) => Promise<void>;
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
  const dayKey = getBrtDayKey(now);
  const todayStart = getTodayBrtStart(now);
  const todayOffersForState = await repository.listOffersBetween(todayStart, now);
  const currentCohortOfferIds = identifyLatestDiscoveryCohort(todayOffersForState, now).map((offer) => offer.id);
  const existingState = await repository.loadWhatsappEditorialBatchState?.();
  if (existingState?.version === 1 && existingState.dayKey === dayKey && existingState.activeOfferIds.length > 0) {
    const activeIds = new Set(existingState.activeOfferIds);
    const activeRows = todayOffersForState.filter((offer) => activeIds.has(offer.id));
    const latestCohort = new Set(currentCohortOfferIds);
    const stateHasCurrentCohort = activeRows.length > 0 && (latestCohort.size === 0 || activeRows.some((offer) => latestCohort.has(offer.id)));
    if (stateHasCurrentCohort) return { ...emptyOpeningResult(), selectedOfferIds: existingState.activeOfferIds, currentCohortOfferIds, windowUsed: "today_brt" };
  }
  const fallbackStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [postRows, historicalOffers] = await Promise.all([
    repository.listWhatsappPosts(),
    repository.listHistoricalOffers(),
  ]);
  const todayOffers = todayOffersForState;
  const reasons: Record<string, number> = { telegram_blocked: 1 };
  const postedOfferIds = new Set<string>();
  const approvedOfferIds = new Set<string>();
  const protectedPostIds = new Set<string>();
  const seenTodayIds = new Set<string>();
  const oldDraftIds = new Set<string>();
  const todayDraftIds = new Set<string>();
  const protectedIdentities = new Set<string>();
  const protectedHistoricalOffers: HistoricalOfferIdentityRow[] = [];
  const protectedHistoricalOfferIds = new Set<string>();

  const historicalOffersById = new Map(historicalOffers.map((offer) => [offer.id, offer]));

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
    if (post.status === "deleted") protectedPostIds.add(post.offer_id);
    if (post.status === "deleted" || isPosted) {
      const historicalOffer = historicalOffersById.get(post.offer_id);
      if (historicalOffer) {
        const identity = offerIdentity(historicalOffer);
        protectedIdentities.add(identity);
        protectedHistoricalOffers.push(historicalOffer);
        for (const candidate of historicalOffers) {
          if (offerIdentity(candidate) === identity) protectedHistoricalOfferIds.add(candidate.id);
        }
      }
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
      if (isManualExpressOffer(offer)) {
        increment(reasons, "manual_express_excluded_from_editorial", 1);
        return false;
      }
      const createdAt = new Date(offer.created_at).getTime();
      if (!Number.isFinite(createdAt) || createdAt < minimumCreatedAt.getTime() || createdAt > now.getTime()) {
        increment(reasons, "not_fresh");
        return false;
      }
      return true;
    });
    const latestCycleOffers = identifyLatestDiscoveryCohort(fresh, now);
    return filterAndRoute(latestCycleOffers, { protectedPostIds, protectedIdentities, protectedHistoricalOffers, protectedHistoricalOfferIds, postedOfferIds, approvedOfferIds, seenTodayIds, todayDraftIds, oldDraftIds, reasons });
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
    increment(reasons, "legacy_copy_generation_disabled");
  }

  const skippedAlreadyPosted = postedOfferIds.size;
  const skippedAlreadyApproved = approvedOfferIds.size;
  const skippedAlreadySeenToday = seenOnlyIds.length;
  const skippedOldDraft = oldDraftIds.size;
  const skippedNotFresh = reasons.not_fresh ?? 0;
  const skipped = skippedAlreadyPosted + skippedAlreadyApproved + skippedAlreadySeenToday + skippedOldDraft + skippedNotFresh + skippedAffiliateFailed + skippedCreateFailed + (reasons.legacy_copy_generation_disabled ?? 0);
  const result = {
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
    selectedOfferIds: selected.map((candidate) => candidate.id),
    currentCohortOfferIds,
  };
  await repository.saveWhatsappEditorialBatchState?.({
    version: 1,
    dayKey: getBrtDayKey(now),
    activeOfferIds: result.selectedOfferIds,
    seenOfferIds: result.selectedOfferIds,
    exhausted: result.selectedOfferIds.length === 0,
  });
  return result;
}

/** Selects the next editorial batch. Unlike opening, this intentionally does not use latest-cycle cohorting. */
export async function rotateNextWhatsappEditorialBatch(repository: Top30WhatsappRepository, options: { now?: Date } = {}): Promise<WhatsappNextBatchResult> {
  const now = options.now ?? new Date();
  const todayStart = getTodayBrtStart(now);
  const dayKey = getBrtDayKey(now);
  const state = await repository.loadWhatsappEditorialBatchState?.();
  const active = state?.dayKey === dayKey ? new Set(state.activeOfferIds) : new Set<string>();
  const seen = state?.dayKey === dayKey ? new Set(state.seenOfferIds) : new Set<string>();
  const [offers, posts, historicalOffers] = await Promise.all([
    repository.listOffersBetween(todayStart, now),
    repository.listWhatsappPosts(),
    repository.listHistoricalOffers(),
  ]);
  const protectedIds = new Set<string>();
  const protectedIdentities = new Set<string>();
  const historicalIds = new Set<string>();
  const postedOrProtected = new Set<string>();
  for (const post of posts) {
    const published = post.status === "posted" || post.status === "published" || Boolean(post.posted_at || post.external_id);
    if (published || post.status === "approved" || post.status === "rejected" || post.status === "deferred" || post.status === "deleted") {
      protectedIds.add(post.offer_id);
      postedOrProtected.add(post.offer_id);
    }
  }
  for (const historical of historicalOffers) {
    if (postedOrProtected.has(historical.id)) {
      historicalIds.add(historical.id);
      protectedIdentities.add(offerIdentity(historical));
    }
  }
  const eligible = offers.filter((offer) => {
    const createdAt = new Date(offer.created_at).getTime();
    if (isManualExpressOffer(offer) || !Number.isFinite(createdAt) || createdAt < todayStart.getTime() || createdAt > now.getTime()) return false;
    if (active.has(offer.id) || seen.has(offer.id) || protectedIds.has(offer.id) || historicalIds.has(offer.id)) return false;
    if (["posted", "approved", "rejected", "deferred", "deleted"].includes(String(offer.status))) return false;
    if (protectedIdentities.has(offerIdentity(offer))) return false;
    return true;
  });
  const routed = routeWhatsappCandidates(buildCommercialQueue(eligible, { limit: eligible.length }));
  const selected = selectOperationalTopCandidates(routed, { channel: "operational", limit: TOP30_LIMIT, diversity: true });
  const nextState: WhatsappEditorialBatchState = {
    version: 1,
    dayKey,
    activeOfferIds: selected.map((candidate) => candidate.id),
    seenOfferIds: [...new Set([...seen, ...active, ...selected.map((candidate) => candidate.id)])],
    exhausted: selected.length === 0,
  };
  await repository.saveWhatsappEditorialBatchState?.(nextState);
  return {
    mode: "next-batch",
    status: selected.length > 0 ? "selected" : "exhausted",
    selectedOfferIds: selected.map((candidate) => candidate.id),
    selectedCount: selected.length,
    availableBeforeSelection: routed.length,
  };
}

function getBrtDayKey(now: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BRAZIL_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function emptyOpeningResult(): Top30WhatsappResult {
  return { windowUsed: "today_brt", created: 0, reusedTodayDrafts: 0, reused: 0, skippedAlreadyPosted: 0, skippedAlreadyApproved: 0, skippedAlreadySeenToday: 0, skippedOldDraft: 0, skippedNotFresh: 0, skippedAffiliateFailed: 0, skipped: 0, reasons: {}, selectedOfferIds: [], currentCohortOfferIds: [] };
}

function filterAndRoute(
  offers: Offer[],
  context: {
    protectedPostIds: Set<string>;
    protectedIdentities: Set<string>;
    protectedHistoricalOffers: HistoricalOfferIdentityRow[];
    protectedHistoricalOfferIds: Set<string>;
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
    if (offer.status === "rejected" || offer.status === "deferred") return false;
    if (context.protectedPostIds.has(offer.id)) return false;
    if (context.protectedHistoricalOfferIds.has(offer.id) || context.protectedIdentities.has(offerIdentity(offer)) || context.protectedHistoricalOffers.some((historicalOffer) => sameOfferIdentity(historicalOffer, offer))) return false;
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
  if (!latestCycle) return selectOperationalTopCandidates(candidates, { channel: "operational", limit: TOP30_LIMIT, diversity: true });
  const cycleCandidates = candidates.filter((candidate) => cycleKey(candidate) === latestCycle);
  const otherCandidates = candidates.filter((candidate) => cycleKey(candidate) !== latestCycle);
  const first = selectOperationalTopCandidates(cycleCandidates, { channel: "operational", limit: TOP30_LIMIT, diversity: true });
  if (first.length >= TOP30_LIMIT) return first;
  const selectedIds = new Set(first.map((candidate) => candidate.id));
  const rest = selectOperationalTopCandidates(otherCandidates.filter((candidate) => !selectedIds.has(candidate.id)), { channel: "operational", limit: TOP30_LIMIT - first.length, diversity: true });
  return [...first, ...rest];
}

function routeWhatsappCandidates(candidates: CommercialQueueCandidate[]) {
  return routeCommercialCandidates(candidates.filter((candidate) => candidate.status !== "posted" && candidate.status !== "approved" && !candidate.rejected && Boolean(candidate.image_url)))
    .filter((candidate) => candidate.targetQueue !== "panel_only");
}

function offerIdentity(offer: Pick<Offer, "platform" | "item_id" | "product_id" | "shopee_item_id" | "shopee_shop_id" | "original_url">) {
  const platform = String(offer.platform || "").toLowerCase();
  if (platform === "shopee") {
    const item = offer.shopee_item_id || offer.item_id;
    if (item) return `shopee:item:${String(item).trim()}`;
    if (offer.original_url) return `shopee:url:${canonicalUrl(offer.original_url)}`;
  }
  if (platform === "mercado livre") {
    if (offer.item_id) return `mercadolivre:item:${String(offer.item_id).replace(/-/g, "").toUpperCase()}`;
    if (offer.product_id) return `mercadolivre:product:${String(offer.product_id).toUpperCase()}`;
    if (offer.original_url) return `mercadolivre:url:${canonicalUrl(offer.original_url)}`;
  }
  return `${platform}:url:${canonicalUrl(offer.original_url)}`;
}

function sameOfferIdentity(
  left: Pick<Offer, "platform" | "item_id" | "product_id" | "shopee_item_id" | "shopee_shop_id" | "original_url">,
  right: Pick<Offer, "platform" | "item_id" | "product_id" | "shopee_item_id" | "shopee_shop_id" | "original_url">,
) {
  return offerIdentity(left) === offerIdentity(right);
}

function canonicalUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|matt_|sid|wid|action|sp_atk)/i.test(key)) url.searchParams.delete(key);
    return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/, "")}${url.search}`.toLowerCase();
  } catch {
    return value.trim().toLowerCase().replace(/\/+$/, "");
  }
}

function increment(reasons: Record<string, number>, reason: string, amount = 1) {
  reasons[reason] = (reasons[reason] ?? 0) + amount;
}

export class SupabaseTop30WhatsappRepository implements Top30WhatsappRepository {
  constructor(private readonly client: SupabaseClient, private readonly userId: string) {}

  async listOffersBetween(start: Date, end: Date) {
    const { data, error } = await this.client.from("offers").select("*").eq("user_id", this.userId).in("platform", ["Shopee", "Mercado Livre", "Amazon"]).gte("created_at", start.toISOString()).lte("created_at", end.toISOString()).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Offer[];
  }

  async listAffiliateLinks() {
    const { data, error } = await this.client.from("affiliate_links").select("offer_id,channel,id,tracked_url").eq("user_id", this.userId).eq("channel", WHATSAPP_CHANNEL);
    if (error) throw new Error(error.message);
    return (data ?? []) as AffiliateLinkRow[];
  }

  async listWhatsappPosts() {
    const { data, error } = await this.client
      .from("posts")
      .select("id,offer_id,channel,status,created_at,posted_at,external_id")
      .eq("user_id", this.userId)
      .eq("channel", WHATSAPP_CHANNEL)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw new Error(error.message);
    return (data ?? []) as WhatsappPostRow[];
  }

  async listHistoricalOffers() {
    const { data, error } = await this.client
      .from("offers")
      .select("id,platform,item_id,product_id,shopee_item_id,shopee_shop_id,original_url")
      .eq("user_id", this.userId)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw new Error(error.message);
    return (data ?? []) as HistoricalOfferIdentityRow[];
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

  async loadWhatsappEditorialBatchState() {
    const { data, error } = await this.client.from("app_settings").select("value").eq("user_id", this.userId).eq("key", "whatsapp_editorial_batch_state").maybeSingle();
    if (error) throw new Error(error.message);
    return (data?.value ?? null) as WhatsappEditorialBatchState | null;
  }

  async saveWhatsappEditorialBatchState(state: WhatsappEditorialBatchState) {
    const { error } = await this.client.from("app_settings").upsert({ user_id: this.userId, key: "whatsapp_editorial_batch_state", value: state, updated_at: new Date().toISOString() }, { onConflict: "user_id,key" });
    if (error) throw new Error(error.message);
  }
}
