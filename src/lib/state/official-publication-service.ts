import type { StateServiceDependencies, StateTransitionResult } from "@/core/state";
import {
  transitionOfficialOfferState,
  transitionOfficialPostState
} from "./official-state-service";

export interface OfficialPublicationInput {
  tenantId: string;
  actorId: string;
  offerId: string;
  postId: string;
  origin: string;
  requestedAt: string;
  idempotencyKey: string;
  receiptRef: string;
}

export interface OfficialPublicationResult {
  post: StateTransitionResult;
  offer: StateTransitionResult;
}

export async function completeOfficialPublication(
  input: OfficialPublicationInput,
  dependencies: StateServiceDependencies
): Promise<OfficialPublicationResult> {
  const [offer, post] = await Promise.all([
    dependencies.repository.findById("offer", input.offerId, input.tenantId),
    dependencies.repository.findById("post", input.postId, input.tenantId)
  ]);
  if (!offer || (offer.state !== "approved" && offer.state !== "posted")) {
    throw new Error("Official publication requires an approved offer");
  }
  if (!post || (post.state !== "draft" && post.state !== "published")) {
    throw new Error("Official publication requires a draft post");
  }

  const actor = { type: "service" as const, id: input.actorId, service: "nextjs-publication" };
  const postResult = await transitionOfficialPostState({
    commandId: `${input.idempotencyKey}:post`,
    idempotencyKey: `${input.idempotencyKey}:post`,
    correlationId: input.idempotencyKey,
    causationId: null,
    tenantId: input.tenantId,
    actor,
    requestedAt: input.requestedAt,
    entityId: input.postId,
    fromState: "draft",
    toState: "published",
    origin: input.origin,
    reason: { code: "CHANNEL_RECEIPT_CONFIRMED" },
    evidenceRefs: [input.receiptRef, `offer:${input.offerId}`]
  }, dependencies);
  if (postResult.status === "rejected") throw new Error(postResult.message);

  const offerResult = await transitionOfficialOfferState({
    commandId: `${input.idempotencyKey}:offer`,
    idempotencyKey: `${input.idempotencyKey}:offer`,
    correlationId: input.idempotencyKey,
    causationId: `${input.idempotencyKey}:post`,
    tenantId: input.tenantId,
    actor,
    requestedAt: input.requestedAt,
    entityId: input.offerId,
    fromState: "approved",
    toState: "posted",
    origin: input.origin,
    reason: { code: "POST_PUBLISHED" },
    evidenceRefs: [input.receiptRef, `post:${input.postId}`]
  }, dependencies);
  if (offerResult.status === "rejected") throw new Error(offerResult.message);

  return { post: postResult, offer: offerResult };
}
