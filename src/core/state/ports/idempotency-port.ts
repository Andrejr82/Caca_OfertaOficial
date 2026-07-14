import type { StateTransitionResult } from "../types";

export type IdempotencyBeginResult =
  | { status: "started" }
  | { status: "replay"; result: StateTransitionResult }
  | { status: "pending"; result: Promise<StateTransitionResult> }
  | { status: "conflict" };

export interface IdempotencyPort {
  begin(idempotencyKey: string, fingerprint: string): Promise<IdempotencyBeginResult>;
  complete(
    idempotencyKey: string,
    fingerprint: string,
    result: StateTransitionResult
  ): Promise<void>;
}
