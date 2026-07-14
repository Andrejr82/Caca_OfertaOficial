import type { ObservabilityEvent, ObservabilityEventPort } from "@/core/observability";
import { sanitizeObservabilityValue } from "@/core/observability";

export interface IntegrationLogsRepository {
  insert(record: Readonly<Record<string, unknown>>): Promise<void>;
}

export class IntegrationLogsObservabilityAdapter implements ObservabilityEventPort {
  constructor(private readonly repository: IntegrationLogsRepository) {}
  async emit(event: ObservabilityEvent): Promise<void> {
    await this.repository.insert({
      tenant_id: event.tenantId,
      service: event.service,
      component: event.component,
      event_type: event.eventType,
      severity: event.severity,
      result: event.result,
      correlation_id: event.correlationId,
      command_id: event.commandId,
      entity_type: event.entityType,
      entity_id: event.entityId,
      error_code: event.errorCode,
      duration_ms: event.durationMs,
      created_at: event.timestamp,
      metadata: sanitizeObservabilityValue(event.metadata)
    });
  }
}

