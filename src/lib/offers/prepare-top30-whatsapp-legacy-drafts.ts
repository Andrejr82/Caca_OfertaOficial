import type { SupabaseClient } from "@supabase/supabase-js";
import { buildCommercialQueue, type CommercialQueueCandidate } from "@/lib/offers/commercial-curation-queue";
import { routeCommercialCandidates, selectOperationalTopCandidates, type RoutedCommercialCandidate } from "@/lib/offers/commercial-channel-router";
import { createSubId, createTrackedUrl } from "@/lib/tracking/sub-id";
import type { Offer } from "@/types/domain";

const COMMERCIAL_VERSION = "commercial-curation/v1";
const TOP30_LIMIT = 30;
const WHATSAPP_CHANNEL = "whatsapp" as const;

export type Top30WhatsappResult = {
  windowUsed: "48h" | "72h";
  created: number;
  reused: number;
  skipped: number;
  reasons: Record<string, number>;
};

type AffiliateLinkRow = { offer_id: string; channel: typeof WHATSAPP_CHANNEL; id: string; tracked_url: string };
type DraftRow = { offer_id: string; channel: typeof WHATSAPP_CHANNEL; id: string; status: "draft" };
type PublishedRow = { offer_id: string; channel: typeof WHATSAPP_CHANNEL; id: string; status: "published" };

export interface Top30WhatsappRepository {
  listOffersSince(since: Date): Promise<Offer[]>;
  listAffiliateLinks(): Promise<AffiliateLinkRow[]>;
  listDrafts(): Promise<DraftRow[]>;
  listPublished(): Promise<PublishedRow[]>;
  createAffiliateLink(input: { userId: string; offerId: string; originalUrl: string; trackedUrl: string; subId: string }): Promise<{ id: string; tracked_url: string }>;
  insertDraft(input: { userId: string; offerId: string; affiliateLinkId: string; content: string }): Promise<{ id: string; status: "draft"; channel: typeof WHATSAPP_CHANNEL }>;
}

export function prepareTop30WhatsappLegacyDrafts(repository: Top30WhatsappRepository, options: { now?: Date } = {}): Promise<Top30WhatsappResult> {
  return prepare(repository, options);
}

async function prepare(repository: Top30WhatsappRepository, options: { now?: Date }): Promise<Top30WhatsappResult> {
  const now = options.now ?? new Date();
  const [linksRows, draftRows, publishedRows] = await Promise.all([
    repository.listAffiliateLinks(),
    repository.listDrafts(),
    repository.listPublished(),
  ]);
  const links = new Map(linksRows.map((row) => [row.offer_id, row]));
  const drafts = new Map(draftRows.map((row) => [row.offer_id, row]));
  const published = new Set(publishedRows.map((row) => row.offer_id));
  const reasons: Record<string, number> = { telegram_blocked: 1 };
  let selected: RoutedCommercialCandidate[] = [];
  let windowUsed: "48h" | "72h" = "48h";
  let publishedProtected = 0;

  for (const hours of [48, 72] as const) {
    const since = new Date(now.getTime() - hours * 60 * 60 * 1000);
    const offers = await repository.listOffersSince(since);
    const routed = routeWhatsappCandidates(buildCommercialQueue(offers, { limit: offers.length }));
    publishedProtected = routed.filter((candidate) => published.has(candidate.id)).length;
    const safePool = routed.filter((candidate) => !published.has(candidate.id));
    selected = selectOperationalTopCandidates(safePool, { channel: "manual_whatsapp", limit: TOP30_LIMIT, diversity: true });
    windowUsed = hours === 72 && selected.length < TOP30_LIMIT ? "72h" : hours === 72 ? "72h" : "48h";
    if (selected.length >= TOP30_LIMIT || hours === 72) break;
  }

  if (publishedProtected > 0) reasons.published_protected = publishedProtected;
  let created = 0;
  let reused = 0;
  let skipped = 0;
  for (const candidate of selected) {
    const existingDraft = drafts.get(candidate.id);
    if (existingDraft) {
      reused += 1;
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
        skipped += 1;
        increment(reasons, "affiliate_link_failed");
        continue;
      }
    }
    if (!link.tracked_url || link.tracked_url === offer.original_url) {
      skipped += 1;
      increment(reasons, "affiliate_link_failed");
      continue;
    }
    const content = materializeDraftContent(candidate.suggestedCopy, link.tracked_url);
    try {
      await repository.insertDraft({ userId: offer.user_id, offerId: offer.id, affiliateLinkId: link.id, content });
      created += 1;
    } catch (error) {
      if (isDuplicateError(error)) {
        const currentDraft = (await repository.listDrafts()).find((draft) => draft.offer_id === offer.id);
        if (currentDraft) {
          reused += 1;
          continue;
        }
      }
      skipped += 1;
      increment(reasons, "draft_create_failed");
    }
  }
  return { windowUsed, created, reused, skipped, reasons };
}

function routeWhatsappCandidates(candidates: CommercialQueueCandidate[]) {
  return routeCommercialCandidates(candidates.filter((candidate) => !candidate.rejected && Boolean(candidate.image_url)))
    .filter((candidate) => candidate.targetQueue === "manual_whatsapp");
}

function materializeDraftContent(copy: string, trackedUrl: string) {
  const cleanCopy = copy.trimEnd();
  const urls = cleanCopy.match(/https?:\/\/\S+/g) ?? [];
  return urls.length > 0
    ? cleanCopy.replace(/https?:\/\/\S+/g, trackedUrl).trimEnd()
    : `${cleanCopy}\n\n👉 ${trackedUrl}`;
}

function increment(reasons: Record<string, number>, reason: string) {
  reasons[reason] = (reasons[reason] ?? 0) + 1;
}

function isDuplicateError(error: unknown) {
  const message = String(error).toLowerCase();
  return message.includes("duplicate key") || message.includes("unique constraint");
}

export class SupabaseTop30WhatsappRepository implements Top30WhatsappRepository {
  constructor(private readonly client: SupabaseClient, private readonly userId: string) {}

  async listOffersSince(since: Date) {
    const { data, error } = await this.client.from("offers").select("*").eq("user_id", this.userId).in("platform", ["Shopee", "Mercado Livre"]).gte("created_at", since.toISOString()).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Offer[];
  }

  async listAffiliateLinks() {
    const { data, error } = await this.client.from("affiliate_links").select("offer_id,channel,id,tracked_url").eq("user_id", this.userId).eq("channel", WHATSAPP_CHANNEL);
    if (error) throw new Error(error.message);
    return (data ?? []) as AffiliateLinkRow[];
  }

  async listDrafts() {
    const { data, error } = await this.client.from("posts").select("offer_id,channel,id,status").eq("user_id", this.userId).eq("channel", WHATSAPP_CHANNEL).eq("status", "draft");
    if (error) throw new Error(error.message);
    return (data ?? []) as DraftRow[];
  }

  async listPublished() {
    const { data, error } = await this.client.from("posts").select("offer_id,channel,id,status").eq("user_id", this.userId).eq("channel", WHATSAPP_CHANNEL).eq("status", "published");
    if (error) throw new Error(error.message);
    return (data ?? []) as PublishedRow[];
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
