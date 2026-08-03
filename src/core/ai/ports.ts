import type {
  OfficialAIAuditRecord,
  OfficialAIChannel,
  OfficialAICommand,
  OfficialAIContent,
  OfficialAIDraftForRegeneration,
  OfficialAIOffer,
  OfficialAIRegenerationFilters,
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

export interface OfficialAITelemetryEvent {
  eventType: string;
  correlationId: string;
  offerId?: string;
  marketplace?: string;
  provider?: string | null;
  model?: string | null;
  attempt?: number;
  fallback?: boolean;
  stage: string;
  durationMs?: number;
  details?: Record<string, unknown>;
}

export interface OfficialAICycleTelemetrySummary {
  providerModels: Record<string, number>;
  fallbacks: number;
  invalidProviderOutputByRule: Record<string, number>;
  providerFailureByCause: Record<string, number>;
}

export interface OfficialAITelemetryPort {
  emit(event: OfficialAITelemetryEvent): void | Promise<void>;
  snapshot?(correlationId: string): OfficialAICycleTelemetrySummary;
}

export async function emitOfficialAITelemetrySafely(
  telemetry: OfficialAITelemetryPort | undefined,
  event: OfficialAITelemetryEvent
): Promise<void> {
  try {
    await telemetry?.emit(event);
  } catch {
    // Telemetry failure is intentionally invisible to business processing.
  }
}

export interface AIProviderResponse {
  content: unknown;
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
  updateShortName(offerId: string, tenantId: string, shortName: string): Promise<void>;
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
  | { status: "pending"; result: Promise<OfficialAIResult> }
  | { status: "stale_pending"; pendingSince: string };

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

export interface OfficialAIRegenerationPort {
  findDrafts(tenantId: string, filters: OfficialAIRegenerationFilters): Promise<readonly OfficialAIDraftForRegeneration[]>;
  updateContent(input: {
    tenantId: string;
    postId: string;
    expectedContent: string;
    content: string;
  }): Promise<boolean>;
}

export interface OfficialAIRegenerationDependencies {
  drafts: OfficialAIRegenerationPort;
  providers: AIProviderRegistryPort;
}

export interface OfficialAIServiceDependencies {
  offers: OfficialAIOfferPort;
  providers: AIProviderRegistryPort;
  content: OfficialAIContentPort;
  approval: OfficialAIApprovalPort;
  idempotency: OfficialAIIdempotencyPort;
  audit: OfficialAIAuditPort;
  clock: OfficialAIClockPort;
  telemetry?: OfficialAITelemetryPort;
}
