import { StateServiceError } from "./errors";
import type { State, StateEntity, StateTransitionCommand } from "./types";

const offerStates = new Set([
  "pending_manual_review",
  "selected",
  "approved",
  "posted",
  "rejected"
]);
const postStates = new Set(["draft", "published"]);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateCommand(command: StateTransitionCommand): string | null {
  if (command.contractVersion !== "pmav5.state-transition/v1") {
    return "Unsupported State contract version";
  }
  if (!command.actor || typeof command.actor !== "object") {
    return "Actor is required";
  }
  if (!command.reason || typeof command.reason !== "object") {
    return "Reason is required";
  }

  const requiredStrings = [
    command.commandId,
    command.idempotencyKey,
    command.correlationId,
    command.tenantId,
    command.entityId,
    command.origin,
    command.requestedAt,
    command.actor.id,
    command.actor.service,
    command.reason.code
  ];
  if (requiredStrings.some((value) => !isNonEmptyString(value))) {
    return "Command contains an empty required field";
  }

  if (
    command.causationId !== null &&
    !isNonEmptyString(command.causationId)
  ) {
    return "Causation ID must be a non-empty string or null";
  }
  if (!Number.isInteger(command.expectedVersion) || command.expectedVersion < 0) {
    return "Expected version must be a non-negative integer";
  }
  if (!Array.isArray(command.evidenceRefs)) {
    return "Evidence references must be an array";
  }
  if (command.evidenceRefs.some((reference) => !isNonEmptyString(reference))) {
    return "Evidence references must contain non-empty strings";
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(command.requestedAt)) {
    return "Requested timestamp must be ISO-8601 UTC";
  }
  if (command.actor.type !== "user" && command.actor.type !== "service") {
    return "Actor type is invalid";
  }

  const validStates = command.entityType === "offer" ? offerStates : postStates;
  if (!validStates.has(command.fromState) || !validStates.has(command.toState)) {
    return `State does not belong to ${command.entityType}`;
  }

  return null;
}

export function assertExpectedState(
  entity: StateEntity,
  expectedState: State,
  expectedVersion: number
): void {
  if (entity.state !== expectedState) {
    throw new StateServiceError(
      "STATE_CONFLICT",
      `Expected state ${expectedState}, received ${entity.state}`
    );
  }

  if (entity.version !== expectedVersion) {
    throw new StateServiceError(
      "VERSION_CONFLICT",
      `Expected version ${expectedVersion}, received ${entity.version}`
    );
  }
}
