import type { StateActor, StateReason } from "@/core/state";

export const OFFICIAL_AI_CHANNELS = ["telegram", "instagram", "whatsapp"] as const;
export type OfficialAIChannel = (typeof OFFICIAL_AI_CHANNELS)[number];

export interface OfficialAICommand {
  contractVersion: "pmav5.ai/v1";
  commandId: string;
  idempotencyKey: string;
  correlationId: string;
  causationId: string | null;
  offerId: string;
  tenantId: string;
  expectedState: "selected";
  expectedVersion: 1;
  providerPreference?: "groq" | "cerebras";
  channels: readonly OfficialAIChannel[];
  requestedAt: string;
  actor: StateActor;
  origin: string;
  reason: StateReason;
  metadata?: Readonly<Record<string, string | number | boolean>>;
}

export interface OfficialAIOffer {
  id: string;
  tenantId: string;
  state: string;
  version: number;
  marketplace: string;
  productName: string;
  originalUrl: string;
  imageUrl: string;
  currentPrice: number;
  originalPrice: number | null;
  category: string | null;
  explainability: Record<string, unknown>;
}

export interface OfficialAIContent {
  title: string;
  description: string;
  shortCopy: string;
  longCopy: string;
  hashtags: string[];
  callToAction: string;
  highlights: string[];
  explanation: string;
  channelCopies: Partial<Record<OfficialAIChannel, string>>;
}

export interface OfficialDraftPost {
  postId: string;
  affiliateLinkId: string;
  channel: OfficialAIChannel;
  state: "draft";
}

export interface OfficialAIProviderEvidence {
  provider: string;
  model: string;
  latencyMs: number;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason?: string;
}

export interface OfficialAIApprovedResult {
  status: "approved";
  commandId: string;
  offerId: string;
  offerState?: "approved";
  content?: OfficialAIContent;
  drafts?: readonly OfficialDraftPost[];
  providerEvidence?: OfficialAIProviderEvidence;
  stateAuditId?: string;
  completedAt?: string;
}

export interface OfficialAIRejectedResult {
  status: "rejected";
  code: string;
  message: string;
  commandId: string;
  offerId: string;
  offerState: "selected" | "unknown";
  failureStage: string;
  rejectedAt: string;
}

export type OfficialAIResult = OfficialAIApprovedResult | OfficialAIRejectedResult;

export interface OfficialAIAuditRecord {
  timestamp: string;
  commandId: string;
  idempotencyKey: string;
  correlationId: string;
  causationId: string | null;
  offerId: string;
  tenantId: string;
  actor: StateActor;
  origin: string;
  reason: StateReason;
  provider: string | null;
  model: string | null;
  latencyMs: number | null;
  result: "approved" | "rejected" | "idempotent_replay";
  replay: boolean;
  failureStage: string | null;
  errorCode: string | null;
  postsPrepared: number;
  postsPersisted: number;
  transitionRequested: boolean;
  transitionCompleted: boolean;
}
