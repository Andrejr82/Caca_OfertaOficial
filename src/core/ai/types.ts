import type { StateActor, StateReason } from "@/core/state";

export const OFFICIAL_AI_CHANNELS = ["telegram", "instagram", "whatsapp"] as const;
export type OfficialAIChannel = (typeof OFFICIAL_AI_CHANNELS)[number];

/**
 * Comando enviado à Official AI.
 * O modo de operação (Draft Generation ou Approval) é determinado internamente pela IA
 * com base no estado oficial da oferta lido do State Service (ADR-014).
 * Nenhum parâmetro externo controla o modo.
 */
export interface OfficialAICommand {
  contractVersion: "pmav5.ai/v1";
  commandId: string;
  idempotencyKey: string;
  correlationId: string;
  causationId: string | null;
  offerId: string;
  tenantId: string;
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
  createdAt: string;
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

/**
 * Resultado do Modo 1 — Draft Generation (ADR-014).
 * A oferta permanece em pending_manual_review.
 * Nenhuma transição de estado ocorreu.
 */
export interface OfficialAIDraftedResult {
  status: "drafted";
  commandId: string;
  offerId: string;
  offerState: "pending_manual_review";
  content?: OfficialAIContent;
  drafts?: readonly OfficialDraftPost[];
  providerEvidence?: OfficialAIProviderEvidence;
  completedAt?: string;
  batchCompleted?: boolean;
}

/**
 * Resultado do Modo 2 — Approval (comportamento anterior, inalterado).
 * A oferta é promovida para approved.
 */
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
  offerState: "pending_manual_review" | "selected" | "unknown";
  failureStage: string;
  rejectedAt: string;
}

export type OfficialAIResult = OfficialAIApprovedResult | OfficialAIDraftedResult | OfficialAIRejectedResult;

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
  result: "approved" | "drafted" | "rejected" | "idempotent_replay";
  replay: boolean;
  failureStage: string | null;
  errorCode: string | null;
  postsPrepared: number;
  postsPersisted: number;
  transitionRequested: boolean;
  transitionCompleted: boolean;
  batchCompleted?: boolean;
}
