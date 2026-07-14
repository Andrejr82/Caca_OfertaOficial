import { StateServiceError, type StateServiceErrorCode } from "./errors";
import type { AuditPort } from "./ports/audit-port";
import type { ClockPort } from "./ports/clock-port";
import type { IdempotencyPort } from "./ports/idempotency-port";
import type { StateRepositoryPort } from "./ports/state-repository-port";
import type { UUIDPort } from "./ports/uuid-port";
import type {
  AuditRecord,
  EntityType,
  OfferTransitionCommand,
  PostTransitionCommand,
  State,
  StateEntity,
  StateTransitionCommand,
  StateTransitionResult
} from "./types";
import { validateTransition } from "./state-machine";
import { assertExpectedState, validateCommand } from "./validation";

export interface StateServiceDependencies {
  repository: StateRepositoryPort;
  audit: AuditPort;
  clock: ClockPort;
  uuid: UUIDPort;
  idempotency: IdempotencyPort;
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function rejectedResult(
  command: StateTransitionCommand,
  code: StateServiceErrorCode,
  message: string,
  auditId: string,
  timestamp: string
): StateTransitionResult {
  return {
    status: "rejected",
    code,
    message,
    commandId: command.commandId,
    correlationId: command.correlationId,
    auditId,
    rejectedAt: timestamp
  };
}

function auditRecord(
  command: StateTransitionCommand,
  auditId: string,
  timestamp: string,
  result: AuditRecord["result"],
  previousState: State | null,
  errorCode?: StateServiceErrorCode
): AuditRecord {
  return {
    auditId,
    timestamp,
    actor: command.actor && typeof command.actor === "object" ? command.actor : null,
    origin: command.origin,
    reason: command.reason && typeof command.reason === "object" ? command.reason : null,
    entity: command.entityType,
    entityId: command.entityId,
    previousState,
    newState: command.toState,
    commandId: command.commandId,
    correlationId: command.correlationId,
    causationId: command.causationId,
    result,
    ...(errorCode ? { errorCode } : {})
  };
}

async function registerReplayAudit(
  command: StateTransitionCommand,
  original: StateTransitionResult,
  dependencies: StateServiceDependencies,
  auditId: string,
  timestamp: string
): Promise<void> {
  const previousState = original.status === "applied" ? original.previousState : null;
  await dependencies.audit.register(
    auditRecord(command, auditId, timestamp, "idempotent_replay", previousState)
  );
}

async function executeTransition(
  command: StateTransitionCommand,
  dependencies: StateServiceDependencies,
  expectedEntityType: EntityType
): Promise<StateTransitionResult> {
  const timestamp = dependencies.clock.now();
  const auditId = dependencies.uuid.generate();
  const validationError =
    command.entityType !== expectedEntityType
      ? `Command entity type must be ${expectedEntityType}`
      : validateCommand(command);

  if (validationError) {
    const result = rejectedResult(
      command,
      "INVALID_COMMAND",
      validationError,
      auditId,
      timestamp
    );
    await dependencies.audit.register(
      auditRecord(command, auditId, timestamp, "rejected", null, "INVALID_COMMAND")
    );
    return result;
  }

  const fingerprint = stableSerialize(command);
  const idempotency = await dependencies.idempotency.begin(
    command.idempotencyKey,
    fingerprint
  );

  if (idempotency.status === "conflict") {
    const result = rejectedResult(
      command,
      "IDEMPOTENCY_CONFLICT",
      "Idempotency key was already used with a different payload",
      auditId,
      timestamp
    );
    await dependencies.audit.register(
      auditRecord(command, auditId, timestamp, "rejected", null, "IDEMPOTENCY_CONFLICT")
    );
    return result;
  }

  if (idempotency.status === "replay" || idempotency.status === "pending") {
    const original =
      idempotency.status === "replay" ? idempotency.result : await idempotency.result;
    await registerReplayAudit(command, original, dependencies, auditId, timestamp);
    return original;
  }

  const finish = async (
    result: StateTransitionResult,
    previousState: State | null
  ): Promise<StateTransitionResult> => {
    await dependencies.audit.register(
      auditRecord(
        command,
        auditId,
        timestamp,
        result.status,
        previousState,
        result.status === "rejected" ? result.code : undefined
      )
    );
    await dependencies.idempotency.complete(command.idempotencyKey, fingerprint, result);
    return result;
  };

  const entity = await dependencies.repository.findById(
    command.entityType,
    command.entityId,
    command.tenantId
  );
  if (!entity) {
    return finish(
      rejectedResult(
        command,
        "ENTITY_NOT_FOUND",
        "State entity was not found",
        auditId,
        timestamp
      ),
      null
    );
  }

  try {
    assertExpectedState(entity, command.fromState, command.expectedVersion);
  } catch (error) {
    if (!(error instanceof StateServiceError)) throw error;
    return finish(
      rejectedResult(command, error.code, error.message, auditId, timestamp),
      entity.state
    );
  }

  if (!validateTransition(command.entityType, command.fromState, command.toState)) {
    return finish(
      rejectedResult(
        command,
        "INVALID_TRANSITION",
        `Transition ${command.fromState} -> ${command.toState} is not allowed`,
        auditId,
        timestamp
      ),
      entity.state
    );
  }

  const cas = await dependencies.repository.compareAndSet({
    entityType: command.entityType,
    entityId: command.entityId,
    tenantId: command.tenantId,
    expectedState: command.fromState,
    expectedVersion: command.expectedVersion,
    newState: command.toState
  });

  if (cas.status === "conflict") {
    const code: StateServiceErrorCode = !cas.entity
      ? "ENTITY_NOT_FOUND"
      : cas.entity.state !== command.fromState
        ? "STATE_CONFLICT"
        : cas.entity.version !== command.expectedVersion
          ? "VERSION_CONFLICT"
          : "CAS_CONFLICT";
    return finish(
      rejectedResult(command, code, "Compare-and-set conflict", auditId, timestamp),
      cas.entity?.state ?? null
    );
  }

  const result: StateTransitionResult = {
    status: "applied",
    entityType: command.entityType,
    entityId: command.entityId,
    tenantId: command.tenantId,
    previousState: entity.state,
    newState: cas.entity.state,
    previousVersion: entity.version,
    newVersion: cas.entity.version,
    auditId,
    appliedAt: timestamp
  };
  return finish(result, entity.state);
}

export async function transitionOfferState(
  command: OfferTransitionCommand,
  dependencies: StateServiceDependencies
): Promise<StateTransitionResult> {
  return executeTransition(command, dependencies, "offer");
}

export async function transitionPostState(
  command: PostTransitionCommand,
  dependencies: StateServiceDependencies
): Promise<StateTransitionResult> {
  return executeTransition(command, dependencies, "post");
}
