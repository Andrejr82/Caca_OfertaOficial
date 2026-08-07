import { pathToFileURL } from "node:url";
import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { buildCommercialQueue, type CommercialQueueCandidate } from "../src/lib/offers/commercial-curation-queue";
import { routeCommercialCandidates, selectOperationalTopCandidates, type RoutedCommercialCandidate } from "../src/lib/offers/commercial-channel-router";
import { createSubId, createTrackedUrl } from "../src/lib/tracking/sub-id";
import type { Offer } from "../src/types/domain";

export type BridgeChannel = "whatsapp" | "telegram";
const CHANNELS: readonly BridgeChannel[] = ["whatsapp", "telegram"];
const HARD_LIMIT_PER_CHANNEL = 1;

export interface BridgeDraftRow {
  id: string;
  offer_id: string;
  channel: BridgeChannel;
  status: string;
  content: string;
  affiliate_link_id: string | null;
  external_id?: string | null;
  posted_at?: string | null;
  offers?: { id: string; product_name: string; platform: string; image_url: string | null; current_price: number } | null;
  affiliate_links?: { tracked_url: string } | null;
}

export interface BridgeCandidate {
  offerId: string;
  title: string;
  marketplace: string;
  price: number;
  score: number;
  channel: BridgeChannel;
  hasImage: boolean;
  affiliateLink: { exists: boolean; trackedUrl: string | null };
  existingDraft: { exists: boolean; postId: string | null };
  candidate: RoutedCommercialCandidate;
}

export interface BridgeRepository {
  listOffers(): Promise<Offer[]>;
  listAffiliateLinks(channel: BridgeChannel): Promise<Array<{ offer_id: string; channel: BridgeChannel; id: string; tracked_url: string }>>;
  createAffiliateLink(input: { userId: string; offerId: string; channel: BridgeChannel; originalUrl: string; trackedUrl: string; subId: string }): Promise<{ id: string; tracked_url: string }>;
  listDrafts(channel: BridgeChannel): Promise<Array<{ offer_id: string; channel: BridgeChannel; id: string; status: string }>>;
  listPublished(channel: BridgeChannel): Promise<Array<{ offer_id: string; channel: BridgeChannel; id: string; status: string }>>;
  insertDraft(input: { userId: string; offerId: string; channel: BridgeChannel; affiliateLinkId: string; content: string }): Promise<{ id: string; status: string; channel: BridgeChannel }>;
  listPanelDrafts(channel: BridgeChannel): Promise<BridgeDraftRow[]>;
}

export interface BridgeResult {
  mode: "dry-run" | "execute";
  candidates: BridgeCandidate[];
  drafts: Array<{ channel: BridgeChannel; offerId: string; action: "created" | "reused"; postId: string }>;
  validation: { whatsapp: PanelValidation; telegram: PanelValidation };
}

export interface PanelValidation {
  visible: boolean;
  postId: string | null;
  hasImage: boolean;
  hasCopy: boolean;
  affiliateLink: string | null;
  isAffiliate: boolean;
  isDraft: boolean;
  notPublished: boolean;
}

function materializeCopy(copy: string, trackedUrl: string) {
  const cleanCopy = copy.trimEnd();
  return /https?:\/\/\S+/.test(cleanCopy)
    ? cleanCopy.replace(/https?:\/\/\S+/g, trackedUrl).trimEnd()
    : `${cleanCopy}\n\n👉 ${trackedUrl}`;
}

function selectByChannel(candidates: RoutedCommercialCandidate[], channel: BridgeChannel) {
  const target = channel === "whatsapp" ? "manual_whatsapp" : "telegram";
  return selectOperationalTopCandidates(candidates, { channel: target, limit: HARD_LIMIT_PER_CHANNEL, diversity: false })[0] ?? null;
}

export function selectBridgeCandidates(offers: Offer[], existingLinks: Map<string, { id: string; tracked_url: string }>, existingDrafts: Map<string, { id: string; status: string }>, publishedKeys = new Set<string>()) {
  const curated = buildCommercialQueue(offers, { limit: offers.length }).filter((candidate) => Boolean(candidate.image_url));
  const routed = routeCommercialCandidates(curated.map((candidate) => ({ ...candidate, original_url: candidate.original_url }))).filter((candidate) => !publishedKeys.has(`${candidate.id}:${candidate.targetQueue === "manual_whatsapp" ? "whatsapp" : candidate.targetQueue === "telegram" ? "telegram" : ""}`));
  return CHANNELS.map((channel) => {
    const selected = selectByChannel(routed, channel);
    if (!selected) return null;
    const key = `${selected.id}:${channel}`;
    return {
      offerId: selected.id,
      title: selected.product_name,
      marketplace: selected.platform,
      price: Number(selected.current_price),
      score: selected.achadinhoScore,
      channel,
      hasImage: Boolean(selected.image_url),
      affiliateLink: { exists: existingLinks.has(key), trackedUrl: existingLinks.get(key)?.tracked_url ?? null },
      existingDraft: { exists: existingDrafts.has(key), postId: existingDrafts.get(key)?.id ?? null },
      candidate: selected
    } satisfies BridgeCandidate;
  }).filter((item): item is BridgeCandidate => item !== null);
}

export async function runControlledBridge(repository: BridgeRepository, options: { dryRun: boolean }): Promise<BridgeResult> {
  const offers = await repository.listOffers();
  const eligibleOffers = offers.filter((offer) => offer.platform === "Shopee" || offer.platform === "Mercado Livre");
  const [linkRows, draftRows, publishedRows] = await Promise.all([
    Promise.all(CHANNELS.map(async (channel) => repository.listAffiliateLinks(channel))),
    Promise.all(CHANNELS.map(async (channel) => repository.listDrafts(channel))),
    Promise.all(CHANNELS.map(async (channel) => repository.listPublished(channel)))
  ]);
  const links = new Map(linkRows.flat().map((row) => [`${row.offer_id}:${row.channel}`, row]));
  const drafts = new Map(draftRows.flat().map((row) => [`${row.offer_id}:${row.channel}`, row]));
  const publishedKeys = new Set(publishedRows.flat().map((row) => `${row.offer_id}:${row.channel}`));
  const candidates = selectBridgeCandidates(eligibleOffers, links, drafts, publishedKeys);
  const result: BridgeResult = { mode: options.dryRun ? "dry-run" : "execute", candidates, drafts: [], validation: { whatsapp: emptyValidation(), telegram: emptyValidation() } };
  if (options.dryRun) return result;

  for (const item of candidates) {
    const key = `${item.offerId}:${item.channel}`;
    const latestPublished = (await repository.listPublished(item.channel)).find((row) => row.offer_id === item.offerId);
    if (latestPublished) continue;
    const existingDraft = drafts.get(key) ?? (await repository.listDrafts(item.channel)).find((row) => row.offer_id === item.offerId) ?? null;
    if (existingDraft) {
      result.drafts.push({ channel: item.channel, offerId: item.offerId, action: "reused", postId: existingDraft.id });
      continue;
    }
    const offer = eligibleOffers.find((row) => row.id === item.offerId)!;
    const existingLink = links.get(key) ?? (await repository.listAffiliateLinks(item.channel)).find((row) => row.offer_id === offer.id) ?? null;
    let link = existingLink;
    if (!link) {
      try {
        link = await repository.createAffiliateLink({ userId: offer.user_id, offerId: offer.id, channel: item.channel, originalUrl: offer.original_url, subId: createSubId(item.channel, offer.product_name, offer.id), trackedUrl: createTrackedUrl(offer.original_url, createSubId(item.channel, offer.product_name, offer.id)) });
      } catch (error) {
        if (!String(error).toLowerCase().includes("duplicate key") && !String(error).toLowerCase().includes("unique constraint")) throw error;
        link = (await repository.listAffiliateLinks(item.channel)).find((row) => row.offer_id === offer.id) ?? null;
        if (!link) throw error;
      }
    }
    if (!link) throw new Error(`affiliate link unavailable for ${key}`);
    const post = await repository.insertDraft({ userId: offer.user_id, offerId: offer.id, channel: item.channel, affiliateLinkId: link.id, content: materializeCopy(item.candidate.suggestedCopy, link.tracked_url) });
    result.drafts.push({ channel: item.channel, offerId: item.offerId, action: "created", postId: post.id });
  }
  result.validation = {
    whatsapp: validatePanelDraft(await repository.listPanelDrafts("whatsapp"), result.candidates.find((item) => item.channel === "whatsapp")),
    telegram: validatePanelDraft(await repository.listPanelDrafts("telegram"), result.candidates.find((item) => item.channel === "telegram"))
  };
  return result;
}

function emptyValidation(): PanelValidation { return { visible: false, postId: null, hasImage: false, hasCopy: false, affiliateLink: null, isAffiliate: false, isDraft: false, notPublished: true }; }

function validatePanelDraft(rows: BridgeDraftRow[], candidate?: BridgeCandidate): PanelValidation {
  const row = candidate ? rows.find((item) => item.offer_id === candidate.offerId && item.channel === candidate.channel) : undefined;
  const trackedUrl = row?.affiliate_links?.tracked_url ?? null;
  return {
    visible: Boolean(row), postId: row?.id ?? null, hasImage: Boolean(row?.offers?.image_url), hasCopy: Boolean(row?.content?.trim()), affiliateLink: trackedUrl,
    isAffiliate: Boolean(trackedUrl && trackedUrl !== candidate?.candidate.original_url && trackedUrl.includes("/go/")), isDraft: row?.status === "draft", notPublished: !row?.external_id && !row?.posted_at
  };
}

class SupabaseBridgeRepository implements BridgeRepository {
  constructor(private readonly client: SupabaseClient) {}
  async listOffers() { const { data, error } = await this.client.from("offers").select("*").in("platform", ["Shopee", "Mercado Livre"]); if (error) throw new Error(error.message); return (data ?? []) as Offer[]; }
  async listAffiliateLinks(channel: BridgeChannel) { const { data, error } = await this.client.from("affiliate_links").select("offer_id,channel,id,tracked_url").eq("channel", channel); if (error) throw new Error(error.message); return (data ?? []) as Array<{ offer_id: string; channel: BridgeChannel; id: string; tracked_url: string }>; }
  async createAffiliateLink(input: { userId: string; offerId: string; channel: BridgeChannel; originalUrl: string; trackedUrl: string; subId: string }) {
    const { data, error } = await this.client.from("affiliate_links").upsert({ user_id: input.userId, offer_id: input.offerId, channel: input.channel, original_url: input.originalUrl, tracked_url: input.trackedUrl, sub_id: input.subId }, { onConflict: "offer_id,channel", ignoreDuplicates: true }).select("id,tracked_url").maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return data;
    const { data: reused, error: reuseError } = await this.client.from("affiliate_links").select("id,tracked_url").eq("offer_id", input.offerId).eq("channel", input.channel).maybeSingle();
    if (reuseError) throw new Error(reuseError.message);
    if (!reused) throw new Error("affiliate link insert returned no row and no existing link was found");
    return reused;
  }
  async listDrafts(channel: BridgeChannel) { const { data, error } = await this.client.from("posts").select("offer_id,channel,id,status").eq("channel", channel).eq("status", "draft"); if (error) throw new Error(error.message); return (data ?? []) as Array<{ offer_id: string; channel: BridgeChannel; id: string; status: string }>; }
  async listPublished(channel: BridgeChannel) { const { data, error } = await this.client.from("posts").select("offer_id,channel,id,status").eq("channel", channel).eq("status", "published"); if (error) throw new Error(error.message); return (data ?? []) as Array<{ offer_id: string; channel: BridgeChannel; id: string; status: string }>; }
  async insertDraft(input: { userId: string; offerId: string; channel: BridgeChannel; affiliateLinkId: string; content: string }) { const { data, error } = await this.client.from("posts").insert({ user_id: input.userId, offer_id: input.offerId, channel: input.channel, affiliate_link_id: input.affiliateLinkId, content: input.content, status: "draft" }).select("id,status,channel").single(); if (error || !data) throw new Error(error?.message || "draft insert failed"); return data; }
  async listPanelDrafts(channel: BridgeChannel) { const { data, error } = await this.client.from("posts").select("id,offer_id,channel,status,content,affiliate_link_id,external_id,posted_at,offers(id,product_name,platform,image_url,current_price),affiliate_links(tracked_url)").eq("channel", channel).eq("status", "draft"); if (error) throw new Error(error.message); return (data ?? []) as BridgeDraftRow[]; }
}

function createRepository() { config({ path: ".env.local", quiet: true }); const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY; if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios"); return new SupabaseBridgeRepository(createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false }, realtime: { transport: WebSocket } })); }

async function main() {
  const args = new Set(process.argv.slice(2)); const dryRun = args.has("--dry-run"); const execute = args.has("--execute");
  if (dryRun === execute || args.has("--top30") || args.has("--publish") || args.has("--send")) throw new Error("use exatamente --dry-run ou --execute; Top 30/publicação/envio são proibidos");
  const result = await runControlledBridge(createRepository(), { dryRun });
  console.log(JSON.stringify(result, null, 2));
  if (!dryRun) {
    const validations = result.candidates.map((item) => result.validation[item.channel]);
    if (validations.some((validation) => !validation.visible || !validation.isDraft || !validation.hasImage || !validation.hasCopy || !validation.isAffiliate || !validation.notPublished)) process.exitCode = 1;
  }
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entrypoint) main().catch((error) => { console.error(error instanceof Error ? error.stack ?? error.message : error); process.exitCode = 1; });

export { SupabaseBridgeRepository };
