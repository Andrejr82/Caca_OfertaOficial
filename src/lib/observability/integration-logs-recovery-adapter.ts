import type {
  ReconciliationRecord,
  ReconciliationRepositoryPort,
  RecoveryItem,
  RecoveryQueuePort,
  RecoveryTechnicalStatus
} from "@/core/observability";
import { sanitizeObservabilityValue } from "@/core/observability";

export interface IntegrationLogsRecoveryRepository {
  upsert(idempotencyKey: string, record: Readonly<Record<string, unknown>>): Promise<void>;
  list(tenantId: string): Promise<readonly RecoveryItem[]>;
  find(recoveryId: string, tenantId: string): Promise<ReconciliationRecord | null>;
  update(recoveryId: string, tenantId: string, status: RecoveryTechnicalStatus, reason: string): Promise<void>;
}

export class IntegrationLogsRecoveryAdapter implements RecoveryQueuePort, ReconciliationRepositoryPort {
  constructor(private readonly repository: IntegrationLogsRecoveryRepository) {}
  async enqueue(item: RecoveryItem): Promise<RecoveryItem> {
    await this.repository.upsert(item.idempotencyKey, {
      user_id: item.tenantId,
      integration: "pmav5-recovery",
      action: item.failureStage,
      status: item.status,
      message: sanitizeObservabilityValue(item.errorMessage),
      metadata: sanitizeObservabilityValue(item)
    });
    return item;
  }
  list(tenantId: string): Promise<readonly RecoveryItem[]> {
    return this.repository.list(tenantId);
  }
  find(recoveryId: string, tenantId: string): Promise<ReconciliationRecord | null> {
    return this.repository.find(recoveryId, tenantId);
  }
  markTechnicalStatus(
    recoveryId: string,
    tenantId: string,
    status: RecoveryTechnicalStatus,
    reason: string
  ): Promise<void> {
    return this.repository.update(recoveryId, tenantId, status, String(sanitizeObservabilityValue(reason)));
  }
}

