import type { AuditPort } from "../ports/audit-port";
import type { IdempotencyBeginResult, IdempotencyPort } from "../ports/idempotency-port";
import type { StateRepositoryPort } from "../ports/state-repository-port";
import type {
  AuditRecord,
  CompareAndSetInput,
  CompareAndSetResult,
  EntityType,
  StateEntity,
  StateTransitionResult
} from "../types";

export interface CompatibilityStateBindings {
  findById(
    entityType: EntityType,
    entityId: string,
    tenantId: string
  ): Promise<StateEntity | null>;
  compareAndSet(input: CompareAndSetInput): Promise<CompareAndSetResult>;
  registerAudit(record: AuditRecord): Promise<void>;
  beginIdempotency(
    idempotencyKey: string,
    fingerprint: string
  ): Promise<IdempotencyBeginResult>;
  completeIdempotency(
    idempotencyKey: string,
    fingerprint: string,
    result: StateTransitionResult
  ): Promise<void>;
}

export class CompatibilityStateAdapter
  implements StateRepositoryPort, AuditPort, IdempotencyPort
{
  constructor(private readonly bindings: CompatibilityStateBindings) {}

  findById(
    entityType: EntityType,
    entityId: string,
    tenantId: string
  ): Promise<StateEntity | null> {
    return this.bindings.findById(entityType, entityId, tenantId);
  }

  compareAndSet(input: CompareAndSetInput): Promise<CompareAndSetResult> {
    return this.bindings.compareAndSet(input);
  }

  register(record: AuditRecord): Promise<void> {
    return this.bindings.registerAudit(record);
  }

  begin(idempotencyKey: string, fingerprint: string): Promise<IdempotencyBeginResult> {
    return this.bindings.beginIdempotency(idempotencyKey, fingerprint);
  }

  complete(
    idempotencyKey: string,
    fingerprint: string,
    result: StateTransitionResult
  ): Promise<void> {
    return this.bindings.completeIdempotency(idempotencyKey, fingerprint, result);
  }
}
