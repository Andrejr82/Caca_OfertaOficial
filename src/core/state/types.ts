export type EntityType = "offer" | "post";

export type OfferState =
  | "pending_manual_review"
  | "selected"
  | "approved"
  | "posted"
  | "rejected";

export type PostState = "draft" | "published";

export type State = OfferState | PostState;

export interface StateEntity {
  entityType: EntityType;
  entityId: string;
  tenantId: string;
  state: State;
  version: number;
}

export interface StateActor {
  type: "user" | "service";
  id: string;
  service: string;
}

export interface StateReason {
  code: string;
  detail?: string;
}

interface TransitionCommandBase {
  contractVersion: "pmav5.state-transition/v1";
  commandId: string;
  idempotencyKey: string;
  correlationId: string;
  causationId: string | null;
  tenantId: string;
  entityId: string;
  expectedVersion: number;
  actor: StateActor;
  origin: string;
  reason: StateReason;
  evidenceRefs: readonly string[];
  requestedAt: string;
}

export interface OfferTransitionCommand extends TransitionCommandBase {
  entityType: "offer";
  fromState: OfferState;
  toState: OfferState;
}

export interface PostTransitionCommand extends TransitionCommandBase {
  entityType: "post";
  fromState: PostState;
  toState: PostState;
}

export type StateTransitionCommand = OfferTransitionCommand | PostTransitionCommand;

export interface AppliedTransitionResult {
  status: "applied";
  entityType: EntityType;
  entityId: string;
  tenantId: string;
  previousState: State;
  newState: State;
  previousVersion: number;
  newVersion: number;
  auditId: string;
  appliedAt: string;
}

export interface RejectedTransitionResult {
  status: "rejected";
  code: import("./errors").StateServiceErrorCode;
  message: string;
  commandId: string;
  correlationId: string;
  auditId: string;
  rejectedAt: string;
}

export type StateTransitionResult = AppliedTransitionResult | RejectedTransitionResult;

export type AuditResult = "applied" | "rejected" | "idempotent_replay";

export interface AuditRecord {
  auditId: string;
  timestamp: string;
  actor: StateActor | null;
  origin: string;
  reason: StateReason | null;
  entity: EntityType;
  entityId: string;
  previousState: State | null;
  newState: State;
  commandId: string;
  correlationId: string;
  causationId: string | null;
  result: AuditResult;
  errorCode?: import("./errors").StateServiceErrorCode;
}

export interface CompareAndSetInput {
  entityType: EntityType;
  entityId: string;
  tenantId: string;
  expectedState: State;
  expectedVersion: number;
  newState: State;
}

export type CompareAndSetResult =
  | { status: "applied"; entity: StateEntity }
  | { status: "conflict"; entity: StateEntity | null };

export interface IdempotencyRecord {
  idempotencyKey: string;
  fingerprint: string;
  result: StateTransitionResult;
}
