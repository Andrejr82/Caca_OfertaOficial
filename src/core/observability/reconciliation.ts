import { createObservabilityEvent } from "./event";
import type {
  ClockPort, ObservabilityEventPort, OfficialReplayPort,
  ReconciliationRepositoryPort, UUIDPort
} from "./ports";

export interface ReplayRequest {
  authenticated: boolean; tenantId: string; recoveryId: string; commandId: string; idempotencyKey: string;
}
export function createReconciliationService(dependencies: {
  repository: ReconciliationRepositoryPort;
  state: OfficialReplayPort;
  ai: OfficialReplayPort;
  publication: OfficialReplayPort;
  events: ObservabilityEventPort;
  clock: ClockPort;
  uuid: UUIDPort;
}) {
  return {
    async replay(request: ReplayRequest): Promise<unknown> {
      if (!request.authenticated) throw new Error("Authenticated operator is required");
      if (!request.tenantId) throw new Error("Tenant is required");
      if (!request.commandId || !request.idempotencyKey) throw new Error("Command and idempotency key are required");
      const record = await dependencies.repository.find(request.recoveryId, request.tenantId);
      if (!record || record.tenantId !== request.tenantId) throw new Error("Recovery item was not found");
      if (record.commandId !== request.commandId || record.idempotencyKey !== request.idempotencyKey)
        throw new Error("Replay conflict");
      if (!record.replayAllowed) throw new Error("Replay is not allowed");
      if (record.service === "publication" && record.finalReceipt) throw new Error("Final receipt requires reconciliation without transport replay");
      await dependencies.repository.markTechnicalStatus?.(record.recoveryId, record.tenantId, "REPLAYING", "official replay requested");
      const eventContext = {
        service: "reconciliation", component: "reconciliation-service", environment: "server",
        commandId: record.commandId, idempotencyKey: record.idempotencyKey,
        correlationId: record.correlationId, causationId: record.causationId, tenantId: record.tenantId
      };
      try {
        await dependencies.events.emit(createObservabilityEvent({
          eventType: "recovery.replay.requested", context: eventContext,
          clock: dependencies.clock, uuid: dependencies.uuid, details: { replay: true }
        }));
        const result = await dependencies[record.service].replay(record);
        await dependencies.repository.markTechnicalStatus?.(record.recoveryId, record.tenantId, "RESOLVED", dependencies.clock.now());
        await dependencies.events.emit(createObservabilityEvent({
          eventType: "recovery.replay.completed", context: eventContext,
          clock: dependencies.clock, uuid: dependencies.uuid, details: { replay: true, result: "success" }
        }));
        return result;
      } catch (error) {
        await dependencies.repository.markTechnicalStatus?.(record.recoveryId, record.tenantId, "MANUAL_ACTION_REQUIRED", "official replay failed");
        await dependencies.events.emit(createObservabilityEvent({
          eventType: "recovery.replay.failed", context: eventContext,
          clock: dependencies.clock, uuid: dependencies.uuid,
          details: { replay: true, result: "failed", severity: "ERROR", errorCode: "REPLAY_FAILED", failureStage: record.service }
        }));
        throw error;
      }
    }
  };
}

