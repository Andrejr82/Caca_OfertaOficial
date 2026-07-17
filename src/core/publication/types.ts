import type { StateActor, StateReason } from "@/core/state";

export const OFFICIAL_PUBLICATION_CHANNELS = ["telegram", "whatsapp", "instagram", "facebook"] as const;
export type OfficialPublicationChannel = (typeof OFFICIAL_PUBLICATION_CHANNELS)[number];

export interface OfficialPublicationCommand {
  contractVersion: "pmav5.publication/v1";
  commandId: string;
  idempotencyKey: string;
  correlationId: string;
  causationId: string | null;
  offerId: string;
  postId: string;
  tenantId: string;
  channel: OfficialPublicationChannel;
  expectedOfferState: "approved";
  expectedOfferVersion: 2;
  expectedPostState: "draft";
  expectedPostVersion: 0;
  payloadReference: string;
  requestedAt: string;
  actor: StateActor;
  origin: string;
  reason: StateReason;
  metadata?: Readonly<Record<string, string | number | boolean>>;
}

export interface OfficialPublicationOffer {
  id: string;
  tenantId: string;
  state: string;
  version: number;
}

export interface OfficialPublicationPost {
  id: string;
  tenantId: string;
  offerId: string;
  channel: string;
  state: string;
  version: number;
  content: string;
  mediaUrl: string | null;
  destination: string;
  metadata?: Readonly<Record<string, string | number | boolean>>;
}

export interface OfficialPublicationReceipt {
  receiptVersion: "pmav5.receipt/v1";
  receiptId: string;
  commandId: string;
  idempotencyKey: string;
  correlationId: string;
  causationId: string | null;
  tenantId: string;
  offerId: string;
  postId: string;
  channel: OfficialPublicationChannel;
  provider: string;
  externalId: string | null;
  sentAt: string;
  observedAt: string;
  accepted: boolean;
  deliveryStatus: "confirmed" | "queued" | "failed" | "unknown";
  outcome: "confirmed" | "failed" | "unknown";
  evidenceHash: string;
  metadata: Readonly<Record<string, string | number | boolean>>;
}

export interface OfficialPublicationPublishedResult {
  status: "published";
  commandId: string;
  offerId: string;
  postId: string;
  channel: OfficialPublicationChannel;
  externalId: string;
  receiptId: string;
  postState: "published";
  offerState: "approved" | "posted";
  postAuditId: string;
  offerAuditId: string | null;
  completedAt: string;
  replay: boolean;
}

export interface OfficialPublicationRejectedResult {
  status: "rejected";
  code: string;
  message: string;
  commandId: string;
  offerId: string;
  postId: string;
  channel: OfficialPublicationChannel;
  failureStage: string;
  rejectedAt: string;
  replay: boolean;
}

export type OfficialPublicationResult = OfficialPublicationPublishedResult | OfficialPublicationRejectedResult;

export interface PublicationAuditRecord {
  timestamp: string;
  commandId: string;
  idempotencyKey: string;
  correlationId: string;
  causationId: string | null;
  tenantId: string;
  offerId: string;
  postId: string;
  channel: OfficialPublicationChannel;
  actor: StateActor;
  origin: string;
  reason: StateReason;
  transport: string | null;
  durationMs: number;
  reservation: "started" | "resume" | "replay" | "pending" | "conflict" | "not_started";
  transportResult: "not_called" | "confirmed" | "failed" | "invalid" | "reused_receipt";
  receiptId: string | null;
  receiptRecorded: boolean;
  postTransition: "not_requested" | "applied" | "replay" | "rejected";
  offerCondition: "not_evaluated" | "first_confirmed_receipt" | "pending_posts";
  offerTransition: "not_requested" | "applied" | "replay" | "rejected";
  result: "published" | "rejected" | "idempotent_replay" | "reconciliation_required";
  replay: boolean;
  failureStage: string | null;
  errorCode: string | null;
}
