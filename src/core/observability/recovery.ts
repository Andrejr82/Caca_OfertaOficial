import type { RecoveryQueuePort } from "./ports";

export type RecoveryTechnicalStatus = "OPEN" | "REPLAYING" | "RESOLVED" | "MANUAL_ACTION_REQUIRED";
export interface RecoveryItem {
  recoveryId: string; tenantId: string; commandId: string | null; idempotencyKey: string;
  correlationId: string; causationId: string | null; service: string; failureStage: string;
  entityType: string; entityId: string; offerId: string | null; postId: string | null;
  channel: string | null; provider: string | null; errorCode: string; errorMessage: string;
  attempts: number; firstFailedAt: string; lastFailedAt: string; nextAction: string;
  replayAllowed: boolean; status: RecoveryTechnicalStatus; resolvedAt: string | null;
  resolutionReason: string | null;
}
export interface RecoverySnapshot {
  now: string;
  thresholdsMs: { pending: number; selected: number; approved: number; draft: number; heartbeat: number; scheduler: number };
  offers: readonly { id: string; tenantId: string; state: string; updatedAt: string; hasDraftPosts: boolean }[];
  posts: readonly { id: string; offerId: string; tenantId: string; state: string; updatedAt: string; finalReceipt: boolean }[];
  reservations: readonly { id: string; tenantId: string; expiresAt: string }[];
  heartbeats: readonly { component: string; lastSeenAt: string }[];
}

function age(now: string, then: string): number { return Date.parse(now) - Date.parse(then) }
function item(now: string, tenantId: string, entityType: string, entityId: string, stage: string, action: string, replayAllowed = true): RecoveryItem {
  return {
    recoveryId: `${stage}:${tenantId}:${entityId}`, tenantId, commandId: null,
    idempotencyKey: `recovery:${stage}:${tenantId}:${entityId}`, correlationId: `recovery:${tenantId}:${entityId}`,
    causationId: null, service: stage.includes("heartbeat") ? "system" : stage.startsWith("receipt") ? "publication" : "recovery",
    failureStage: stage, entityType, entityId, offerId: entityType === "offer" ? entityId : null,
    postId: entityType === "post" ? entityId : null, channel: null, provider: null,
    errorCode: stage.toUpperCase(), errorMessage: stage.replaceAll("_", " "), attempts: 0,
    firstFailedAt: now, lastFailedAt: now, nextAction: action, replayAllowed, status: "OPEN",
    resolvedAt: null, resolutionReason: null
  };
}

export function detectRecoveryItems(snapshot: RecoverySnapshot): readonly RecoveryItem[] {
  const found: RecoveryItem[] = [];
  for (const offer of snapshot.offers) {
    if (offer.state === "pending_manual_review" && age(snapshot.now, offer.updatedAt) > snapshot.thresholdsMs.pending)
      found.push(item(snapshot.now, offer.tenantId, "offer", offer.id, "pending_manual_review_stuck", "MANUAL_REVIEW", false));
    if (offer.state === "selected" && age(snapshot.now, offer.updatedAt) > snapshot.thresholdsMs.selected)
      found.push(item(snapshot.now, offer.tenantId, "offer", offer.id, "selected_stuck", "REPLAY_AI"));
    if (offer.state === "approved" && !offer.hasDraftPosts && age(snapshot.now, offer.updatedAt) > snapshot.thresholdsMs.approved)
      found.push(item(snapshot.now, offer.tenantId, "offer", offer.id, "approved_without_drafts", "REPLAY_AI"));
  }
  for (const post of snapshot.posts) {
    if (post.state === "draft" && age(snapshot.now, post.updatedAt) > snapshot.thresholdsMs.draft)
      found.push(item(snapshot.now, post.tenantId, "post", post.id, "draft_stuck", "REPLAY_PUBLICATION"));
    if (post.finalReceipt && post.state !== "published")
      found.push(item(snapshot.now, post.tenantId, "post", post.id, "receipt_state_divergence", "RECONCILE_PUBLICATION", false));
  }
  for (const reservation of snapshot.reservations) {
    if (Date.parse(reservation.expiresAt) < Date.parse(snapshot.now))
      found.push(item(snapshot.now, reservation.tenantId, "reservation", reservation.id, "reservation_expired", "MANUAL_REVIEW", false));
  }
  for (const heartbeat of snapshot.heartbeats) {
    if (age(snapshot.now, heartbeat.lastSeenAt) > snapshot.thresholdsMs.heartbeat)
      found.push(item(snapshot.now, "system", "worker", heartbeat.component, "worker_heartbeat_missing", "CHECK_WORKER", false));
  }
  return found;
}

export class InMemoryRecoveryQueueAdapter implements RecoveryQueuePort {
  private readonly items = new Map<string, RecoveryItem>();
  async enqueue(value: RecoveryItem): Promise<RecoveryItem> {
    const existing = this.items.get(value.idempotencyKey);
    if (existing) return existing;
    this.items.set(value.idempotencyKey, Object.freeze({ ...value }));
    return value;
  }
  async list(tenantId: string): Promise<readonly RecoveryItem[]> {
    return [...this.items.values()].filter((value) => value.tenantId === tenantId);
  }
}

