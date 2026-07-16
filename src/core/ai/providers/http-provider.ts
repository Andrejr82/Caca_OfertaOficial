import type { AIProviderRequest, AIProviderResponse } from "../ports";
import type { OfficialAIContent } from "../types";

export interface HTTPProviderConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetcher?: typeof fetch;
  now?: () => number;
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
        max_tokens: request.maxTokens,
        response_format: { type: "json_object" }
      }),
      signal: AbortSignal.timeout(request.timeoutMs)
    });
  } catch (error) {
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
  if (!response.ok) {
    throw new OfficialAIProviderRequestError(
      provider,
      `HTTP_${response.status}`,
      response.status,
      parseRetryAfterMs(response.headers.get("Retry-After"), config.now?.() ?? Date.now())
    );
  }
  const payload = await response.json() as ProviderPayload;
  const choice = payload.choices?.[0];
  if (!choice?.message?.content) throw new Error(`${provider.toUpperCase()}_PROVIDER_ERROR:EMPTY_RESPONSE`);
  let content: OfficialAIContent;
  try {
    content = JSON.parse(choice.message.content) as OfficialAIContent;
  } catch {
    throw new Error(`${provider.toUpperCase()}_PROVIDER_ERROR:INVALID_JSON`);
  }
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
