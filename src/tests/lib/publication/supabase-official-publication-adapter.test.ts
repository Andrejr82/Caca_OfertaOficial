import { describe, expect, it, vi } from "vitest";
import { MemoryStateAdapter } from "@/core/state/adapters/memory-state-adapter";
import type { OfficialPublicationCommand, OfficialPublicationReceipt, PublicationAuditRecord } from "@/core/publication";
import {
  OfficialPublicationStateAdapter,
  SupabaseOfficialPublicationAdapter
} from "@/lib/publication/official/supabase-official-publication-adapter";

function chain(result: unknown) {
  const builder = {
    select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(), eq: vi.fn(),
    maybeSingle: vi.fn(async () => result), single: vi.fn(async () => result)
  };
  for (const method of ["select", "insert", "update", "delete", "eq"] as const) builder[method].mockReturnValue(builder);
  return builder;
}

const command: OfficialPublicationCommand = {
  contractVersion: "pmav5.publication/v1",
  commandId: "command-1",
  idempotencyKey: "publication:post-1:telegram",
  correlationId: "correlation-1",
  causationId: "ai-command-1",
  offerId: "offer-1",
  postId: "post-1",
  tenantId: "tenant-1",
  channel: "telegram",
  expectedOfferState: "approved",
  expectedOfferVersion: 2,
  expectedPostState: "draft",
  expectedPostVersion: 0,
  payloadReference: "post:post-1:v0",
  requestedAt: "2026-07-14T11:59:00.000Z",
  actor: { type: "user", id: "tenant-1", service: "nextjs-publication" },
  origin: "route.telegram.publish",
  reason: { code: "USER_REQUESTED_PUBLICATION" }
};

const receipt: OfficialPublicationReceipt = {
  receiptVersion: "pmav5.receipt/v1",
  receiptId: "receipt-1",
  commandId: command.commandId,
  idempotencyKey: command.idempotencyKey,
  correlationId: command.correlationId,
  causationId: command.causationId,
  tenantId: command.tenantId,
  offerId: command.offerId,
  postId: command.postId,
  channel: command.channel,
  provider: "telegram-bot-api",
  externalId: "tg-100",
  sentAt: "2026-07-14T12:00:00.000Z",
  observedAt: "2026-07-14T12:00:00.000Z",
  accepted: true,
  deliveryStatus: "confirmed",
  outcome: "confirmed",
  evidenceHash: "sha256:receipt",
  metadata: {}
};

describe("SupabaseOfficialPublicationAdapter", () => {
  it("loads offer and post tenant-aware and derives only technical transport data", async () => {
    const offerBuilder = chain({ data: { id: "offer-1", user_id: "tenant-1", status: "approved" }, error: null });
    const postBuilder = chain({
      data: {
        id: "post-1", user_id: "tenant-1", offer_id: "offer-1", channel: "instagram",
        status: "draft", content: "Persistido", offers: {
          image_url: "https://images.example/1.jpg", product_name: "Produto", notes: null
        }
      }, error: null
    });
    const client = { from: vi.fn().mockReturnValueOnce(offerBuilder).mockReturnValueOnce(postBuilder).mockReturnValueOnce(postBuilder) };
    const adapter = new SupabaseOfficialPublicationAdapter(client as never, "tenant-1", {
      telegram: "@ofertas", whatsapp: "group@g.us", instagram: "instagram-account", facebook: "facebook-page"
    });

    await expect(adapter.findOffer("offer-1", "tenant-1")).resolves.toEqual({ id: "offer-1", tenantId: "tenant-1", state: "approved", version: 2 });
    await expect(adapter.findPost("post-1", "tenant-1")).resolves.toMatchObject({
      id: "post-1", offerId: "offer-1", channel: "instagram", state: "draft", version: 0,
      content: "Persistido", mediaUrl: "https://images.example/1.jpg", destination: "instagram-account",
      metadata: { instagramMode: "asynchronous" }
    });
    expect(offerBuilder.eq).toHaveBeenCalledWith("user_id", "tenant-1");
    expect(postBuilder.eq).toHaveBeenCalledWith("user_id", "tenant-1");
  });

  it("persists an immutable receipt before updating technical post metadata", async () => {
    const receiptInsert = chain({ data: null, error: null });
    const metadataUpdate = chain({ data: null, error: null });
    const client = { from: vi.fn().mockReturnValueOnce(receiptInsert).mockReturnValueOnce(metadataUpdate) };
    const adapter = new SupabaseOfficialPublicationAdapter(client as never, "tenant-1", {
      telegram: "@ofertas", whatsapp: "group@g.us", instagram: "instagram-account", facebook: "facebook-page"
    });

    await adapter.save(receipt);

    expect(receiptInsert.insert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: "tenant-1", key: `pmav5.publication.receipt.${command.idempotencyKey}`, value: receipt
    }));
    expect(metadataUpdate.update).toHaveBeenCalledWith({ external_id: "tg-100", posted_at: receipt.sentAt });
    expect(client.from.mock.calls.map(([table]) => table)).toEqual(["app_settings", "posts"]);
  });

  it("recovers a final receipt from reconciliation storage when the primary receipt insert failed", async () => {
    const receiptMissing = chain({ data: null, error: null });
    const reconciliation = chain({
      data: { value: { fingerprint: "fingerprint", status: "reconciliation_required", receipt } },
      error: null
    });
    const client = { from: vi.fn().mockReturnValueOnce(receiptMissing).mockReturnValueOnce(reconciliation) };
    const adapter = new SupabaseOfficialPublicationAdapter(client as never, "tenant-1", {
      telegram: "@ofertas", whatsapp: "group@g.us", instagram: "instagram-account", facebook: "facebook-page"
    });

    await expect(adapter.findFinal(command)).resolves.toEqual(receipt);
  });

  it("persists reservation by post/channel and idempotency separately", async () => {
    const idempotencyInsert = chain({ data: null, error: null });
    const reservationInsert = chain({ data: null, error: null });
    const client = { from: vi.fn().mockReturnValueOnce(idempotencyInsert).mockReturnValueOnce(reservationInsert) };
    const adapter = new SupabaseOfficialPublicationAdapter(client as never, "tenant-1", {
      telegram: "@ofertas", whatsapp: "group@g.us", instagram: "instagram-account", facebook: "facebook-page"
    });

    await expect(adapter.begin(command.idempotencyKey, "fingerprint", command)).resolves.toEqual({ status: "started" });
    expect(idempotencyInsert.insert).toHaveBeenCalledWith(expect.objectContaining({ key: `pmav5.publication.idempotency.${command.idempotencyKey}` }));
    expect(reservationInsert.insert).toHaveBeenCalledWith(expect.objectContaining({ key: "pmav5.publication.reservation.post-1.telegram" }));
  });

  it("writes structured publication audit without content or secrets", async () => {
    const auditInsert = chain({ data: null, error: null });
    const client = { from: vi.fn(() => auditInsert) };
    const adapter = new SupabaseOfficialPublicationAdapter(client as never, "tenant-1", {
      telegram: "@ofertas", whatsapp: "group@g.us", instagram: "instagram-account", facebook: "facebook-page"
    });
    const record = {
      timestamp: command.requestedAt, commandId: command.commandId, idempotencyKey: command.idempotencyKey,
      correlationId: command.correlationId, causationId: command.causationId, tenantId: command.tenantId,
      offerId: command.offerId, postId: command.postId, channel: command.channel, actor: command.actor,
      origin: command.origin, reason: command.reason, transport: "telegram", durationMs: 1,
      reservation: "started", transportResult: "confirmed", receiptId: receipt.receiptId,
      receiptRecorded: true, postTransition: "applied", offerCondition: "first_confirmed_receipt",
      offerTransition: "applied", result: "published", replay: false, failureStage: null, errorCode: null
    } satisfies PublicationAuditRecord;

    await adapter.register(record);
    expect(auditInsert.insert).toHaveBeenCalledWith(expect.objectContaining({
      integration: "official-publication-service", action: "publication", metadata: record
    }));
    expect(JSON.stringify(auditInsert.insert.mock.calls[0][0])).not.toMatch(/Conteúdo oficial|token|secret/i);
  });
});

it("OfficialPublicationStateAdapter delegates both final states exclusively to the State Service", async () => {
  const memory = new MemoryStateAdapter([
    { entityType: "offer", entityId: "offer-1", tenantId: "tenant-1", state: "approved", version: 2 },
    { entityType: "post", entityId: "post-1", tenantId: "tenant-1", state: "draft", version: 0 }
  ]);
  const adapter = new OfficialPublicationStateAdapter({
    repository: memory, audit: memory, idempotency: memory,
    clock: { now: () => "2026-07-14T12:00:01.000Z" },
    uuid: { generate: () => `state-audit-${memory.audits.length + 1}` }
  });

  await expect(adapter.publishPost({ command, receipt })).resolves.toMatchObject({ status: "applied", newState: "published" });
  await expect(adapter.concludeOffer({ command, receipt })).resolves.toMatchObject({ status: "applied", newState: "posted" });
  await expect(memory.findById("post", "post-1", "tenant-1")).resolves.toMatchObject({ state: "published" });
  await expect(memory.findById("offer", "offer-1", "tenant-1")).resolves.toMatchObject({ state: "posted" });
});
