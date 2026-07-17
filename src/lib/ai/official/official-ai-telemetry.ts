import { createHash } from "node:crypto";
import type { OfficialAICycleTelemetrySummary, OfficialAITelemetryEvent, OfficialAITelemetryPort } from "@/core/ai";

const SENSITIVE_KEY = /^(?:authorization|bearer|api[_-]?key|token|cookie|secret|clientsecret|refresh_token|accesstoken|jwt|session|prompt|payload|response|content|received|snippet|body|message|text)$/iu;
const SENSITIVE_TEXT = /(?:authorization|bearer|api[_-]?key|token|cookie|secret|client\s*secret|refresh\s*token|access\s*token|jwt|session)/iu;
const PERSONAL_DATA = /(?:\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b|\b\d{3}[.\s-]?\d{3}[.\s-]?\d{3}[.\s-]?\d{2}\b|(?:\+?\d{1,3}\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4})/iu;

function sanitizeText(value: string): string {
  return SENSITIVE_TEXT.test(value) || PERSONAL_DATA.test(value) ? "[REDACTED]" : value;
}

function sanitize(value: unknown, key?: string): unknown {
  if (key && SENSITIVE_KEY.test(key)) return "[REDACTED]";
  if (typeof value === "string") return sanitizeText(value);
  if (Array.isArray(value)) return value.map((item) => sanitize(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([entryKey, item]) => [
      SENSITIVE_KEY.test(entryKey) ? "[REDACTED]" : entryKey,
      sanitize(item, entryKey)
    ]));
  }
  return value;
}

export function promptTelemetry(prompt: { system: string; user: string }) {
  const source = `${prompt.system}\n${prompt.user}`;
  return {
    promptHash: createHash("sha256").update(source).digest("hex"),
    promptChars: source.length,
    estimatedPromptTokens: Math.ceil(source.length / 4)
  };
}

export function exceptionTelemetry(error: unknown) {
  const source = error instanceof Error ? error : new Error(String(error));
  return {
    exceptionType: source.name,
    exceptionMessageChars: source.message.length,
    exceptionStackChars: (source.stack ?? "").length
  };
}

export class StructuredOfficialAITelemetry implements OfficialAITelemetryPort {
  private readonly summaries = new Map<string, OfficialAICycleTelemetrySummary>();

  emit(event: OfficialAITelemetryEvent): void {
    this.record(event);
    console.log(JSON.stringify(sanitize({
      eventType: event.eventType,
      timestamp: new Date().toISOString(),
      correlationId: event.correlationId,
      offerId: event.offerId ?? null,
      marketplace: event.marketplace ?? null,
      provider: event.provider ?? null,
      model: event.model ?? null,
      attempt: event.attempt ?? null,
      fallback: event.fallback ?? false,
      stage: event.stage,
      durationMs: event.durationMs ?? null,
      details: event.details ?? {}
    })));
  }

  snapshot(correlationId: string): OfficialAICycleTelemetrySummary {
    const summary = this.summaries.get(correlationId) ?? emptySummary();
    return {
      providerModels: { ...summary.providerModels }, fallbacks: summary.fallbacks,
      invalidProviderOutputByRule: { ...summary.invalidProviderOutputByRule },
      providerFailureByCause: { ...summary.providerFailureByCause }
    };
  }

  private record(event: OfficialAITelemetryEvent) {
    const summary = this.summaries.get(event.correlationId) ?? emptySummary();
    if (event.eventType === "official_ai.provider.attempt.completed" && event.provider && event.model) {
      increment(summary.providerModels, `${event.provider}:${event.model}`);
    }
    if (event.eventType === "official_ai.provider.fallback.started") summary.fallbacks += 1;
    if (event.eventType === "official_ai.validation.channel.rejected") {
      const rule = typeof event.details?.rule === "string" ? event.details.rule : "UNKNOWN_RULE";
      increment(summary.invalidProviderOutputByRule, rule);
    }
    if (event.eventType === "official_ai.provider.attempt.failed") {
      const cause = typeof event.details?.failureCode === "string"
        ? event.details.failureCode
        : typeof event.details?.exceptionType === "string" ? event.details.exceptionType : "UNKNOWN_CAUSE";
      increment(summary.providerFailureByCause, cause);
    }
    this.summaries.set(event.correlationId, summary);
  }
}

function emptySummary(): OfficialAICycleTelemetrySummary {
  return { providerModels: {}, fallbacks: 0, invalidProviderOutputByRule: {}, providerFailureByCause: {} };
}

function increment(target: Record<string, number>, key: string) {
  target[key] = (target[key] ?? 0) + 1;
}
