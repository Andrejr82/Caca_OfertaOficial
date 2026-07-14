import { createObservabilityEvent, type ClockPort, type ObservabilityEventPort, type UUIDPort } from "@/core/observability";
import type { OfficialAIAuditPort, OfficialAIAuditRecord } from "@/core/ai";
import type { PublicationAuditPort, PublicationAuditRecord } from "@/core/publication";
import type { AuditPort, AuditRecord } from "@/core/state";

interface BridgeDependencies {
  events: ObservabilityEventPort;
  clock: ClockPort;
  uuid: UUIDPort;
  environment: string;
}

async function bestEffort(task: () => Promise<void> | void): Promise<void> {
  try { await task(); } catch { /* Observability cannot corrupt a business result. */ }
}

export class StateObservabilityAuditAdapter implements AuditPort {
  constructor(private readonly delegate: AuditPort, private readonly dependencies: BridgeDependencies) {}
  async register(record: AuditRecord): Promise<void> {
    await this.delegate.register(record);
    const conflict = record.errorCode?.includes("CONFLICT") ?? false;
    const eventType = record.result === "applied"
      ? "state.transition.completed"
      : record.result === "idempotent_replay"
        ? "state.transition.replayed"
        : conflict ? "state.transition.conflict" : "state.transition.rejected";
    await bestEffort(() => this.dependencies.events.emit(createObservabilityEvent({
      eventType,
      context: {
        service: "official-state", component: "state-service", environment: this.dependencies.environment,
        commandId: record.commandId, correlationId: record.correlationId,
        causationId: record.causationId, tenantId: null
      },
      clock: this.dependencies.clock, uuid: this.dependencies.uuid,
      details: {
        entityType: record.entity, entityId: record.entityId,
        previousState: record.previousState, desiredState: record.newState,
        finalState: record.result === "applied" ? record.newState : record.previousState,
        replay: record.result === "idempotent_replay",
        result: record.result === "applied" ? "success" : record.result === "idempotent_replay" ? "replayed" : conflict ? "conflict" : "rejected",
        errorCode: record.errorCode ?? null, severity: record.result === "applied" ? "INFO" : "WARN"
      }
    })));
  }
}

export class AIObservabilityAuditAdapter implements OfficialAIAuditPort {
  constructor(private readonly delegate: OfficialAIAuditPort, private readonly dependencies: BridgeDependencies) {}
  async register(record: OfficialAIAuditRecord): Promise<void> {
    await this.delegate.register(record);
    const eventType = record.result === "approved" ? "ai.approved" : record.replay ? "ai.replayed" : "ai.failed";
    await bestEffort(() => this.dependencies.events.emit(createObservabilityEvent({
      eventType,
      context: {
        service: "official-ai", component: "ai-service", environment: this.dependencies.environment,
        commandId: record.commandId, idempotencyKey: record.idempotencyKey,
        correlationId: record.correlationId, causationId: record.causationId, tenantId: record.tenantId
      },
      clock: this.dependencies.clock, uuid: this.dependencies.uuid,
      details: {
        entityType: "offer", entityId: record.offerId, offerId: record.offerId,
        provider: record.provider, model: record.model, durationMs: record.latencyMs,
        replay: record.replay, result: record.result === "approved" ? "success" : record.replay ? "replayed" : "failed",
        errorCode: record.errorCode, failureStage: record.failureStage,
        severity: record.result === "approved" || record.replay ? "INFO" : "ERROR",
        metadata: { postsPrepared: record.postsPrepared, postsPersisted: record.postsPersisted }
      }
    })));
  }
}

export class PublicationObservabilityAuditAdapter implements PublicationAuditPort {
  constructor(private readonly delegate: PublicationAuditPort, private readonly dependencies: BridgeDependencies) {}
  async register(record: PublicationAuditRecord): Promise<void> {
    await this.delegate.register(record);
    const eventType = record.result === "published"
      ? "publication.offer.posted"
      : record.result === "idempotent_replay"
        ? "publication.replayed"
        : record.result === "reconciliation_required"
          ? "publication.reconciliation.required"
          : "publication.failed";
    await bestEffort(() => this.dependencies.events.emit(createObservabilityEvent({
      eventType,
      context: {
        service: "official-publication", component: "publication-service", environment: this.dependencies.environment,
        commandId: record.commandId, idempotencyKey: record.idempotencyKey,
        correlationId: record.correlationId, causationId: record.causationId, tenantId: record.tenantId
      },
      clock: this.dependencies.clock, uuid: this.dependencies.uuid,
      details: {
        entityType: "post", entityId: record.postId, offerId: record.offerId, postId: record.postId,
        channel: record.channel, transport: record.transport, durationMs: record.durationMs,
        replay: record.replay, result: record.result === "published" ? "success" : record.result === "idempotent_replay" ? "replayed" : "failed",
        errorCode: record.errorCode, failureStage: record.failureStage,
        severity: record.result === "published" || record.result === "idempotent_replay" ? "INFO" : "ERROR",
        metadata: { receiptId: record.receiptId, reservation: record.reservation, receiptRecorded: record.receiptRecorded }
      }
    })));
  }
}

