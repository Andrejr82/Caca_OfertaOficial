import { emitOfficialAITelemetrySafely, type AIProviderRequest, type AIProviderResponse, type OfficialAITelemetryPort } from "../ports";
import type { OfficialAIContent } from "../types";

export interface HTTPProviderConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetcher?: typeof fetch;
  now?: () => number;
  telemetry?: OfficialAITelemetryPort;
}

async function telemetry(config: HTTPProviderConfig, event: Parameters<OfficialAITelemetryPort["emit"]>[0]) {
  await emitOfficialAITelemetrySafely(config.telemetry, event);
}

function exceptionDetails(error: unknown) {
  const value = error instanceof Error ? error : new Error(String(error));
  return { exceptionType: value.name, exceptionMessageChars: value.message.length, exceptionStackChars: (value.stack ?? "").length };
}

interface ProviderPayload {
  choices?: Array<{
    message?: { content?: string };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export class OfficialAIProviderRequestError extends Error {
  constructor(
    readonly provider: "groq" | "cerebras",
    readonly code: string,
    readonly status?: number,
    readonly retryAfterMs?: number,
    readonly timeout = false,
    readonly network = false
  ) {
    super(`${provider.toUpperCase()}_PROVIDER_ERROR:${status ?? code}`);
    this.name = "OfficialAIProviderRequestError";
  }
}

export function parseRetryAfterMs(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000);
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - now);
}

export async function generateOpenAICompatible(
  provider: "groq" | "cerebras",
  defaultUrl: string,
  config: HTTPProviderConfig,
  request: AIProviderRequest
): Promise<AIProviderResponse> {
  const fetcher = config.fetcher ?? fetch;
  const startedAt = Date.now();
  const attempt = Number(request.metadata.attempt ?? 1);
  const fallback = request.metadata.fallback === true;
  const common = {
    correlationId: request.correlationId,
    offerId: typeof request.metadata.offerId === "string" ? request.metadata.offerId : undefined,
    marketplace: typeof request.metadata.marketplace === "string" ? request.metadata.marketplace : undefined,
    provider, model: config.model, attempt, fallback
  };
  await telemetry(config, {
    eventType: "official_ai.provider.request.started", ...common, stage: "provider_request",
    details: { temperature: request.temperature, maxTokens: request.maxTokens, timeoutMs: request.timeoutMs }
  });
  let response: Response;
  try {
    response = await fetcher(config.baseUrl ?? defaultUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        "X-Correlation-Id": request.correlationId
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: request.prompt.system },
          { role: "user", content: request.prompt.user }
        ],
        temperature: request.temperature,
        max_completion_tokens: request.maxTokens,
        response_format: { type: "json_object" }
      }),
      signal: AbortSignal.timeout(request.timeoutMs)
    });
  } catch (error) {
    await telemetry(config, {
      eventType: "official_ai.provider.request.exception", ...common, stage: "provider_request",
      durationMs: Date.now() - startedAt, details: exceptionDetails(error)
    });
    const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
    if (name === "AbortError" || name === "TimeoutError") {
      throw new OfficialAIProviderRequestError(provider, "TIMEOUT", undefined, undefined, true);
    }
    if (error instanceof TypeError) {
      throw new OfficialAIProviderRequestError(provider, "NETWORK_ERROR", undefined, undefined, false, true);
    }
    throw error;
  }
  const latencyMs = Date.now() - startedAt;
  await telemetry(config, {
    eventType: "official_ai.provider.response.received", ...common, stage: "provider_response",
    durationMs: latencyMs,
    details: { httpStatus: response.status, responseChars: Number(response.headers.get("content-length") ?? 0) || null }
  });
  if (!response.ok) {
    throw new OfficialAIProviderRequestError(
      provider,
      `HTTP_${response.status}`,
      response.status,
      parseRetryAfterMs(response.headers.get("Retry-After"), config.now?.() ?? Date.now())
    );
  }
  const parserStartedAt = Date.now();
  await telemetry(config, { eventType: "official_ai.provider.parser.started", ...common, stage: "provider_parser" });
  let payload: ProviderPayload;
  try {
    payload = await response.json() as ProviderPayload;
  } catch (error) {
    await telemetry(config, {
      eventType: "official_ai.provider.parser.failed", ...common, stage: "provider_parser",
      durationMs: Date.now() - parserStartedAt, details: exceptionDetails(error)
    });
    throw error;
  }
  const choice = payload.choices?.[0];
  if (!choice?.message?.content) throw new Error(`${provider.toUpperCase()}_PROVIDER_ERROR:EMPTY_RESPONSE`);
  let content: OfficialAIContent;
  try {
    content = JSON.parse(choice.message.content) as OfficialAIContent;
  } catch (error) {
    const position = error instanceof SyntaxError ? error.message.match(/position\s+(\d+)/iu)?.[1] ?? null : null;
    await telemetry(config, {
      eventType: "official_ai.provider.parser.failed", ...common, stage: "provider_parser",
      durationMs: Date.now() - parserStartedAt,
      details: { ...exceptionDetails(error), jsonPosition: position, responseChars: choice.message.content.length }
    });
    throw new Error(`${provider.toUpperCase()}_PROVIDER_ERROR:INVALID_JSON`);
  }
  await telemetry(config, {
    eventType: "official_ai.provider.parser.completed", ...common, stage: "provider_parser",
    durationMs: Date.now() - parserStartedAt, details: { responseContentChars: choice.message.content.length }
  });
  const usage = payload.usage
    ? {
        promptTokens: Number(payload.usage.prompt_tokens ?? 0),
        completionTokens: Number(payload.usage.completion_tokens ?? 0),
        totalTokens: Number(payload.usage.total_tokens ?? 0)
      }
    : undefined;
  return {
    content,
    provider,
    model: config.model,
    latencyMs,
    usage,
    finishReason: choice.finish_reason
  };
}
