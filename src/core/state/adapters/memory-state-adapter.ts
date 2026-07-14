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

interface PendingIdempotencyEntry {
  fingerprint: string;
  result: Promise<StateTransitionResult>;
  resolve: (result: StateTransitionResult) => void;
}

interface CompletedIdempotencyEntry {
  fingerprint: string;
  result: StateTransitionResult;
}

type IdempotencyEntry = PendingIdempotencyEntry | CompletedIdempotencyEntry;

function entityKey(entityType: EntityType, entityId: string, tenantId: string): string {
  return `${tenantId}:${entityType}:${entityId}`;
}

export class MemoryStateAdapter implements StateRepositoryPort, AuditPort, IdempotencyPort {
  private readonly entities = new Map<string, StateEntity>();
  private readonly idempotency = new Map<string, IdempotencyEntry>();
  readonly audits: AuditRecord[] = [];
  casAttempts = 0;

  constructor(initialEntities: readonly StateEntity[] = []) {
    for (const entity of initialEntities) {
      this.entities.set(
        entityKey(entity.entityType, entity.entityId, entity.tenantId),
        { ...entity }
      );
    }
  }

  async findById(
    entityType: EntityType,
    entityId: string,
    tenantId: string
  ): Promise<StateEntity | null> {
    return this.getEntity(entityType, entityId, tenantId);
  }

  getEntity(entityType: EntityType, entityId: string, tenantId: string): StateEntity | null {
    const entity = this.entities.get(entityKey(entityType, entityId, tenantId));
    return entity ? { ...entity } : null;
  }

  async compareAndSet(input: CompareAndSetInput): Promise<CompareAndSetResult> {
    this.casAttempts += 1;
    const key = entityKey(input.entityType, input.entityId, input.tenantId);
    const current = this.entities.get(key);

    if (
      !current ||
      current.state !== input.expectedState ||
      current.version !== input.expectedVersion
    ) {
      return { status: "conflict", entity: current ? { ...current } : null };
    }

    const updated: StateEntity = {
      ...current,
      state: input.newState,
      version: current.version + 1
    };
    this.entities.set(key, updated);
    return { status: "applied", entity: { ...updated } };
  }

  async register(record: AuditRecord): Promise<void> {
    this.audits.push(record);
  }

  async begin(idempotencyKey: string, fingerprint: string): Promise<IdempotencyBeginResult> {
    const existing = this.idempotency.get(idempotencyKey);
    if (existing) {
      if (existing.fingerprint !== fingerprint) return { status: "conflict" };
      if ("resolve" in existing) return { status: "pending", result: existing.result };
      return { status: "replay", result: existing.result };
    }

    let resolve!: (result: StateTransitionResult) => void;
    const result = new Promise<StateTransitionResult>((complete) => {
      resolve = complete;
    });
    this.idempotency.set(idempotencyKey, { fingerprint, result, resolve });
    return { status: "started" };
  }

  async complete(
    idempotencyKey: string,
    fingerprint: string,
    result: StateTransitionResult
  ): Promise<void> {
    const existing = this.idempotency.get(idempotencyKey);
    if (existing && "resolve" in existing && existing.fingerprint === fingerprint) {
      existing.resolve(result);
    }
    this.idempotency.set(idempotencyKey, { fingerprint, result });
  }
}
