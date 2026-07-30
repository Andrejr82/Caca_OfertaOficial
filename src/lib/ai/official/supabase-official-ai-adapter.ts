import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  OfficialAIAuditRecord,
  OfficialAIContentPort,
  OfficialAIDraftedResult,
  OfficialAIIdempotencyPort,
  OfficialAIOffer,
  OfficialAIOfferPort,
  OfficialAIRegenerationFilters,
  OfficialAIRegenerationPort,
  OfficialAIResult,
  OfficialAITelemetryPort
} from "@/core/ai";
import { getOfficialAIRegenerationBatchLimit, isOfficialAIRegenerationCursor } from "@/core/ai/official-ai-regeneration-service";
import { emitOfficialAITelemetrySafely } from "@/core/ai/ports";
import type { BatchCursor, OfficialAIApprovalPort, OfficialAIServiceDependencies } from "@/core/ai/ports";
import type { StateServiceDependencies } from "@/core/state";
import { createSubId, createTrackedUrl } from "@/lib/tracking/sub-id";
import { offerStateVersion, transitionOfficialOfferState } from "@/lib/state/official-state-service";

const IDEMPOTENCY_PREFIX = "pmav5.ai.idempotency.";
const POLL_ATTEMPTS = 50;
const POLL_INTERVAL_MS = 100;
export const STALE_PENDING_AFTER_MS = 5 * 60 * 1000;

export const DEFAULT_BATCH_SIZE = 50;
const MAX_BATCH_SIZE = 1000;

function mapAffiliateLinks(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((link): link is { channel: string; tracked_url: string; sub_id?: string } =>
      Boolean(link && typeof link === "object" && typeof (link as any).channel === "string" && typeof (link as any).tracked_url === "string")
    )
    .map((link) => ({ channel: link.channel as any, trackedUrl: link.tracked_url, subId: link.sub_id }));
}

function materializeDraftContent(channel: string, rawContent: string, trackedUrl: string) {
  const copy = rawContent.trimEnd();
  const urls = copy.match(/https?:\/\/\S+/g) ?? [];

  if (channel === "instagram") {
    if (urls.length > 0) throw new Error("Instagram copy cannot contain a direct URL");
    return copy;
  }

  if (urls.length > 0) {
    if (urls.length === 1 && urls[0] === trackedUrl) return copy;
    throw new Error(`Copy contains an invalid or duplicate URL for ${channel}`);
  }

  return copy.endsWith("👉") ? `${copy} ${trackedUrl}` : `${copy}\n\n👉 ${trackedUrl}`;
}

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
  startedAt?: string;
  result?: OfficialAIResult | OfficialAIDraftedResult;
}

interface StoredAIIdempotencyRow {
  value: StoredAIIdempotency;
  created_at: string;
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
    private readonly tenantId: string,
    private readonly telemetry?: OfficialAITelemetryPort
  ) {}

  private async emit(event: Parameters<OfficialAITelemetryPort["emit"]>[0]) {
    await emitOfficialAITelemetrySafely(this.telemetry, event);
  }

  async findById(offerId: string, tenantId: string): Promise<OfficialAIOffer | null> {
    if (tenantId !== this.tenantId) return null;
    const { data, error } = await this.client
      .from("offers")
      .select("id,user_id,status,platform,product_name,original_url,image_url,current_price,old_price,category,seller_name,shipping_free,marketplace_metrics,explainability,created_at,affiliate_links(channel,tracked_url,sub_id)")
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
      sellerName: data.seller_name ?? null,
      shippingFree: data.shipping_free ?? null,
      marketplaceMetrics: (data.marketplace_metrics ?? null) as Record<string, unknown> | null,
      explainability: (data.explainability ?? {}) as Record<string, unknown>,
      createdAt: data.created_at,
      affiliateLinks: mapAffiliateLinks((data as any).affiliate_links)
    };
  }

  async findPendingWithoutDrafts(tenantId: string, cursor?: BatchCursor): Promise<readonly OfficialAIOffer[]> {
    if (tenantId !== this.tenantId) return [];
    const batchSize = getOfficialAIBatchSize();
    let query = this.client
      .from("offers")
      .select("id,user_id,status,platform,product_name,original_url,image_url,current_price,old_price,category,seller_name,shipping_free,marketplace_metrics,explainability,created_at,affiliate_links(channel,tracked_url,sub_id)")
      .eq("user_id", tenantId)
      .eq("status", "pending_manual_review")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });

    // Paginacao por cursor composto: (created_at, id) ASC
    // Usa OR para cursor: created_at > X OU (created_at = X AND id > Y)
    // ponytail: PostgREST nao suporta OR direto em filtro composto, usamos gte+neq como aproximacao.
    // Se created_at for unico por lote, basta gt. Se houver colisao, id desempata via order.
    if (cursor) {
      query = (query as any).or(
        `created_at.gt.${cursor.afterCreatedAt},and(created_at.eq.${cursor.afterCreatedAt},id.gt.${cursor.afterId})`
      );
    }

    query = query.limit(batchSize);

    const { data: offersData, error: offersError } = await query;
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
      sellerName: data.seller_name ?? null,
      shippingFree: data.shipping_free ?? null,
      marketplaceMetrics: (data.marketplace_metrics ?? null) as Record<string, unknown> | null,
      explainability: (data.explainability ?? {}) as Record<string, unknown>,
      createdAt: data.created_at,
      affiliateLinks: mapAffiliateLinks((data as any).affiliate_links)
    }));
  }

  async persistDrafts(input: Parameters<OfficialAIContentPort["persistDrafts"]>[0]) {
    const drafts = [];
    for (const channel of input.channels) {
      const startedAt = Date.now();
      const persistedLink = input.offer.affiliateLinks?.find((link) => link.channel === channel);
      const subId = persistedLink?.subId ?? createSubId(channel, input.offer.productName, input.offer.id);
      const trackedUrl = persistedLink?.trackedUrl ?? createTrackedUrl(input.offer.originalUrl, subId);
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
      await this.emit({
        eventType: "official_ai.persistence.affiliate_link.upserted", correlationId: input.command.correlationId,
        offerId: input.offer.id, marketplace: input.offer.marketplace, stage: "draft_persistence",
        details: { channel, affiliateLinkId: link.id, operation: "upsert" }
      });

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
            content: materializeDraftContent(channel, input.content.channelCopies[channel] || "", trackedUrl),
            status: "draft"
          })
          .select("id,affiliate_link_id,channel,status")
          .single();
        if (insertError || !inserted) throw new Error(`Official AI draft insert failed for ${channel}: ${insertError?.message ?? "missing row"}`);
        post = inserted;
        await this.emit({
          eventType: "official_ai.persistence.post.inserted", correlationId: input.command.correlationId,
          offerId: input.offer.id, marketplace: input.offer.marketplace, stage: "draft_persistence", durationMs: Date.now() - startedAt,
          details: { channel, postId: post.id, affiliateLinkId: post.affiliate_link_id ?? link.id, operation: "insert" }
        });
      } else {
        if (input.command.metadata?.copyV2Regenerate === true) {
          const { error: updateError } = await this.client
            .from("posts")
            .update({ content: materializeDraftContent(channel, input.content.channelCopies[channel] || "", trackedUrl) })
            .eq("id", post.id)
            .eq("user_id", this.tenantId)
            .eq("status", "draft");
          if (updateError) throw new Error(`Official AI draft update failed for ${channel}: ${updateError.message}`);
        }
        await this.emit({
          eventType: "official_ai.persistence.post.idempotent", correlationId: input.command.correlationId,
          offerId: input.offer.id, marketplace: input.offer.marketplace, stage: "draft_persistence", durationMs: Date.now() - startedAt,
          details: { channel, postId: post.id, affiliateLinkId: post.affiliate_link_id ?? link.id, operation: "replay" }
        });
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

    const value: StoredAIIdempotency = { fingerprint, status: "pending", startedAt: new Date().toISOString() };
    const { error } = await this.client.from("app_settings").insert({ user_id: this.tenantId, key, value });
    if (!error) {
      let resolve!: (result: OfficialAIResult) => void;
      const result = new Promise<OfficialAIResult>((complete) => { resolve = complete; });
      this.pending.set(key, { fingerprint, result, resolve });
      return { status: "started" as const };
    }
    if (error.code !== "23505") throw new Error(`Official AI idempotency reservation failed: ${error.message}`);
    const row = await this.readIdempotency(key);
    const stored = row.value;
    // Sucesso é replay permanente: nunca devemos duplicar posts ou repetir aprovação.
    // Rejeições são recuperáveis. Antes desta distinção, uma falha transitória de provider
    // ficava gravada na chave v2 e cada novo clique apenas devolvia o erro antigo.
    if (stored.status === "completed" && stored.result) {
      if (stored.result.status !== "rejected") return { status: "replay" as const, result: stored.result };

      const restartedAt = new Date().toISOString();
      const { error: retryError } = await this.client.from("app_settings")
        .update({ value: { fingerprint, status: "pending", startedAt: restartedAt } satisfies StoredAIIdempotency })
        .eq("user_id", this.tenantId)
        .eq("key", key);
      if (retryError) throw new Error(`Official AI rejected-result retry failed: ${retryError.message}`);
      return { status: "started" as const };
    }
    // Só aplica conflito se o registro ainda está pendente com fingerprint diferente.
    if (stored.fingerprint !== fingerprint) return { status: "conflict" as const };

    const pendingSince = stored.startedAt ?? row.created_at;
    if (Date.now() - Date.parse(pendingSince) > STALE_PENDING_AFTER_MS) {
      if (idempotencyKey.startsWith("ai:cycle:")) {
        const restartedAt = new Date().toISOString();
        const { error: restartError } = await this.client.from("app_settings")
          .update({ value: { fingerprint, status: "pending", startedAt: restartedAt } satisfies StoredAIIdempotency })
          .eq("user_id", this.tenantId).eq("key", key);
        if (restartError) throw new Error(`Official AI stale page restart failed: ${restartError.message}`);
        const { error: auditError } = await this.client.from("integration_logs").insert({
          user_id: this.tenantId, integration: "official-ai-service", action: "ai_cycle_page_stale_restarted",
          status: "success", message: `${idempotencyKey}:stale_restarted`,
          metadata: { idempotencyKey, pendingSince, restartedAt }
        });
        if (auditError) throw new Error(`Official AI stale page restart audit failed: ${auditError.message}`);
        return { status: "started" as const };
      }
      return { status: "stale_pending" as const, pendingSince };
    }
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

  private async readIdempotency(key: string): Promise<StoredAIIdempotencyRow> {
    const { data, error } = await this.client.from("app_settings").select("value,created_at").eq("user_id", this.tenantId).eq("key", key).single();
    if (error || !data) throw new Error(`Official AI idempotency read failed: ${error?.message ?? "record not found"}`);
    return data as unknown as StoredAIIdempotencyRow;
  }

  private async waitForCompleted(key: string, fingerprint: string): Promise<OfficialAIResult> {
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
      await wait(POLL_INTERVAL_MS);
      const stored = (await this.readIdempotency(key)).value;
      if (stored.fingerprint !== fingerprint) throw new Error("Official AI idempotency fingerprint changed while pending");
      if (stored.status === "completed" && stored.result) return stored.result;
    }
    throw new Error("Official AI command remained pending");
  }
}

export class SupabaseOfficialAIRegenerationAdapter implements OfficialAIRegenerationPort {
  constructor(
    private readonly client: SupabaseClient,
    private readonly tenantId: string
  ) {}

  async findDrafts(tenantId: string, filters: OfficialAIRegenerationFilters) {
    if (tenantId !== this.tenantId) return [];
    const postIds = [...new Set((filters.postIds ?? []).filter(Boolean))];
    if (filters.postIds !== undefined && postIds.length === 0) return [];
    let query = this.client
      .from("posts")
      .select(`
        id, offer_id, affiliate_link_id, channel, status, content, created_at,
        offers!inner(platform, product_name, current_price, old_price, category, shipping_free, rating, coupon, explainability, marketplace_metrics),
        affiliate_links!inner(id, tracked_url)
      `)
      .eq("user_id", tenantId)
      .eq("status", "draft");
    if (filters.channel) query = query.eq("channel", filters.channel);
    if (postIds.length > 0) query = query.in("id", postIds);
    if (filters.marketplace) {
      const exactMarketplace = filters.marketplace.replace(/([\\%_])/gu, "\\$1");
      query = query.ilike("offers.platform", exactMarketplace);
    }
    if (filters.after) {
      if (!isOfficialAIRegenerationCursor(filters.after)) throw new Error("INVALID_REGENERATION_CURSOR");
      query = (query as any).or(`created_at.gt.${filters.after.createdAt},and(created_at.eq.${filters.after.createdAt},id.gt.${filters.after.postId})`);
    }

    const { data, error } = await query
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(getOfficialAIRegenerationBatchLimit(filters.limit));
    if (error) throw new Error(`Official AI draft regeneration read failed: ${error.message}`);

    return ((data ?? []) as any[]).flatMap((row) => {
      const offer = Array.isArray(row.offers) ? row.offers[0] : row.offers;
      const link = Array.isArray(row.affiliate_links) ? row.affiliate_links[0] : row.affiliate_links;
      if (!offer || !link || row.status !== "draft" || !row.affiliate_link_id) return [];
      if (filters.marketplace && offer.platform.toLocaleLowerCase("pt-BR") !== filters.marketplace.toLocaleLowerCase("pt-BR")) return [];
      return [{
        postId: row.id,
        offerId: row.offer_id,
        affiliateLinkId: row.affiliate_link_id,
        channel: row.channel,
        status: "draft" as const,
        createdAt: row.created_at,
        currentContent: row.content,
        trackedUrl: link.tracked_url,
        marketplace: offer.platform,
        productName: offer.product_name,
        currentPrice: Number(offer.current_price),
        originalPrice: offer.old_price == null ? null : Number(offer.old_price),
        category: offer.category,
        shippingFree: offer.shipping_free ?? null,
        rating: offer.rating == null ? null : Number(offer.rating),
        coupon: offer.coupon ?? null,
        evidence: {
          explainability: offer.explainability ?? {},
          marketplaceMetrics: offer.marketplace_metrics ?? {}
        }
      }];
    });
  }

  async updateContent(input: Parameters<OfficialAIRegenerationPort["updateContent"]>[0]) {
    if (input.tenantId !== this.tenantId) return false;
    const { data, error } = await this.client
      .from("posts")
      .update({ content: input.content })
      .eq("user_id", input.tenantId)
      .eq("id", input.postId)
      .eq("status", "draft")
      .eq("content", input.expectedContent)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(`Official AI draft regeneration update failed: ${error.message}`);
    return Boolean(data);
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
  remaining: Pick<OfficialAIServiceDependencies, "providers" | "clock" | "telemetry">
): OfficialAIServiceDependencies {
  const adapter = new SupabaseOfficialAIAdapter(client, tenantId, remaining.telemetry);
  return {
    ...remaining,
    offers: adapter,
    content: adapter,
    idempotency: adapter,
    audit: adapter,
    approval: new OfficialAIApprovalAdapter(stateDependencies)
  };
}
