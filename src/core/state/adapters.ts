import type {
  AuditRecord,
  CompareAndSetInput,
  CompareAndSetResult,
  EntityType,
  IdempotencyRecord,
  State,
  StateEntity,
  StateTransitionResult
} from "./types";
import type {
  AuditPort,
  ClockPort,
  IdempotencyBeginResult,
  IdempotencyPort,
  StateRepositoryPort,
  UUIDPort
} from "./ports";

export class MemoryStateAdapter implements StateRepositoryPort, AuditPort, IdempotencyPort {
  private readonly entities = new Map<string, StateEntity>();
  private readonly idempotencyStore = new Map<
    string,
    { fingerprint: string; result: StateTransitionResult }
  >();
  public readonly audits: AuditRecord[] = [];
  public casAttempts = 0;

  constructor(initialEntities: StateEntity[] = []) {
    for (const entity of initialEntities) {
      this.seed(entity);
    }
  }

  private key(entityType: EntityType, entityId: string, tenantId: string): string {
    return `${tenantId}:${entityType}:${entityId}`;
  }

  public seed(entity: StateEntity): void {
    this.entities.set(this.key(entity.entityType, entity.entityId, entity.tenantId), {
      ...entity
    });
  }

  public getEntity(
    entityType: EntityType,
    entityId: string,
    tenantId: string
  ): StateEntity | undefined {
    const current = this.entities.get(this.key(entityType, entityId, tenantId));
    return current ? { ...current } : undefined;
  }

  public async findById(
    entityType: EntityType,
    entityId: string,
    tenantId: string
  ): Promise<StateEntity | null> {
    const current = this.entities.get(this.key(entityType, entityId, tenantId));
    return current ? { ...current } : null;
  }

  public async findByEntityId(
    entityType: EntityType,
    entityId: string,
    tenantId: string
  ): Promise<StateEntity | null> {
    return this.findById(entityType, entityId, tenantId);
  }

  public async compareAndSet(input: CompareAndSetInput): Promise<CompareAndSetResult> {
    this.casAttempts += 1;
    const key = this.key(input.entityType, input.entityId, input.tenantId);
    const current = this.entities.get(key);

    if (!current) {
      return { status: "conflict", entity: null };
    }

    if (
      current.state !== input.expectedState ||
      current.version !== input.expectedVersion
    ) {
      return { status: "conflict", entity: { ...current } };
    }

    const updated: StateEntity = {
      ...current,
      state: input.newState,
      version: current.version + 1
    };
    this.entities.set(key, updated);
    return { status: "applied", entity: { ...updated } };
  }

  public async register(entry: AuditRecord): Promise<void> {
    this.audits.push(entry);
  }

  public async record(entry: AuditRecord): Promise<void> {
    return this.register(entry);
  }

  public async begin(
    idempotencyKey: string,
    fingerprint: string
  ): Promise<IdempotencyBeginResult> {
    const existing = this.idempotencyStore.get(idempotencyKey);
    if (!existing) {
      return { status: "started" };
    }
    if (existing.fingerprint !== fingerprint) {
      return { status: "conflict" };
    }
    return { status: "replay", result: existing.result };
  }

  public async complete(
    idempotencyKey: string,
    fingerprint: string,
    result: StateTransitionResult
  ): Promise<void> {
    this.idempotencyStore.set(idempotencyKey, { fingerprint, result });
  }

  public async find(idempotencyKey: string): Promise<IdempotencyRecord | null> {
    const record = this.idempotencyStore.get(idempotencyKey);
    return record
      ? { idempotencyKey, fingerprint: record.fingerprint, result: record.result }
      : null;
  }

  public async save(
    idempotencyKey: string,
    fingerprint: string,
    result: StateTransitionResult
  ): Promise<void> {
    this.idempotencyStore.set(idempotencyKey, { fingerprint, result });
  }
}

export class MemoryStateRepository extends MemoryStateAdapter {}
export class MemoryIdempotencyAdapter extends MemoryStateAdapter {}
export class MemoryAuditAdapter extends MemoryStateAdapter {}

export class SystemClockAdapter implements ClockPort {
  public now(): string {
    return new Date().toISOString();
  }
}

export class CryptoUuidAdapter implements UUIDPort {
  public generate(): string {
    return crypto.randomUUID();
  }
}

export class CompatibilityStateAdapter {
  private readonly canonicalMap: Record<string, State> = {
    draft: "draft",
    pending_manual_review: "pending_manual_review",
    selected: "selected",
    approved: "approved",
    posted: "posted",
    published: "published",
    rejected: "rejected"
  };

  constructor(
    private readonly bindings?: {
      findById?: (entityType: EntityType, entityId: string, tenantId: string) => Promise<StateEntity | null>;
      compareAndSet?: (input: CompareAndSetInput) => Promise<CompareAndSetResult>;
      registerAudit?: (audit: unknown) => Promise<void>;
      beginIdempotency?: (key: string, fingerprint?: string) => Promise<unknown>;
      completeIdempotency?: (key: string, result: unknown) => Promise<void>;
    }
  ) {}

  public isLegacyStateSupported(legacyState: string): boolean {
    return Boolean(this.canonicalMap[legacyState]);
  }

  public mapToCanonical(legacyState: string): State | null {
    return this.canonicalMap[legacyState] ?? null;
  }

  public async findById(
    entityType: EntityType,
    entityId: string,
    tenantId: string
  ): Promise<StateEntity | null> {
    if (this.bindings?.findById) {
      return this.bindings.findById(entityType, entityId, tenantId);
    }
    return null;
  }

  public async compareAndSet(input: CompareAndSetInput): Promise<CompareAndSetResult> {
    if (this.bindings?.compareAndSet) {
      return this.bindings.compareAndSet(input);
    }
    return { status: "conflict", entity: null };
  }

  public async registerAudit(audit: unknown): Promise<void> {
    if (this.bindings?.registerAudit) {
      await this.bindings.registerAudit(audit);
    }
  }

  public async beginIdempotency(key: string, fingerprint?: string): Promise<unknown> {
    if (this.bindings?.beginIdempotency) {
      return this.bindings.beginIdempotency(key, fingerprint);
    }
    return { status: "started" };
  }

  public async completeIdempotency(key: string, result: unknown): Promise<void> {
    if (this.bindings?.completeIdempotency) {
      await this.bindings.completeIdempotency(key, result);
    }
  }
}

export class DefaultCompatibilityStateAdapter extends CompatibilityStateAdapter {}

export class FutureSupabaseStateAdapter {
  constructor(
    private readonly gateway?: {
      findById?: (entityType: EntityType, entityId: string, tenantId: string) => Promise<StateEntity | null>;
      compareAndSet?: (input: CompareAndSetInput) => Promise<CompareAndSetResult>;
    }
  ) {}

  public async findById(
    entityType: EntityType,
    entityId: string,
    tenantId: string
  ): Promise<StateEntity | null> {
    if (this.gateway?.findById) {
      return this.gateway.findById(entityType, entityId, tenantId);
    }
    return null;
  }

  public async compareAndSet(input: CompareAndSetInput): Promise<CompareAndSetResult> {
    if (this.gateway?.compareAndSet) {
      return this.gateway.compareAndSet(input);
    }
    return { status: "conflict", entity: null };
  }
}
