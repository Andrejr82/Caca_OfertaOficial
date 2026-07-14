import type { ObservabilityEvent } from "./types";
import type { RecoveryItem, RecoveryTechnicalStatus } from "./recovery";

export interface ObservabilityEventPort { emit(event: ObservabilityEvent): Promise<void> | void }
export interface MetricsPort {
  increment(name: string, value?: number, labels?: Readonly<Record<string, string>>): void;
  gauge(name: string, value: number, labels?: Readonly<Record<string, string>>): void;
  observe(name: string, value: number, labels?: Readonly<Record<string, string>>): void;
}
export interface ClockPort { now(): string }
export interface UUIDPort { generate(): string }
export interface HealthPort {
  readonly name: string;
  readonly required: boolean;
  check(): Promise<{ healthy: boolean; detail?: unknown }>;
}
export interface RecoveryQueuePort {
  enqueue(item: RecoveryItem): Promise<RecoveryItem>;
  list(tenantId: string): Promise<readonly RecoveryItem[]>;
}
export interface ReconciliationRepositoryPort {
  find(recoveryId: string, tenantId: string): Promise<ReconciliationRecord | null>;
  markTechnicalStatus?(recoveryId: string, tenantId: string, status: RecoveryTechnicalStatus, reason: string): Promise<void>;
}
export interface ReconciliationRecord {
  recoveryId: string;
  tenantId: string;
  service: "state" | "ai" | "publication";
  status: RecoveryTechnicalStatus;
  replayAllowed: boolean;
  commandId: string;
  idempotencyKey: string;
  correlationId: string;
  causationId: string | null;
  finalReceipt?: boolean;
}
export interface OfficialReplayPort { replay(record: ReconciliationRecord): Promise<unknown> }

