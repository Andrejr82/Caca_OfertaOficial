import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  OfficialPublicationChannel,
  OfficialPublicationCommand,
  OfficialPublicationOffer,
  OfficialPublicationPost,
  OfficialPublicationReceipt,
  OfficialPublicationResult,
  PublicationAuditRecord,
  PublicationAuditPort,
  PublicationReceiptPort,
  PublicationRepositoryPort,
  PublicationReservationPort,
  PublicationStatePort
} from "@/core/publication";
import type { StateServiceDependencies } from "@/core/state";
import { offerStateVersion, postStateVersion, transitionOfficialOfferState, transitionOfficialPostState } from "@/lib/state/official-state-service";
import { buildCouponSocialMessage, isCouponOffer, resolveCouponPublishImageUrl } from "@/lib/coupons/presentation";

const IDEMPOTENCY_PREFIX = "pmav5.publication.idempotency.";
const RESERVATION_PREFIX = "pmav5.publication.reservation.";
const RECEIPT_PREFIX = "pmav5.publication.receipt.";
const POLL_ATTEMPTS = 50;
const POLL_INTERVAL_MS = 100;

type Destinations = Readonly<Record<OfficialPublicationChannel, string>>;

interface StoredIdempotency {
  fingerprint: string;
  status: "pending" | "receipt_recorded" | "reconciliation_required" | "completed";
  result?: OfficialPublicationResult;
  receipt?: OfficialPublicationReceipt;
}

interface PendingPublication {
  fingerprint: string;
  result: Promise<OfficialPublicationResult>;
  resolve(result: OfficialPublicationResult): void;
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function idempotencySettingKey(key: string) { return `${IDEMPOTENCY_PREFIX}${key}`; }
function reservationSettingKey(command: OfficialPublicationCommand) { return `${RESERVATION_PREFIX}${command.postId}.${command.channel}`; }
function receiptSettingKey(key: string) { return `${RECEIPT_PREFIX}${key}`; }

function instagramMode(offer: { product_name?: string | null; notes?: string | null }) {
  const coupon = String(offer.product_name ?? "").startsWith("[CUPOM]") || String(offer.notes ?? "").includes("Robô de Cupons");
  return coupon ? "synchronous" : "asynchronous";
}

export class SupabaseOfficialPublicationAdapter implements
  PublicationRepositoryPort,
  PublicationReceiptPort,
  PublicationReservationPort,
  PublicationAuditPort {
  private readonly pending = new Map<string, PendingPublication>();

  constructor(
    private readonly client: SupabaseClient,
    private readonly tenantId: string,
    private readonly destinations: Destinations
  ) {}

  async findOffer(offerId: string, tenantId: string): Promise<OfficialPublicationOffer | null> {
    if (tenantId !== this.tenantId) return null;
    const { data, error } = await this.client.from("offers")
      .select("id,user_id,status")
      .eq("id", offerId)
      .eq("user_id", tenantId)
      .maybeSingle();
    if (error) throw new Error(`Official publication offer read failed: ${error.message}`);
    if (!data) return null;
    return { id: data.id, tenantId: data.user_id, state: data.status, version: offerStateVersion(data.status) };
  }

  async findPost(postId: string, tenantId: string): Promise<OfficialPublicationPost | null> {
    if (tenantId !== this.tenantId) return null;
    const { data, error } = await this.client.from("posts")
      .select("id,user_id,offer_id,channel,status,content,offers(image_url,product_name,notes,platform,coupon,original_url),affiliate_links(tracked_url)")
      .eq("id", postId)
      .eq("user_id", tenantId)
      .maybeSingle();
    if (error) throw new Error(`Official publication post read failed: ${error.message}`);
    if (!data) return null;
    const related = Array.isArray(data.offers) ? data.offers[0] : data.offers;
    const link = Array.isArray(data.affiliate_links) ? data.affiliate_links[0] : data.affiliate_links;
    const channel = data.channel as OfficialPublicationChannel;
    const coupon = isCouponOffer(related);
    return {
      id: data.id,
      tenantId: data.user_id,
      offerId: data.offer_id,
      channel,
      state: data.status,
      version: postStateVersion(data.status),
      content: coupon
        ? buildCouponSocialMessage(related, link?.tracked_url || related?.original_url || "")
        : data.content,
      mediaUrl: coupon
        ? await resolveCouponPublishImageUrl(related)
        : related?.image_url ?? null,
      destination: this.destinations[channel] ?? "",
      metadata: channel === "instagram" ? { instagramMode: instagramMode(related ?? {}) } : {}
    };
  }

  async findPostsByOffer(offerId: string, tenantId: string): Promise<readonly OfficialPublicationPost[]> {
    if (tenantId !== this.tenantId) return [];
    const { data, error } = await this.client.from("posts")
      .select("id,user_id,offer_id,channel,status,content,offers(image_url,product_name,notes,platform,coupon,original_url),affiliate_links(tracked_url)")
      .eq("offer_id", offerId)
      .eq("user_id", tenantId);
    if (error) throw new Error(`Official publication related posts read failed: ${error.message}`);
    return Promise.all((data ?? []).map(async (item) => {
      const related = Array.isArray(item.offers) ? item.offers[0] : item.offers;
      const link = Array.isArray(item.affiliate_links) ? item.affiliate_links[0] : item.affiliate_links;
      const channel = item.channel as OfficialPublicationChannel;
      const coupon = isCouponOffer(related);
      return {
        id: item.id,
        tenantId: item.user_id,
        offerId: item.offer_id,
        channel,
        state: item.status,
        version: postStateVersion(item.status),
        content: coupon
          ? buildCouponSocialMessage(related, link?.tracked_url || related?.original_url || "")
          : item.content,
        mediaUrl: coupon
          ? await resolveCouponPublishImageUrl(related)
          : related?.image_url ?? null,
        destination: this.destinations[channel] ?? "",
        metadata: (channel === "instagram" ? { instagramMode: instagramMode(related ?? {}) } : {}) as Readonly<Record<string, string | number | boolean>>
      };
    }));
  }

  async findFinal(command: OfficialPublicationCommand): Promise<OfficialPublicationReceipt | null> {
    const { data, error } = await this.client.from("app_settings")
      .select("value")
      .eq("user_id", this.tenantId)
      .eq("key", receiptSettingKey(command.idempotencyKey))
      .maybeSingle();
    if (error) throw new Error(`Official publication receipt read failed: ${error.message}`);
    if (data?.value) return data.value as OfficialPublicationReceipt;
    const recovery = await this.readOptionalSetting<StoredIdempotency>(idempotencySettingKey(command.idempotencyKey));
    return recovery?.receipt ?? null;
  }

  async save(receipt: OfficialPublicationReceipt): Promise<void> {
    const { error: receiptError } = await this.client.from("app_settings").insert({
      user_id: this.tenantId,
      key: receiptSettingKey(receipt.idempotencyKey),
      value: receipt
    });
    if (receiptError) throw new Error(`Official publication receipt persistence failed: ${receiptError.message}`);
    const { error: metadataError } = await this.client.from("posts")
      .update({ external_id: receipt.externalId, posted_at: receipt.sentAt })
      .eq("id", receipt.postId)
      .eq("user_id", this.tenantId);
    if (metadataError) throw new Error(`Official publication technical metadata failed: ${metadataError.message}`);
  }

  async begin(idempotencyKey: string, fingerprint: string, command: OfficialPublicationCommand) {
    const local = this.pending.get(idempotencyKey);
    if (local) return local.fingerprint === fingerprint
      ? { status: "pending" as const, result: local.result }
      : { status: "conflict" as const };

    const idempotencyKeyName = idempotencySettingKey(idempotencyKey);
    const initial: StoredIdempotency = { fingerprint, status: "pending" };
    const { error: idempotencyError } = await this.client.from("app_settings").insert({
      user_id: this.tenantId, key: idempotencyKeyName, value: initial
    });
    if (idempotencyError) {
      if (idempotencyError.code !== "23505") throw new Error(`Official publication idempotency reservation failed: ${idempotencyError.message}`);
      const stored = await this.readSetting<StoredIdempotency>(idempotencyKeyName);
      if (stored.fingerprint !== fingerprint) return { status: "conflict" as const };
      if (stored.status === "completed" && stored.result) return { status: "replay" as const, result: stored.result };
      if (stored.status === "reconciliation_required") {
        this.createPending(idempotencyKey, fingerprint);
        return { status: "resume" as const };
      }
      return { status: "pending" as const, result: this.waitForResult(idempotencyKeyName, fingerprint) };
    }

    const reservationKey = reservationSettingKey(command);
    const reservationValue = {
      fingerprint, idempotencyKey, commandId: command.commandId, correlationId: command.correlationId,
      owner: `${command.actor.service}:${command.actor.id}`, acquiredAt: command.requestedAt,
      expiresAt: new Date(Date.parse(command.requestedAt) + 5 * 60_000).toISOString(), status: "reserved"
    };
    const { error: reservationError } = await this.client.from("app_settings").insert({
      user_id: this.tenantId, key: reservationKey, value: reservationValue
    });
    if (reservationError && reservationError.code !== "23505") {
      throw new Error(`Official publication operational reservation failed: ${reservationError.message}`);
    }
    if (reservationError?.code === "23505") {
      const stored = await this.readSetting<Record<string, unknown>>(reservationKey);
      const reusable = stored.status === "failed_before_receipt" || stored.status === "reconciliation_required";
      if (!reusable || (stored.status === "reconciliation_required" && stored.fingerprint !== fingerprint)) {
        return { status: "conflict" as const };
      }
      await this.updateSetting(reservationKey, reservationValue);
    }
    this.createPending(idempotencyKey, fingerprint);
    return { status: "started" as const };
  }

  async markReceiptRecorded(idempotencyKey: string, fingerprint: string, receipt: OfficialPublicationReceipt): Promise<void> {
    await this.updateSetting(idempotencySettingKey(idempotencyKey), { fingerprint, status: "receipt_recorded" });
    await this.updateSetting(reservationSettingKey({ postId: receipt.postId, channel: receipt.channel } as OfficialPublicationCommand), {
      fingerprint, idempotencyKey, commandId: receipt.commandId, correlationId: receipt.correlationId,
      status: "receipt_recorded", receiptId: receipt.receiptId
    });
  }

  async markReconciliationRequired(
    idempotencyKey: string,
    fingerprint: string,
    result: OfficialPublicationResult,
    receipt?: OfficialPublicationReceipt
  ): Promise<void> {
    await this.updateSetting(idempotencySettingKey(idempotencyKey), {
      fingerprint,
      status: "reconciliation_required",
      result,
      ...(receipt ? { receipt } : {})
    });
    const postId = result.postId;
    const channel = result.channel;
    await this.updateSetting(reservationSettingKey({ postId, channel } as OfficialPublicationCommand), {
      fingerprint, idempotencyKey, commandId: result.commandId, status: "reconciliation_required"
    });
    this.pending.get(idempotencyKey)?.resolve(result);
    this.pending.delete(idempotencyKey);
  }

  async complete(idempotencyKey: string, fingerprint: string, result: OfficialPublicationResult): Promise<void> {
    await this.updateSetting(idempotencySettingKey(idempotencyKey), { fingerprint, status: "completed", result });
    await this.updateSetting(reservationSettingKey({ postId: result.postId, channel: result.channel } as OfficialPublicationCommand), {
      fingerprint, idempotencyKey, commandId: result.commandId,
      status: result.status === "published" ? "completed" : "failed_before_receipt"
    });
    this.pending.get(idempotencyKey)?.resolve(result);
    this.pending.delete(idempotencyKey);
  }

  async register(record: PublicationAuditRecord): Promise<void> {
    const { error } = await this.client.from("integration_logs").insert({
      user_id: this.tenantId,
      integration: "official-publication-service",
      action: "publication",
      status: record.result === "published" ? "success" : record.result === "idempotent_replay" ? "skipped" : "error",
      message: `${record.channel}:${record.postId}:${record.result}`,
      metadata: record
    });
    if (error) throw new Error(`Official publication audit failed: ${error.message}`);
  }

  private createPending(idempotencyKey: string, fingerprint: string) {
    let resolve!: (result: OfficialPublicationResult) => void;
    const result = new Promise<OfficialPublicationResult>((done) => { resolve = done; });
    this.pending.set(idempotencyKey, { fingerprint, result, resolve });
  }

  private async readSetting<T>(key: string): Promise<T> {
    const { data, error } = await this.client.from("app_settings").select("value")
      .eq("user_id", this.tenantId).eq("key", key).single();
    if (error || !data) throw new Error(`Official publication setting read failed: ${error?.message ?? "not found"}`);
    return data.value as T;
  }

  private async readOptionalSetting<T>(key: string): Promise<T | null> {
    const { data, error } = await this.client.from("app_settings").select("value")
      .eq("user_id", this.tenantId).eq("key", key).maybeSingle();
    if (error) throw new Error(`Official publication setting read failed: ${error.message}`);
    return data?.value ? data.value as T : null;
  }

  private async updateSetting(key: string, value: unknown): Promise<void> {
    const { error } = await this.client.from("app_settings").update({ value })
      .eq("user_id", this.tenantId).eq("key", key);
    if (error) throw new Error(`Official publication setting update failed: ${error.message}`);
  }

  private async waitForResult(key: string, fingerprint: string): Promise<OfficialPublicationResult> {
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
      await wait(POLL_INTERVAL_MS);
      const stored = await this.readSetting<StoredIdempotency>(key);
      if (stored.fingerprint !== fingerprint) throw new Error("Official publication fingerprint changed while pending");
      if ((stored.status === "completed" || stored.status === "reconciliation_required") && stored.result) return stored.result;
    }
    throw new Error("Official publication command remained pending");
  }
}

export class OfficialPublicationStateAdapter implements PublicationStatePort {
  constructor(private readonly dependencies: StateServiceDependencies) {}

  async publishPost({ command, receipt }: { command: OfficialPublicationCommand; receipt: OfficialPublicationReceipt }) {
    const result = await transitionOfficialPostState({
      commandId: `${command.commandId}:post`,
      idempotencyKey: `${command.idempotencyKey}:post`,
      correlationId: command.correlationId,
      causationId: command.commandId,
      tenantId: command.tenantId,
      actor: { type: "service", id: "official-publication-service", service: "official-publication-service" },
      requestedAt: command.requestedAt,
      entityId: command.postId,
      fromState: "draft",
      toState: "published",
      origin: "official-publication-service.receipt",
      reason: { code: "FINAL_RECEIPT_CONFIRMED" },
      evidenceRefs: [`receipt:${receipt.receiptId}`, `external:${receipt.externalId}`]
    }, this.dependencies);
    return result.status === "applied"
      ? { status: "applied" as const, auditId: result.auditId, newState: "published" as const }
      : { status: "rejected" as const, code: result.code, message: result.message };
  }

  async concludeOffer({ command, receipt }: { command: OfficialPublicationCommand; receipt: OfficialPublicationReceipt }) {
    const result = await transitionOfficialOfferState({
      commandId: `${command.commandId}:offer`,
      idempotencyKey: `${command.idempotencyKey}:offer`,
      correlationId: command.correlationId,
      causationId: `${command.commandId}:post`,
      tenantId: command.tenantId,
      actor: { type: "service", id: "official-publication-service", service: "official-publication-service" },
      requestedAt: command.requestedAt,
      entityId: command.offerId,
      fromState: "approved",
      toState: "posted",
      origin: "official-publication-service.first-confirmed-publication",
      reason: { code: "FIRST_OFFICIAL_POST_PUBLISHED" },
      evidenceRefs: [`receipt:${receipt.receiptId}`, `post:${command.postId}:published`]
    }, this.dependencies);
    return result.status === "applied"
      ? { status: "applied" as const, auditId: result.auditId, newState: "posted" as const }
      : { status: "rejected" as const, code: result.code, message: result.message };
  }

  async reconcileOffer({ command }: { command: OfficialPublicationCommand }) {
    const result = await transitionOfficialOfferState({
      commandId: `${command.commandId}:offer-reconcile`,
      idempotencyKey: `${command.idempotencyKey}:offer-reconcile`,
      correlationId: command.correlationId,
      causationId: command.commandId,
      tenantId: command.tenantId,
      actor: { type: "service", id: "official-publication-service", service: "official-publication-service" },
      requestedAt: command.requestedAt,
      entityId: command.offerId,
      fromState: "posted",
      toState: "approved",
      origin: "official-publication-service.premature-post-reconciliation",
      reason: { code: "PUBLICATION_RECONCILIATION", detail: command.channel },
      evidenceRefs: [`offer:${command.offerId}:active-draft`, `post:${command.postId}:draft`]
    }, this.dependencies);
    return result.status === "applied"
      ? { status: "applied" as const, auditId: result.auditId, newState: "approved" as const }
      : { status: "rejected" as const, code: result.code, message: result.message };
  }
}
