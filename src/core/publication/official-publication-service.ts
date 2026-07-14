import type { OfficialPublicationServiceDependencies } from "./ports";
import type {
  OfficialPublicationCommand,
  OfficialPublicationReceipt,
  OfficialPublicationRejectedResult,
  OfficialPublicationResult,
  PublicationAuditRecord
} from "./types";
import { validateFinalReceipt, validatePublicationCommand } from "./validation";

function fingerprint(command: OfficialPublicationCommand): string {
  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, nested]) => [key, normalize(nested)])
      );
    }
    return value;
  };
  const {
    commandId: _commandId,
    correlationId: _correlationId,
    causationId: _causationId,
    requestedAt: _requestedAt,
    ...logicalPayload
  } = command;
  return JSON.stringify(normalize(logicalPayload));
}

function rejected(command: OfficialPublicationCommand, code: string, message: string, stage: string, at: string): OfficialPublicationRejectedResult {
  return {
    status: "rejected",
    code,
    message,
    commandId: command.commandId || "invalid",
    offerId: command.offerId || "invalid",
    postId: command.postId || "invalid",
    channel: command.channel,
    failureStage: stage,
    rejectedAt: at,
    replay: false
  };
}

function baseAudit(command: OfficialPublicationCommand, timestamp: string): PublicationAuditRecord {
  return {
    timestamp,
    commandId: command.commandId,
    idempotencyKey: command.idempotencyKey,
    correlationId: command.correlationId,
    causationId: command.causationId,
    tenantId: command.tenantId,
    offerId: command.offerId,
    postId: command.postId,
    channel: command.channel,
    actor: command.actor,
    origin: command.origin,
    reason: command.reason,
    transport: null,
    durationMs: 0,
    reservation: "not_started",
    transportResult: "not_called",
    receiptId: null,
    receiptRecorded: false,
    postTransition: "not_requested",
    offerCondition: "not_evaluated",
    offerTransition: "not_requested",
    result: "rejected",
    replay: false,
    failureStage: null,
    errorCode: null
  };
}

async function auditRejection(
  command: OfficialPublicationCommand,
  dependencies: OfficialPublicationServiceDependencies,
  result: OfficialPublicationRejectedResult,
  audit: PublicationAuditRecord
): Promise<OfficialPublicationRejectedResult> {
  audit.result = result.code === "RECONCILIATION_REQUIRED" ? "reconciliation_required" : "rejected";
  audit.failureStage = result.failureStage;
  audit.errorCode = result.code;
  await dependencies.audit.register(audit);
  return result;
}

function preconditionError(command: OfficialPublicationCommand, offer: Awaited<ReturnType<OfficialPublicationServiceDependencies["repository"]["findOffer"]>>, post: Awaited<ReturnType<OfficialPublicationServiceDependencies["repository"]["findPost"]>>) {
  if (!offer) return ["OFFER_NOT_FOUND", "Offer was not found", "offer"] as const;
  if (!post) return ["POST_NOT_FOUND", "Post was not found", "post"] as const;
  if (offer.tenantId !== command.tenantId || post.tenantId !== command.tenantId) return ["TENANT_MISMATCH", "Offer or post belongs to another tenant", "tenant"] as const;
  if (post.offerId !== offer.id || post.offerId !== command.offerId) return ["POST_OFFER_MISMATCH", "Post does not belong to the offer", "relationship"] as const;
  if (post.channel !== command.channel) return ["CHANNEL_MISMATCH", "Post channel differs from command channel", "channel"] as const;
  if (!post.destination.trim()) return ["DESTINATION_UNAVAILABLE", "Publication destination is not configured", "destination"] as const;
  if (offer.state !== "approved") return ["OFFER_STATE_MISMATCH", "Official publication requires approved offer", "offer_state"] as const;
  if (offer.version !== command.expectedOfferVersion) return ["OFFER_VERSION_CONFLICT", "Offer version differs from the expected version", "offer_version"] as const;
  if (post.state !== "draft") return ["POST_STATE_MISMATCH", "Official publication requires draft post", "post_state"] as const;
  if (post.version !== command.expectedPostVersion) return ["POST_VERSION_CONFLICT", "Post version differs from the expected version", "post_version"] as const;
  if (!post.content.trim() || command.payloadReference !== `post:${post.id}:v${post.version}`) return ["PAYLOAD_REFERENCE_MISMATCH", "Persisted publication payload is invalid", "payload"] as const;
  return null;
}

export async function publishOfficialPost(
  command: OfficialPublicationCommand,
  dependencies: OfficialPublicationServiceDependencies
): Promise<OfficialPublicationResult> {
  const startedAt = dependencies.clock.now();
  const audit = baseAudit(command, startedAt);
  const invalid = validatePublicationCommand(command);
  if (invalid) return auditRejection(command, dependencies, rejected(command, invalid.code, invalid.message, "command", startedAt), audit);

  const commandFingerprint = fingerprint(command);
  const reservation = await dependencies.reservations.begin(command.idempotencyKey, commandFingerprint, command);
  audit.reservation = reservation.status;
  if (reservation.status === "conflict") {
    return auditRejection(command, dependencies, rejected(command, "IDEMPOTENCY_CONFLICT", "Idempotency key has a divergent payload", "reservation", startedAt), audit);
  }
  if (reservation.status === "replay" || reservation.status === "pending") {
    const original = reservation.status === "replay" ? reservation.result : await reservation.result;
    const replay = { ...original, replay: true } as OfficialPublicationResult;
    audit.result = "idempotent_replay";
    audit.replay = true;
    await dependencies.audit.register(audit);
    return replay;
  }

  let finalReceipt: OfficialPublicationReceipt | null = await dependencies.receipts.findFinal(command);
  const [offer, post] = await Promise.all([
    dependencies.repository.findOffer(command.offerId, command.tenantId),
    dependencies.repository.findPost(command.postId, command.tenantId)
  ]);

  const precondition = preconditionError(command, offer, post);
  if (precondition) {
    const result = rejected(command, precondition[0], precondition[1], precondition[2], startedAt);
    await dependencies.reservations.complete(command.idempotencyKey, commandFingerprint, result);
    return auditRejection(command, dependencies, result, audit);
  }

  if (finalReceipt && !validateFinalReceipt(finalReceipt, command)) {
    const result = rejected(command, "INVALID_RECEIPT", "Stored receipt is invalid", "receipt", startedAt);
    await dependencies.reservations.complete(command.idempotencyKey, commandFingerprint, result);
    return auditRejection(command, dependencies, result, audit);
  }

  if (!finalReceipt) {
    try {
      const transport = dependencies.transports.resolve(command.channel);
      audit.transport = transport.channel;
      finalReceipt = await transport.publish({
        commandId: command.commandId,
        idempotencyKey: command.idempotencyKey,
        correlationId: command.correlationId,
        causationId: command.causationId,
        tenantId: command.tenantId,
        offerId: command.offerId,
        postId: command.postId,
        channel: command.channel,
        content: post!.content,
        mediaUrl: post!.mediaUrl,
        destination: post!.destination,
        timeoutMs: 30_000,
        metadata: { ...(command.metadata ?? {}), ...(post!.metadata ?? {}) }
      });
    } catch (error) {
      audit.transportResult = "failed";
      const result = rejected(command, "TRANSPORT_FAILED", error instanceof Error ? error.message : "Transport failed", "transport", startedAt);
      await dependencies.reservations.complete(command.idempotencyKey, commandFingerprint, result);
      return auditRejection(command, dependencies, result, audit);
    }
    if (!validateFinalReceipt(finalReceipt, command)) {
      audit.transportResult = "invalid";
      const result = rejected(command, "INVALID_RECEIPT", "Transport did not return a valid final receipt", "receipt", startedAt);
      await dependencies.reservations.complete(command.idempotencyKey, commandFingerprint, result);
      return auditRejection(command, dependencies, result, audit);
    }
    try {
      await dependencies.receipts.save(finalReceipt);
      await dependencies.reservations.markReceiptRecorded(command.idempotencyKey, commandFingerprint, finalReceipt);
    } catch (error) {
      audit.receiptId = finalReceipt.receiptId;
      const result = rejected(
        command,
        "RECONCILIATION_REQUIRED",
        error instanceof Error ? error.message : "Receipt persistence failed",
        "receipt_persistence",
        startedAt
      );
      await dependencies.reservations.markReconciliationRequired(command.idempotencyKey, commandFingerprint, result, finalReceipt);
      return auditRejection(command, dependencies, result, audit);
    }
    audit.transportResult = "confirmed";
    audit.receiptRecorded = true;
  } else {
    audit.transportResult = "reused_receipt";
    audit.receiptRecorded = true;
  }
  audit.receiptId = finalReceipt.receiptId;

  const postState = await dependencies.state.publishPost({ command, receipt: finalReceipt });
  audit.postTransition = postState.status;
  if (postState.status === "rejected") {
    const result = rejected(command, "RECONCILIATION_REQUIRED", postState.message, "post_transition", startedAt);
    await dependencies.reservations.markReconciliationRequired(command.idempotencyKey, commandFingerprint, result);
    return auditRejection(command, dependencies, result, audit);
  }

  audit.offerCondition = "first_confirmed_receipt";
  const offerState = await dependencies.state.concludeOffer({ command, receipt: finalReceipt });
  audit.offerTransition = offerState.status;
  if (offerState.status === "rejected") {
    const result = rejected(command, "RECONCILIATION_REQUIRED", offerState.message, "offer_transition", startedAt);
    await dependencies.reservations.markReconciliationRequired(command.idempotencyKey, commandFingerprint, result);
    return auditRejection(command, dependencies, result, audit);
  }

  const result = {
    status: "published" as const,
    commandId: command.commandId,
    offerId: command.offerId,
    postId: command.postId,
    channel: command.channel,
    externalId: finalReceipt.externalId!,
    receiptId: finalReceipt.receiptId,
    postState: "published" as const,
    offerState: "posted" as const,
    postAuditId: postState.auditId,
    offerAuditId: offerState.auditId,
    completedAt: dependencies.clock.now(),
    replay: false
  };
  await dependencies.reservations.complete(command.idempotencyKey, commandFingerprint, result);
  audit.result = "published";
  await dependencies.audit.register(audit);
  return result;
}
