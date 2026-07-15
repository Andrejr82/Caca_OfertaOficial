import type {
  OfficialAIAuditRecord,
  OfficialAIChannel,
  OfficialAICommand,
  OfficialAIContent,
  OfficialAIOffer,
  OfficialAIResult,
  OfficialDraftPost
} from "./types";

/** Cursor composto para paginação determinística de lotes (created_at ASC, id ASC). */
export interface BatchCursor {
  afterCreatedAt: string;
  afterId: string;
}

export interface AIProviderRequest {
  prompt: { system: string; user: string };
  correlationId: string;
  timeoutMs: number;
  temperature: number;
  maxTokens: number;
  metadata: Readonly<Record<string, string | number | boolean>>;
}

export interface AIProviderResponse {
  content: OfficialAIContent;
  provider: string;
  model: string;
  latencyMs: number;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  finishReason?: string;
}

export interface AIProviderPort {
  readonly name: "groq" | "cerebras";
  readonly model: string;
  generate(request: AIProviderRequest): Promise<AIProviderResponse>;
}

export interface AIProviderRegistryPort {
  resolve(preference?: "groq" | "cerebras"): AIProviderPort;
}

export interface OfficialAIOfferPort {
  findById(offerId: string, tenantId: string): Promise<OfficialAIOffer | null>;
  findPendingWithoutDrafts?(tenantId: string, cursor?: BatchCursor): Promise<readonly OfficialAIOffer[]>;
}

export interface OfficialAIContentPort {
  persistDrafts(input: {
    command: OfficialAICommand;
    offer: OfficialAIOffer;
    content: OfficialAIContent;
    channels: readonly OfficialAIChannel[];
  }): Promise<readonly OfficialDraftPost[]>;
}

export type OfficialAIApprovalResult =
  | { status: "applied"; auditId: string; newState: "approved" }
  | { status: "rejected"; code: string; message: string };

export interface OfficialAIApprovalPort {
  approveSelected(input: {
    command: OfficialAICommand;
    offer: OfficialAIOffer;
    drafts: readonly OfficialDraftPost[];
  }): Promise<OfficialAIApprovalResult>;
}

export type OfficialAIIdempotencyBegin =
  | { status: "started" }
  | { status: "conflict" }
  | { status: "replay"; result: OfficialAIResult }
  | { status: "pending"; result: Promise<OfficialAIResult> };

export interface OfficialAIIdempotencyPort {
  begin(idempotencyKey: string, fingerprint: string): Promise<OfficialAIIdempotencyBegin>;
  complete(idempotencyKey: string, fingerprint: string, result: OfficialAIResult): Promise<void>;
}

export interface OfficialAIAuditPort {
  register(record: OfficialAIAuditRecord): Promise<void>;
}

export interface OfficialAIClockPort {
  now(): string;
}

export interface OfficialAIServiceDependencies {
  offers: OfficialAIOfferPort;
  providers: AIProviderRegistryPort;
  content: OfficialAIContentPort;
  approval: OfficialAIApprovalPort;
  idempotency: OfficialAIIdempotencyPort;
  audit: OfficialAIAuditPort;
  clock: OfficialAIClockPort;
}
