export type StateServiceErrorCode =
  | "INVALID_COMMAND"
  | "INVALID_TRANSITION"
  | "STATE_CONFLICT"
  | "VERSION_CONFLICT"
  | "CAS_CONFLICT"
  | "ENTITY_NOT_FOUND"
  | "IDEMPOTENCY_CONFLICT";

export class StateServiceError extends Error {
  constructor(
    public readonly code: StateServiceErrorCode,
    message: string
  ) {
    super(message);
    this.name = "StateServiceError";
  }
}
