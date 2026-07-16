import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { buildCopyV2ChannelCopy } from "../src/core/ai/prompt";
import { OFFICIAL_AI_CHANNELS, type OfficialAIChannel } from "../src/core/ai/types";

const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_UPDATE_CONCURRENCY = 5;
const SNAPSHOT_PAGE_SIZE = 1_000;

type Related<T> = T | T[] | null;

export interface BackfillDraft {
  id: string;
  user_id: string;
  offer_id: string;
  affiliate_link_id: string | null;
  channel: string;
  status: string;
  content: string;
  created_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
  offers: Related<{
    id: string;
    platform: string;
    product_name: string;
    current_price: number | string;
    old_price: number | string | null;
    category: string | null;
    explainability?: Record<string, unknown> | null;
    marketplace_metrics?: Record<string, unknown> | null;
  }>;
  affiliate_links: Related<{
    id: string;
    tracked_url: string;
  }>;
}

export interface BackfillRepository {
  fetchDraftBatch(offset: number, limit: number): Promise<BackfillDraft[]>;
  updateContent(input: {
    postId: string;
    currentContent: string;
    content: string;
  }): Promise<{ updated: boolean; error?: string }>;
}

export interface BackfillResult {
  draftsFound: number;
  alreadyCorrect: number;
  needsUpdate: number;
  invalid: number;
  invalidDetails: Array<{ postId: string; reason: string }>;
  updated: number;
  updatedPostIds: string[];
  distribution: {
    byChannel: Record<string, number>;
    byMarketplace: Record<string, number>;
  };
  failures: Array<{ postId: string; reason: string }>;
  examples: Array<{ postId: string; before: string; after: string }>;
}

interface ValidDraft {
  draft: BackfillDraft;
  channel: OfficialAIChannel;
  offer: NonNullable<Exclude<BackfillDraft["offers"], unknown[]>>;
  link: NonNullable<Exclude<BackfillDraft["affiliate_links"], unknown[]>>;
}

function one<T>(value: Related<T>): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function validateDraft(draft: BackfillDraft): ValidDraft | string {
  const offer = one(draft.offers);
  const link = one(draft.affiliate_links);
  if (!offer) return "offer relacionada ausente";
  if (!draft.affiliate_link_id || !link || !link.tracked_url?.trim()) return "affiliate_link ou tracked_url ausente";
  if (!OFFICIAL_AI_CHANNELS.includes(draft.channel as OfficialAIChannel)) return `canal inválido: ${draft.channel}`;
  if (!offer.product_name?.trim() || !offer.platform?.trim()) return "offer sem produto ou marketplace";
  const currentPrice = Number(offer.current_price);
  if (!Number.isFinite(currentPrice) || currentPrice < 0) return "preço atual inválido";
  return { draft, offer, link, channel: draft.channel as OfficialAIChannel };
}

export function buildExpectedContent(draft: BackfillDraft): string {
  const valid = validateDraft(draft);
  if (typeof valid === "string") throw new Error(valid);
  const originalPrice = valid.offer.old_price == null ? null : Number(valid.offer.old_price);
  const copy = buildCopyV2ChannelCopy({
    productName: valid.offer.product_name,
    marketplace: valid.offer.platform,
    category: valid.offer.category,
    currentPrice: Number(valid.offer.current_price),
    originalPrice: Number.isFinite(originalPrice) ? originalPrice : null,
    evidence: {
      explainability: valid.offer.explainability ?? {},
      marketplaceMetrics: valid.offer.marketplace_metrics ?? {}
    }
  }, valid.channel);
  return `${copy}\n\n${valid.link.tracked_url.trim()}`;
}

async function inConcurrentChunks<T>(items: readonly T[], concurrency: number, operation: (item: T) => Promise<void>) {
  for (let index = 0; index < items.length; index += concurrency) {
    await Promise.all(items.slice(index, index + concurrency).map(operation));
  }
}

export async function runBackfill(
  repository: BackfillRepository,
  options: { dryRun: boolean; batchSize?: number; updateConcurrency?: number }
): Promise<BackfillResult> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const updateConcurrency = options.updateConcurrency ?? DEFAULT_UPDATE_CONCURRENCY;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) throw new Error("batchSize deve estar entre 1 e 100");
  if (!Number.isInteger(updateConcurrency) || updateConcurrency < 1 || updateConcurrency > 5) {
    throw new Error("updateConcurrency deve estar entre 1 e 5");
  }

  const result: BackfillResult = {
    draftsFound: 0,
    alreadyCorrect: 0,
    needsUpdate: 0,
    invalid: 0,
    invalidDetails: [],
    updated: 0,
    updatedPostIds: [],
    distribution: { byChannel: {}, byMarketplace: {} },
    failures: [],
    examples: []
  };

  for (let offset = 0; ; offset += batchSize) {
    const batch = await repository.fetchDraftBatch(offset, batchSize);
    const pending: Array<{ draft: BackfillDraft; expected: string }> = [];
    result.draftsFound += batch.length;

    for (const draft of batch) {
      result.distribution.byChannel[draft.channel] = (result.distribution.byChannel[draft.channel] ?? 0) + 1;
      const valid = validateDraft(draft);
      if (typeof valid === "string") {
        result.invalid += 1;
        result.invalidDetails.push({ postId: draft.id, reason: valid });
        console.error(`[backfill-opac] post_id=${draft.id} motivo=${valid}`);
        continue;
      }
      const marketplace = valid.offer.platform;
      result.distribution.byMarketplace[marketplace] = (result.distribution.byMarketplace[marketplace] ?? 0) + 1;
      const expected = buildExpectedContent(draft);
      if (draft.content === expected) {
        result.alreadyCorrect += 1;
        continue;
      }
      result.needsUpdate += 1;
      if (result.examples.length < 5) result.examples.push({ postId: draft.id, before: draft.content, after: expected });
      pending.push({ draft, expected });
    }

    if (!options.dryRun) {
      await inConcurrentChunks(pending, updateConcurrency, async ({ draft, expected }) => {
        try {
          const update = await repository.updateContent({ postId: draft.id, currentContent: draft.content, content: expected });
          if (update.updated) {
            result.updated += 1;
            result.updatedPostIds.push(draft.id);
          } else {
            const reason = update.error ?? "update não alterou nenhuma linha (conteúdo/status mudou durante a execução)";
            result.failures.push({ postId: draft.id, reason });
            console.error(`[backfill-opac] post_id=${draft.id} motivo=${reason}`);
          }
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          result.failures.push({ postId: draft.id, reason });
          console.error(`[backfill-opac] post_id=${draft.id} motivo=${reason}`);
        }
      });
    }

    if (batch.length < batchSize) break;
  }
  return result;
}

class SupabaseBackfillRepository implements BackfillRepository {
  constructor(private readonly client: SupabaseClient) {}

  async fetchDraftBatch(offset: number, limit: number) {
    const { data, error } = await this.client
      .from("posts")
      .select(`
        id, user_id, offer_id, affiliate_link_id, channel, status, content, created_at, deleted_at, deleted_by,
        offers(id, platform, product_name, current_price, old_price, category, explainability, marketplace_metrics),
        affiliate_links(id, tracked_url)
      `)
      .eq("status", "draft")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + limit - 1);
    if (error) throw new Error(`falha ao carregar drafts: ${error.message}`);
    return (data ?? []) as unknown as BackfillDraft[];
  }

  async updateContent(input: { postId: string; currentContent: string; content: string }) {
    const { data, error } = await this.client
      .from("posts")
      .update({ content: input.content })
      .eq("id", input.postId)
      .eq("status", "draft")
      .eq("content", input.currentContent)
      .select("id");
    if (error) return { updated: false, error: error.message };
    return { updated: (data?.length ?? 0) === 1 };
  }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashRows(rows: readonly Record<string, unknown>[]) {
  const sorted = [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return createHash("sha256").update(canonical(sorted)).digest("hex");
}

async function fetchAll(client: SupabaseClient, table: string, columns = "*") {
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += SNAPSHOT_PAGE_SIZE) {
    const { data, error } = await client.from(table).select(columns).order("id").range(offset, offset + SNAPSHOT_PAGE_SIZE - 1);
    if (error) throw new Error(`falha no snapshot de ${table}: ${error.message}`);
    rows.push(...((data ?? []) as unknown as Record<string, unknown>[]));
    if ((data?.length ?? 0) < SNAPSHOT_PAGE_SIZE) break;
  }
  return rows;
}

async function exactCount(client: SupabaseClient, table: string, status?: string) {
  let query = client.from(table).select("id", { count: "exact", head: true });
  if (status) query = query.eq("status", status);
  const { count, error } = await query;
  if (error) throw new Error(`falha na contagem de ${table}: ${error.message}`);
  return count ?? 0;
}

interface SafetySnapshot {
  counts: { drafts: number; posts: number; affiliateLinks: number; offers: number };
  hashes: { preservedPostFields: string; allPostFieldsExceptContent: string; affiliateLinks: string; offers: string };
}

async function safetySnapshot(client: SupabaseClient): Promise<SafetySnapshot> {
  const drafts = await exactCount(client, "posts", "draft");
  const postsCount = await exactCount(client, "posts");
  const affiliateLinksCount = await exactCount(client, "affiliate_links");
  const offersCount = await exactCount(client, "offers");
  const posts = await fetchAll(client, "posts");
  const affiliateLinks = await fetchAll(client, "affiliate_links");
  const offers = await fetchAll(client, "offers");
  const preservedKeys = ["id", "user_id", "offer_id", "affiliate_link_id", "channel", "status", "created_at", "deleted_at", "deleted_by"];
  const preserved = posts.map((row) => Object.fromEntries(preservedKeys.map((key) => [key, row[key]])));
  const postsExceptContent = posts.map(({ content: _content, ...row }) => row);
  return {
    counts: { drafts, posts: postsCount, affiliateLinks: affiliateLinksCount, offers: offersCount },
    hashes: {
      preservedPostFields: hashRows(preserved),
      allPostFieldsExceptContent: hashRows(postsExceptContent),
      affiliateLinks: hashRows(affiliateLinks),
      offers: hashRows(offers)
    }
  };
}

const URL_PATTERN = /https?:\/\/[^\s]+/giu;
const HASHTAG_PATTERN = /(^|\s)#[\p{L}\p{N}_]+/u;

async function fetchPanelDrafts(client: SupabaseClient, channel: OfficialAIChannel) {
  const rows: BackfillDraft[] = [];
  for (let offset = 0; ; offset += SNAPSHOT_PAGE_SIZE) {
    const { data, error } = await client
      .from("posts")
      .select("*, offers(*), affiliate_links(tracked_url)")
      .eq("channel", channel)
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .range(offset, offset + SNAPSHOT_PAGE_SIZE - 1);
    if (error) throw new Error(`falha na query do painel (${channel}): ${error.message}`);
    rows.push(...((data ?? []) as unknown as BackfillDraft[]));
    if ((data?.length ?? 0) < SNAPSHOT_PAGE_SIZE) break;
  }
  return rows;
}

async function validateFinalState(client: SupabaseClient, updatedPostIds: readonly string[]) {
  const panelRows: BackfillDraft[] = [];
  for (const channel of OFFICIAL_AI_CHANNELS) panelRows.push(...await fetchPanelDrafts(client, channel));
  const validRows: BackfillDraft[] = [];
  const invalidRows: Array<{ postId: string; reason: string }> = [];
  const violations: Array<{ postId: string; reason: string }> = [];
  const byChannel: Record<string, number> = {};

  for (const row of panelRows) {
    byChannel[row.channel] = (byChannel[row.channel] ?? 0) + 1;
    const valid = validateDraft(row);
    if (typeof valid === "string") {
      invalidRows.push({ postId: row.id, reason: valid });
      continue;
    }
    validRows.push(row);
    const expected = buildExpectedContent(row);
    if (row.content !== expected) violations.push({ postId: row.id, reason: "conteúdo diverge do renderer oficial" });
    const urls = row.content.match(URL_PATTERN) ?? [];
    if (urls.length !== 1 || urls[0] !== valid.link.tracked_url.trim()) {
      violations.push({ postId: row.id, reason: `URLs inválidas: encontradas=${urls.length}` });
    }
    const hasHashtag = HASHTAG_PATTERN.test(row.content);
    if (row.channel === "instagram" && !hasHashtag) violations.push({ postId: row.id, reason: "Instagram sem hashtags" });
    if (row.channel !== "instagram" && hasHashtag) violations.push({ postId: row.id, reason: `${row.channel} contém hashtags` });
  }

  const panelIds = new Set(panelRows.map((row) => row.id));
  const updatedMissingFromPanel = updatedPostIds.filter((id) => !panelIds.has(id));
  return {
    panelQuery: '.from("posts").select("*, offers(*), affiliate_links(tracked_url)").eq("channel", channel).eq("status", "draft").order("created_at", { ascending: false })',
    panelDrafts: panelRows.length,
    validDrafts: validRows.length,
    correctDrafts: validRows.length - new Set(violations.map((item) => item.postId)).size,
    invalidRows,
    violations,
    byChannel,
    updatedMissingFromPanel,
    allUpdatedVisibleInPanel: updatedMissingFromPanel.length === 0
  };
}

export function createOperationalClient(
  url: string,
  serviceRoleKey: string,
  factory: (clientUrl: string, key: string, options: Record<string, unknown>) => unknown = createClient as never,
  transport: unknown = WebSocket
) {
  return factory(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport }
  }) as SupabaseClient;
}

function createSupabaseClient() {
  config({ path: ".env.local", quiet: true });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios");
  return createOperationalClient(url, serviceRoleKey);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has("--dry-run");
  const execute = args.has("--execute");
  if (dryRun === execute) throw new Error("use exatamente um modo: --dry-run ou --execute");

  const client = createSupabaseClient();
  const before = await safetySnapshot(client);
  console.log(`SAFETY_BEFORE=${JSON.stringify(before)}`);
  const repository = new SupabaseBackfillRepository(client);
  const result = await runBackfill(repository, {
    dryRun,
    batchSize: DEFAULT_BATCH_SIZE,
    updateConcurrency: DEFAULT_UPDATE_CONCURRENCY
  });
  console.log(`BACKFILL_RESULT=${JSON.stringify(result)}`);

  if (execute) {
    const after = await safetySnapshot(client);
    const validation = await validateFinalState(client, result.updatedPostIds);
    const safetyChecks = {
      postCountUnchanged: before.counts.posts === after.counts.posts,
      affiliateLinkCountUnchanged: before.counts.affiliateLinks === after.counts.affiliateLinks,
      offerCountUnchanged: before.counts.offers === after.counts.offers,
      preservedPostFieldsUnchanged: before.hashes.preservedPostFields === after.hashes.preservedPostFields,
      allPostFieldsExceptContentUnchanged: before.hashes.allPostFieldsExceptContent === after.hashes.allPostFieldsExceptContent,
      affiliateLinksUnchanged: before.hashes.affiliateLinks === after.hashes.affiliateLinks,
      offersUnchanged: before.hashes.offers === after.hashes.offers
    };
    console.log(`SAFETY_AFTER=${JSON.stringify(after)}`);
    console.log(`FINAL_VALIDATION=${JSON.stringify({ ...validation, safetyChecks })}`);
    const passed = result.failures.length === 0
      && validation.violations.length === 0
      && validation.allUpdatedVisibleInPanel
      && Object.values(safetyChecks).every(Boolean);
    if (!passed) process.exitCode = 1;
  }
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entrypoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  });
}
