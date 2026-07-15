import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  OfficialAIAuditRecord,
  OfficialAIContentPort,
  OfficialAIDraftedResult,
  OfficialAIIdempotencyPort,
  OfficialAIOffer,
  OfficialAIOfferPort,
  OfficialAIResult
} from "@/core/ai";
import type { OfficialAIApprovalPort, OfficialAIServiceDependencies } from "@/core/ai/ports";
import type { StateServiceDependencies } from "@/core/state";
import { createSubId, createTrackedUrl } from "@/lib/tracking/sub-id";
import { offerStateVersion, transitionOfficialOfferState } from "@/lib/state/official-state-service";

const IDEMPOTENCY_PREFIX = "pmav5.ai.idempotency.";
const POLL_ATTEMPTS = 50;
const POLL_INTERVAL_MS = 100;

export const DEFAULT_BATCH_SIZE = 50;
const MAX_BATCH_SIZE = 1000;

export function getOfficialAIBatchSize(): number {
  const raw = process.env.OFFICIAL_AI_BATCH_SIZE;
  if (raw === undefined || raw === null || raw.trim() === "") {
    return DEFAULT_BATCH_SIZE;
  }
  const parsed = Number(raw);
  if (Number.isNaN(parsed) || !Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_BATCH_SIZE;
  }
  const floored = Math.floor(parsed);
  if (floored <= 0) {
    return DEFAULT_BATCH_SIZE;
  }
  if (floored > MAX_BATCH_SIZE) {
    return MAX_BATCH_SIZE;
  }
  return floored;
}

interface StoredAIIdempotency {
  fingerprint: string;
  status: "pending" | "completed";
  result?: OfficialAIResult | OfficialAIDraftedResult;
}

interface PendingAICommand {
  fingerprint: string;
  result: Promise<OfficialAIResult>;
  resolve(result: OfficialAIResult): void;
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function settingKey(idempotencyKey: string) {
  return `${IDEMPOTENCY_PREFIX}${idempotencyKey}`;
}

export class SupabaseOfficialAIAdapter implements OfficialAIOfferPort, OfficialAIContentPort, OfficialAIIdempotencyPort {
  private readonly pending = new Map<string, PendingAICommand>();

  constructor(
    private readonly client: SupabaseClient,
    private readonly tenantId: string
  ) {}

  async findById(offerId: string, tenantId: string): Promise<OfficialAIOffer | null> {
    if (tenantId !== this.tenantId) return null;
    const { data, error } = await this.client
      .from("offers")
      .select("id,user_id,status,platform,product_name,original_url,image_url,current_price,old_price,category,explainability")
      .eq("id", offerId)
      .eq("user_id", tenantId)
      .maybeSingle();
    if (error) throw new Error(`Official AI offer read failed: ${error.message}`);
    if (!data) return null;
    return {
      id: data.id,
      tenantId: data.user_id,
      state: data.status,
      version: offerStateVersion(data.status),
      marketplace: data.platform,
      productName: data.product_name,
      originalUrl: data.original_url,
      imageUrl: data.image_url ?? "",
      currentPrice: Number(data.current_price),
      originalPrice: data.old_price == null ? null : Number(data.old_price),
      category: data.category,
      explainability: (data.explainability ?? {}) as Record<string, unknown>
    };
  }

  async findPendingWithoutDrafts(tenantId: string): Promise<readonly OfficialAIOffer[]> {
    if (tenantId !== this.tenantId) return [];
    const batchSize = getOfficialAIBatchSize();
    const { data: offersData, error: offersError } = await this.client
      .from("offers")
      .select("id,user_id,status,platform,product_name,original_url,image_url,current_price,old_price,category,explainability")
      .eq("user_id", tenantId)
      .eq("status", "pending_manual_review")
      .order("created_at", { ascending: true })
      .limit(batchSize);
    if (offersError) {
      const parts = [offersError.message];
      if (offersError.code) parts.push(`code=${offersError.code}`);
      if (offersError.details) parts.push(`details=${offersError.details}`);
      if (offersError.hint) parts.push(`hint=${offersError.hint}`);
      const err = new Error(`Official AI pending offers read failed: ${parts.join(" | ")}`);
      Object.assign(err, { code: offersError.code, details: offersError.details, hint: offersError.hint });
      throw err;
    }
    if (!offersData || offersData.length === 0) return [];

    const offerIds = offersData.map((o) => o.id);
    const postsData: Array<{ offer_id: string }> = [];
    const CHUNK_SIZE = 150;
    for (let i = 0; i < offerIds.length; i += CHUNK_SIZE) {
      const chunk = offerIds.slice(i, i + CHUNK_SIZE);
      const { data: chunkData, error: postsError } = await this.client
        .from("posts")
        .select("offer_id")
        .eq("user_id", tenantId)
        .in("offer_id", chunk);
      if (postsError) {
        const parts = [postsError.message];
        if (postsError.code) parts.push(`code=${postsError.code}`);
        if (postsError.details) parts.push(`details=${postsError.details}`);
        if (postsError.hint) parts.push(`hint=${postsError.hint}`);
        const err = new Error(`Official AI existing drafts check failed: ${parts.join(" | ")}`);
        Object.assign(err, { code: postsError.code, details: postsError.details, hint: postsError.hint });
        throw err;
      }
      if (chunkData) postsData.push(...chunkData);
    }

    const offersWithDrafts = new Set(postsData.map((p) => p.offer_id));
    const pendingWithoutDrafts = offersData.filter((o) => !offersWithDrafts.has(o.id));

    return pendingWithoutDrafts.map((data) => ({
      id: data.id,
      tenantId: data.user_id,
      state: data.status,
      version: offerStateVersion(data.status),
      marketplace: data.platform,
      productName: data.product_name,
      originalUrl: data.original_url,
      imageUrl: data.image_url ?? "",
      currentPrice: Number(data.current_price),
      originalPrice: data.old_price == null ? null : Number(data.old_price),
      category: data.category,
      explainability: (data.explainability ?? {}) as Record<string, unknown>
    }));
  }

  async persistDrafts(input: Parameters<OfficialAIContentPort["persistDrafts"]>[0]) {
    const drafts = [];
    for (const channel of input.channels) {
      const subId = createSubId(channel, input.offer.productName, input.offer.id);
      const trackedUrl = createTrackedUrl(input.offer.originalUrl, subId);
      const { data: link, error: linkError } = await this.client
        .from("affiliate_links")
        .upsert({
          user_id: this.tenantId,
          offer_id: input.offer.id,
          channel,
          original_url: input.offer.originalUrl,
          tracked_url: trackedUrl,
          sub_id: subId
        }, { onConflict: "offer_id,channel" })
        .select("id")
        .single();
      if (linkError || !link) throw new Error(`Official AI affiliate link failed for ${channel}: ${linkError?.message ?? "missing row"}`);

      const { data: existing, error: existingError } = await this.client
        .from("posts")
        .select("id,affiliate_link_id,channel,status")
        .eq("user_id", this.tenantId)
        .eq("offer_id", input.offer.id)
        .eq("channel", channel)
        .eq("status", "draft")
        .maybeSingle();
      if (existingError) throw new Error(`Official AI draft read failed for ${channel}: ${existingError.message}`);

      let post = existing;
      if (!post) {
        const { data: inserted, error: insertError } = await this.client
          .from("posts")
          .insert({
            user_id: this.tenantId,
            offer_id: input.offer.id,
            affiliate_link_id: link.id,
            channel,
            content: `${input.content.channelCopies[channel]}\n\n${trackedUrl}`,
            status: "draft"
          })
          .select("id,affiliate_link_id,channel,status")
          .single();
        if (insertError || !inserted) throw new Error(`Official AI draft insert failed for ${channel}: ${insertError?.message ?? "missing row"}`);
        post = inserted;
      }
      drafts.push({
        postId: post.id,
        affiliateLinkId: post.affiliate_link_id ?? link.id,
        channel,
        state: "draft" as const
      });
    }
    return drafts;
  }

  async register(record: OfficialAIAuditRecord): Promise<void> {
    const { error } = await this.client.from("integration_logs").insert({
      user_id: this.tenantId,
      integration: "official-ai-service",
      action: "ai_generation",
      // drafted = Modo 1 Draft Generation (ADR-014): oferta permanece pending_manual_review
      status: record.result === "approved" || record.result === "drafted" ? "success" : record.result === "rejected" ? "error" : "skipped",
      message: `${record.offerId}:${record.result}${record.failureStage ? `:${record.failureStage}` : ""}`,
      metadata: record
    });
    if (error) throw new Error(`Official AI audit write failed: ${error.message}`);
  }

  async begin(idempotencyKey: string, fingerprint: string) {
    const key = settingKey(idempotencyKey);
    const local = this.pending.get(key);
    if (local) return local.fingerprint === fingerprint ? { status: "pending" as const, result: local.result } : { status: "conflict" as const };

    const value: StoredAIIdempotency = { fingerprint, status: "pending" };
    const { error } = await this.client.from("app_settings").insert({ user_id: this.tenantId, key, value });
    if (!error) {
      let resolve!: (result: OfficialAIResult) => void;
      const result = new Promise<OfficialAIResult>((complete) => { resolve = complete; });
      this.pending.set(key, { fingerprint, result, resolve });
      return { status: "started" as const };
    }
    if (error.code !== "23505") throw new Error(`Official AI idempotency reservation failed: ${error.message}`);
    const stored = await this.readIdempotency(key);
    if (stored.fingerprint !== fingerprint) return { status: "conflict" as const };
    if (stored.status === "completed" && stored.result) return { status: "replay" as const, result: stored.result };
    return { status: "pending" as const, result: this.waitForCompleted(key, fingerprint) };
  }

  async complete(idempotencyKey: string, fingerprint: string, result: OfficialAIResult): Promise<void> {
    const key = settingKey(idempotencyKey);
    const { error } = await this.client
      .from("app_settings")
      .update({ value: { fingerprint, status: "completed", result } satisfies StoredAIIdempotency })
      .eq("user_id", this.tenantId)
      .eq("key", key);
    if (error) throw new Error(`Official AI idempotency completion failed: ${error.message}`);
    this.pending.get(key)?.resolve(result);
    this.pending.delete(key);
  }

  private async readIdempotency(key: string): Promise<StoredAIIdempotency> {
    const { data, error } = await this.client.from("app_settings").select("value").eq("user_id", this.tenantId).eq("key", key).single();
    if (error || !data) throw new Error(`Official AI idempotency read failed: ${error?.message ?? "record not found"}`);
    return data.value as unknown as StoredAIIdempotency;
  }

  private async waitForCompleted(key: string, fingerprint: string): Promise<OfficialAIResult> {
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
      await wait(POLL_INTERVAL_MS);
      const stored = await this.readIdempotency(key);
      if (stored.fingerprint !== fingerprint) throw new Error("Official AI idempotency fingerprint changed while pending");
      if (stored.status === "completed" && stored.result) return stored.result;
    }
    throw new Error("Official AI command remained pending");
  }
}

export class OfficialAIApprovalAdapter implements OfficialAIApprovalPort {
  constructor(private readonly stateDependencies: StateServiceDependencies) {}

  async approveSelected(input: Parameters<OfficialAIApprovalPort["approveSelected"]>[0]) {
    const stateResult = await transitionOfficialOfferState({
      commandId: `${input.command.commandId}:approve`,
      idempotencyKey: `${input.command.idempotencyKey}:approve`,
      correlationId: input.command.correlationId,
      causationId: input.command.commandId,
      tenantId: input.command.tenantId,
      actor: { type: "service", id: "official-ai-service", service: "official-ai-service" },
      requestedAt: input.command.requestedAt,
      entityId: input.offer.id,
      fromState: "selected",
      toState: "approved",
      origin: "official-ai-service.approval",
      reason: { code: "AI_POSTS_VALIDATED" },
      evidenceRefs: input.drafts.map((draft) => `post:${draft.postId}:draft`)
    }, this.stateDependencies);
    return stateResult.status === "applied"
      ? { status: "applied" as const, auditId: stateResult.auditId, newState: "approved" as const }
      : { status: "rejected" as const, code: stateResult.code, message: stateResult.message };
  }
}

export function withSupabaseOfficialAIAdapters(
  client: SupabaseClient,
  tenantId: string,
  stateDependencies: StateServiceDependencies,
  remaining: Pick<OfficialAIServiceDependencies, "providers" | "clock">
): OfficialAIServiceDependencies {
  const adapter = new SupabaseOfficialAIAdapter(client, tenantId);
  return {
    ...remaining,
    offers: adapter,
    content: adapter,
    idempotency: adapter,
    audit: adapter,
    approval: new OfficialAIApprovalAdapter(stateDependencies)
  };
}
