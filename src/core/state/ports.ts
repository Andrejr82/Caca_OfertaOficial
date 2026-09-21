import type {
  AuditRecord,
  CompareAndSetInput,
  CompareAndSetResult,
  EntityType,
  IdempotencyRecord,
  StateEntity,
  StateTransitionResult
} from "./types";

export interface AuditPort {
  register(entry: AuditRecord): Promise<void>;
  record?(entry: AuditRecord): Promise<void>;
}

export interface ClockPort {
  now(): string;
}

export type IdempotencyBeginResult =
  | { status: "started" }
  | { status: "replay"; result: StateTransitionResult }
  | { status: "pending"; result: Promise<StateTransitionResult> }
  | { status: "conflict" };

export interface IdempotencyPort {
  find?(idempotencyKey: string): Promise<IdempotencyRecord | null>;
  save?(
    idempotencyKey: string,
    fingerprint: string,
    result: StateTransitionResult
  ): Promise<void>;
  begin(idempotencyKey: string, fingerprint: string): Promise<IdempotencyBeginResult>;
  complete(
    idempotencyKey: string,
    fingerprint: string,
    result: StateTransitionResult
  ): Promise<void>;
}

export interface StateRepositoryPort {
  findById(
    entityType: EntityType,
    entityId: string,
    tenantId: string
  ): Promise<StateEntity | null>;
  findByEntityId?(
    entityType: EntityType,
    entityId: string,
    tenantId: string
  ): Promise<StateEntity | null>;
  compareAndSet(input: CompareAndSetInput): Promise<CompareAndSetResult>;
}

export interface UUIDPort {
  generate(): string;
}

export type UuidPort = UUIDPort;
