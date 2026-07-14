import {
  transitionOfferState,
  transitionPostState,
  type OfferState,
  type OfferTransitionCommand,
  type PostState,
  type PostTransitionCommand,
  type StateActor,
  type StateReason,
  type StateServiceDependencies,
  type StateTransitionResult
} from "@/core/state";

interface OfficialTransitionContext {
  commandId: string;
  idempotencyKey: string;
  correlationId: string;
  causationId: string | null;
  tenantId: string;
  actor: StateActor;
  requestedAt: string;
}

export interface OfficialOfferTransitionInput extends OfficialTransitionContext {
  entityId: string;
  fromState: OfferState;
  toState: OfferState;
  origin: string;
  reason: StateReason;
  evidenceRefs: readonly string[];
}

export interface OfficialPostTransitionInput extends OfficialTransitionContext {
  entityId: string;
  fromState: PostState;
  toState: PostState;
  origin: string;
  reason: StateReason;
  evidenceRefs: readonly string[];
}

const offerVersions: Record<OfferState, number> = {
  pending_manual_review: 0,
  selected: 1,
  approved: 2,
  posted: 3,
  rejected: 3
};

const postVersions: Record<PostState, number> = { draft: 0, published: 1 };

export function offerStateVersion(state: OfferState): number {
  return offerVersions[state];
}

export function postStateVersion(state: PostState): number {
  return postVersions[state];
}

export function transitionOfficialOfferState(
  input: OfficialOfferTransitionInput,
  dependencies: StateServiceDependencies
): Promise<StateTransitionResult> {
  const command: OfferTransitionCommand = {
    contractVersion: "pmav5.state-transition/v1",
    entityType: "offer",
    expectedVersion: offerStateVersion(input.fromState),
    ...input
  };
  return transitionOfferState(command, dependencies);
}

export function transitionOfficialPostState(
  input: OfficialPostTransitionInput,
  dependencies: StateServiceDependencies
): Promise<StateTransitionResult> {
  const command: PostTransitionCommand = {
    contractVersion: "pmav5.state-transition/v1",
    entityType: "post",
    expectedVersion: postStateVersion(input.fromState),
    ...input
  };
  return transitionPostState(command, dependencies);
}
