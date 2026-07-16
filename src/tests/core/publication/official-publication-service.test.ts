import { describe, expect, it } from "vitest";
import {
  publishOfficialPost,
  type OfficialPublicationCommand,
  type OfficialPublicationOffer,
  type OfficialPublicationPost,
  type OfficialPublicationReceipt,
  type OfficialPublicationResult,
  type OfficialPublicationServiceDependencies,
  type PublicationAuditRecord
} from "@/core/publication";

const now = "2026-07-14T12:00:00.000Z";

function command(overrides: Partial<OfficialPublicationCommand> = {}): OfficialPublicationCommand {
  return {
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
    reason: { code: "USER_REQUESTED_PUBLICATION" },
    metadata: { requestSource: "dashboard" },
    ...overrides
  };
}

function offer(overrides: Partial<OfficialPublicationOffer> = {}): OfficialPublicationOffer {
  return { id: "offer-1", tenantId: "tenant-1", state: "approved", version: 2, ...overrides };
}

function post(overrides: Partial<OfficialPublicationPost> = {}): OfficialPublicationPost {
  return {
    id: "post-1",
    tenantId: "tenant-1",
    offerId: "offer-1",
    channel: "telegram",
    state: "draft",
    version: 0,
    content: "Oferta oficial persistida",
    mediaUrl: "https://images.example/offer.jpg",
    destination: "@ofertas",
    ...overrides
  };
}

function receipt(commandInput: OfficialPublicationCommand): OfficialPublicationReceipt {
  return {
    receiptVersion: "pmav5.receipt/v1",
    receiptId: "receipt-1",
    commandId: commandInput.commandId,
    idempotencyKey: commandInput.idempotencyKey,
    correlationId: commandInput.correlationId,
    causationId: commandInput.causationId,
    tenantId: commandInput.tenantId,
    offerId: commandInput.offerId,
    postId: commandInput.postId,
    channel: commandInput.channel,
    provider: "telegram-bot-api",
    externalId: "telegram-100",
    sentAt: now,
    observedAt: now,
    accepted: true,
    deliveryStatus: "confirmed",
    outcome: "confirmed",
    evidenceHash: "sha256:receipt-1",
    metadata: {}
  };
}

function fixture(input: {
  offer?: OfficialPublicationOffer | null;
  post?: OfficialPublicationPost | null;
  transportReceipt?: OfficialPublicationReceipt;
  transportError?: Error;
  transportGate?: Promise<void>;
  existingReceipt?: OfficialPublicationReceipt;
  receiptSaveErrorBefore?: Error;
  postStateResults?: Array<Awaited<ReturnType<OfficialPublicationServiceDependencies["state"]["publishPost"]>>>;
  offerStateResults?: Array<Awaited<ReturnType<OfficialPublicationServiceDependencies["state"]["concludeOffer"]>>>;
} = {}) {
  const currentOffer = input.offer === undefined ? offer() : input.offer;
  const currentPost = input.post === undefined ? post() : input.post;
  const audits: PublicationAuditRecord[] = [];
  const savedReceipts: OfficialPublicationReceipt[] = input.existingReceipt ? [input.existingReceipt] : [];
  const completed = new Map<string, { fingerprint: string; result: OfficialPublicationResult }>();
  const active = new Map<string, {
    fingerprint: string;
    result: Promise<OfficialPublicationResult>;
    resolve(result: OfficialPublicationResult): void;
  }>();
  const resumable = new Set<string>();
  const events: string[] = [];
  let transportCalls = 0;
  let postTransitions = 0;
  let offerTransitions = 0;

  const dependencies: OfficialPublicationServiceDependencies = {
    repository: {
      findOffer: async () => currentOffer,
      findPost: async () => currentPost
    },
    transports: {
      resolve: () => ({
        channel: "telegram",
        publish: async (request) => {
          transportCalls += 1;
          expect(request.content).toBe("Oferta oficial persistida");
          if (input.transportGate) await input.transportGate;
          if (input.transportError) throw input.transportError;
          events.push("transport");
          return input.transportReceipt ?? receipt(command());
        }
      })
    },
    receipts: {
      findFinal: async () => savedReceipts[0] ?? null,
      save: async (value) => {
        if (input.receiptSaveErrorBefore) throw input.receiptSaveErrorBefore;
        savedReceipts.push(value);
        events.push("receipt");
      }
    },
    reservations: {
      begin: async (key, fingerprint) => {
        const replay = completed.get(key);
        if (replay) return replay.fingerprint === fingerprint
          ? { status: "replay", result: replay.result }
          : { status: "conflict" };
        const running = active.get(key);
        if (running) return running.fingerprint === fingerprint
          ? { status: "pending", result: running.result }
          : { status: "conflict" };
        if (resumable.delete(key)) return { status: "resume" };
        let resolve!: (result: OfficialPublicationResult) => void;
        const result = new Promise<OfficialPublicationResult>((done) => { resolve = done; });
        active.set(key, { fingerprint, result, resolve });
        return { status: "started" };
      },
      markReceiptRecorded: async () => undefined,
      markReconciliationRequired: async (key, _fingerprint, _result, recoveryReceipt) => {
        if (recoveryReceipt && savedReceipts.length === 0) savedReceipts.push(recoveryReceipt);
        active.delete(key);
        resumable.add(key);
      },
      complete: async (key, fingerprint, result) => {
        completed.set(key, { fingerprint, result });
        active.get(key)?.resolve(result);
        active.delete(key);
      }
    },
    state: {
      publishPost: async () => {
        postTransitions += 1;
        events.push("post-state");
        return input.postStateResults?.shift() ?? { status: "applied", auditId: "audit-post", newState: "published" };
      },
      concludeOffer: async () => {
        offerTransitions += 1;
        events.push("offer-state");
        return input.offerStateResults?.shift() ?? { status: "applied", auditId: "audit-offer", newState: "posted" };
      }
    },
    audit: { register: async (record) => { audits.push(record); } },
    clock: { now: () => now },
    uuid: { generate: () => "receipt-generated" }
  };

  return {
    dependencies,
    audits,
    savedReceipts,
    completed,
    events,
    counts: () => ({ transportCalls, postTransitions, offerTransitions })
  };
}

describe("publishOfficialPost", () => {
  it("publishes persisted content, stores the receipt, then transitions post and offer", async () => {
    const test = fixture();

    const result = await publishOfficialPost(command(), test.dependencies);

    expect(result).toMatchObject({
      status: "published",
      commandId: "command-1",
      offerId: "offer-1",
      postId: "post-1",
      channel: "telegram",
      externalId: "telegram-100",
      postState: "published",
      offerState: "posted",
      replay: false
    });
    expect(test.counts()).toEqual({ transportCalls: 1, postTransitions: 1, offerTransitions: 1 });
    expect(test.savedReceipts).toHaveLength(1);
    expect(test.audits.at(-1)).toMatchObject({ result: "published", receiptRecorded: true });
  });

  it.each([
    ["pending_manual_review"],
    ["selected"],
    ["posted"],
    ["rejected"]
  ])("rejects offer state %s before transport", async (state) => {
    const test = fixture({ offer: offer({ state }) });
    const result = await publishOfficialPost(command(), test.dependencies);
    expect(result).toMatchObject({ status: "rejected", code: "OFFER_STATE_MISMATCH" });
    expect(test.counts()).toEqual({ transportCalls: 0, postTransitions: 0, offerTransitions: 0 });
  });

  it("accepts a new publication intention after a pre-transport rejection and valid approval", async () => {
    const currentOffer = offer({ state: "pending_manual_review", version: 0 });
    const approvedIntent = command({
      commandId: "command-approved-intent",
      idempotencyKey: "publication:post-1:telegram:intent:approved",
      correlationId: "correlation-approved-intent",
      requestedAt: "2026-07-14T12:05:00.000Z"
    });
    const test = fixture({ offer: currentOffer, transportReceipt: receipt(approvedIntent) });

    await expect(publishOfficialPost(command(), test.dependencies)).resolves.toMatchObject({
      status: "rejected",
      code: "OFFER_STATE_MISMATCH"
    });
    currentOffer.state = "approved";
    currentOffer.version = 2;

    await expect(publishOfficialPost(approvedIntent, test.dependencies)).resolves.toMatchObject({ status: "published" });
    expect(test.counts()).toEqual({ transportCalls: 1, postTransitions: 1, offerTransitions: 1 });
  });

  it("rejects a published post before transport", async () => {
    const test = fixture({ post: post({ state: "published", version: 1 }) });
    const result = await publishOfficialPost(command(), test.dependencies);
    expect(result).toMatchObject({ status: "rejected", code: "POST_STATE_MISMATCH" });
    expect(test.counts().transportCalls).toBe(0);
  });

  it("rejects a tenant mismatch before transport", async () => {
    const test = fixture({ offer: offer({ tenantId: "tenant-2" }) });
    const result = await publishOfficialPost(command(), test.dependencies);
    expect(result).toMatchObject({ status: "rejected", code: "TENANT_MISMATCH" });
    expect(test.counts().transportCalls).toBe(0);
  });

  it("rejects a post linked to another offer before transport", async () => {
    const test = fixture({ post: post({ offerId: "offer-2" }) });
    const result = await publishOfficialPost(command(), test.dependencies);
    expect(result).toMatchObject({ status: "rejected", code: "POST_OFFER_MISMATCH" });
    expect(test.counts().transportCalls).toBe(0);
  });

  it("rejects a channel mismatch before transport", async () => {
    const test = fixture({ post: post({ channel: "whatsapp" }) });
    const result = await publishOfficialPost(command(), test.dependencies);
    expect(result).toMatchObject({ status: "rejected", code: "CHANNEL_MISMATCH" });
    expect(test.counts().transportCalls).toBe(0);
  });

  it("rejects stale offer and post versions before transport", async () => {
    const offerVersion = fixture({ offer: offer({ version: 3 }) });
    const postVersion = fixture({ post: post({ version: 1 }) });
    await expect(publishOfficialPost(command(), offerVersion.dependencies)).resolves.toMatchObject({ code: "OFFER_VERSION_CONFLICT" });
    await expect(publishOfficialPost(command(), postVersion.dependencies)).resolves.toMatchObject({ code: "POST_VERSION_CONFLICT" });
    expect(offerVersion.counts().transportCalls + postVersion.counts().transportCalls).toBe(0);
  });

  it("rejects an invalid contract before repository or transport effects", async () => {
    const test = fixture();
    const result = await publishOfficialPost(command({ contractVersion: "invalid" as never }), test.dependencies);
    expect(result).toMatchObject({ status: "rejected", code: "INVALID_CONTRACT" });
    expect(test.counts().transportCalls).toBe(0);
  });

  it("rejects an invalid final receipt without changing states", async () => {
    const invalid = { ...receipt(command()), accepted: false, externalId: null };
    const test = fixture({ transportReceipt: invalid });
    const result = await publishOfficialPost(command(), test.dependencies);
    expect(result).toMatchObject({ status: "rejected", code: "INVALID_RECEIPT" });
    expect(test.savedReceipts).toHaveLength(0);
    expect(test.counts()).toEqual({ transportCalls: 1, postTransitions: 0, offerTransitions: 0 });
  });

  it("replays the original completed result without another transport call", async () => {
    const test = fixture();
    const first = await publishOfficialPost(command(), test.dependencies);
    const replay = await publishOfficialPost(command(), test.dependencies);
    expect(replay).toEqual({ ...first, replay: true });
    expect(test.counts()).toEqual({ transportCalls: 1, postTransitions: 1, offerTransitions: 1 });
  });

  it("conflicts when the same idempotency key receives divergent payload", async () => {
    const test = fixture();
    await publishOfficialPost(command(), test.dependencies);
    const conflict = await publishOfficialPost(command({ commandId: "command-2", reason: { code: "DIFFERENT" } }), test.dependencies);
    expect(conflict).toMatchObject({ status: "rejected", code: "IDEMPOTENCY_CONFLICT" });
    expect(test.counts().transportCalls).toBe(1);
  });

  it("includes nested actor, reason and metadata values in the idempotency fingerprint", async () => {
    const test = fixture();
    await publishOfficialPost(command(), test.dependencies);
    const conflict = await publishOfficialPost(command({ metadata: { requestSource: "automation" } }), test.dependencies);
    expect(conflict).toMatchObject({ status: "rejected", code: "IDEMPOTENCY_CONFLICT" });
    expect(test.counts().transportCalls).toBe(1);
  });

  it("replays the same logical payload when only request tracing identifiers change", async () => {
    const test = fixture();
    const first = await publishOfficialPost(command(), test.dependencies);
    const replay = await publishOfficialPost(command({
      commandId: "command-retry",
      correlationId: "correlation-retry",
      causationId: "causation-retry",
      requestedAt: "2026-07-14T12:01:00.000Z"
    }), test.dependencies);
    expect(replay).toEqual({ ...first, replay: true });
    expect(test.counts().transportCalls).toBe(1);
  });

  it("allows at most one external send for concurrent identical commands", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const test = fixture({ transportGate: gate });
    const first = publishOfficialPost(command(), test.dependencies);
    const second = publishOfficialPost(command(), test.dependencies);
    await Promise.resolve();
    release();
    const [one, two] = await Promise.all([first, second]);
    expect(one.status).toBe("published");
    expect(two).toEqual({ ...one, replay: true });
    expect(test.counts().transportCalls).toBe(1);
  });

  it("stores a transport failure as a deterministic replay without changing states", async () => {
    const test = fixture({ transportError: new Error("provider unavailable") });
    const first = await publishOfficialPost(command(), test.dependencies);
    const replay = await publishOfficialPost(command(), test.dependencies);
    expect(first).toMatchObject({ status: "rejected", code: "TRANSPORT_FAILED" });
    expect(replay).toEqual({ ...first, replay: true });
    expect(test.counts()).toEqual({ transportCalls: 1, postTransitions: 0, offerTransitions: 0 });
  });

  it("persists the receipt before requesting either state transition", async () => {
    const test = fixture();
    await publishOfficialPost(command(), test.dependencies);
    expect(test.events).toEqual(["transport", "receipt", "post-state", "offer-state"]);
  });

  it("requires reconciliation after a receipt persistence failure and never resends", async () => {
    const test = fixture({ receiptSaveErrorBefore: new Error("receipt store unavailable") });

    const first = await publishOfficialPost(command(), test.dependencies);
    const reconciled = await publishOfficialPost(command(), test.dependencies);

    expect(first).toMatchObject({
      status: "rejected",
      code: "RECONCILIATION_REQUIRED",
      failureStage: "receipt_persistence"
    });
    expect(reconciled).toMatchObject({ status: "published" });
    expect(test.savedReceipts).toHaveLength(1);
    expect(test.counts()).toEqual({ transportCalls: 1, postTransitions: 1, offerTransitions: 1 });
  });

  it("resumes post reconciliation from the stored receipt without another send", async () => {
    const test = fixture({
      postStateResults: [
        { status: "rejected", code: "DEPENDENCY_UNAVAILABLE", message: "state unavailable" },
        { status: "applied", auditId: "audit-post-reconciled", newState: "published" }
      ]
    });
    const first = await publishOfficialPost(command(), test.dependencies);
    const reconciled = await publishOfficialPost(command(), test.dependencies);
    expect(first).toMatchObject({ status: "rejected", code: "RECONCILIATION_REQUIRED", failureStage: "post_transition" });
    expect(reconciled).toMatchObject({ status: "published", postAuditId: "audit-post-reconciled" });
    expect(test.counts()).toEqual({ transportCalls: 1, postTransitions: 2, offerTransitions: 1 });
  });

  it("resumes offer reconciliation after the post transition without another send", async () => {
    const test = fixture({
      postStateResults: [
        { status: "applied", auditId: "audit-post", newState: "published" },
        { status: "replay", auditId: "audit-post", newState: "published" }
      ],
      offerStateResults: [
        { status: "rejected", code: "DEPENDENCY_UNAVAILABLE", message: "state unavailable" },
        { status: "applied", auditId: "audit-offer-reconciled", newState: "posted" }
      ]
    });
    const first = await publishOfficialPost(command(), test.dependencies);
    const reconciled = await publishOfficialPost(command(), test.dependencies);
    expect(first).toMatchObject({ status: "rejected", code: "RECONCILIATION_REQUIRED", failureStage: "offer_transition" });
    expect(reconciled).toMatchObject({ status: "published", offerAuditId: "audit-offer-reconciled" });
    expect(test.counts()).toEqual({ transportCalls: 1, postTransitions: 2, offerTransitions: 2 });
  });

  it("does not treat a queued asynchronous job as a final receipt", async () => {
    const queued = { ...receipt(command()), outcome: "unknown" as const, deliveryStatus: "queued" as const, externalId: "job-1" };
    const test = fixture({ transportReceipt: queued });
    const result = await publishOfficialPost(command(), test.dependencies);
    expect(result).toMatchObject({ status: "rejected", code: "INVALID_RECEIPT" });
    expect(test.counts()).toEqual({ transportCalls: 1, postTransitions: 0, offerTransitions: 0 });
  });
});
