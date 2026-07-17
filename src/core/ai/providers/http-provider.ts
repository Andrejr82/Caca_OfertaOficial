import { createHash } from "node:crypto";
import type { AIProviderRequest, AIProviderResponse } from "../ports";
import { ProviderDiagnosticError, type OfficialAIContent, type ProviderDiagnostic, type ProviderErrorCategory } from "../types";

export interface HTTPProviderConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetcher?: typeof fetch;
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

function responseMetadata(body: string): Pick<ProviderDiagnostic, "responseSize" | "responseHash"> {
  return {
    responseSize: new TextEncoder().encode(body).byteLength,
    responseHash: createHash("sha256").update(body).digest("hex")
  };
}

async function capturedResponseMetadata(response: Response): Promise<Pick<ProviderDiagnostic, "responseSize" | "responseHash"> | undefined> {
  try {
    return responseMetadata(await response.clone().text());
  } catch {
    return undefined;
  }
}

function providerError(
  message: string,
  errorCategory: ProviderErrorCategory,
  provider: "groq" | "cerebras",
  config: HTTPProviderConfig,
  startedAt: number,
  extra: Partial<Pick<ProviderDiagnostic, "httpStatus" | "responseSize" | "responseHash">> = {}
): ProviderDiagnosticError {
  return new ProviderDiagnosticError(message, {
    errorCategory, provider, model: config.model, durationMs: Date.now() - startedAt, attempt: 1, ...extra
  });
}

function timeoutError(error: unknown): boolean {
  return error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError");
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
    throw providerError(
      `${provider.toUpperCase()}_PROVIDER_ERROR:${timeoutError(error) ? "TIMEOUT" : "NETWORK_ERROR"}`,
      timeoutError(error) ? "TIMEOUT" : "NETWORK_ERROR", provider, config, startedAt
    );
  }
  const latencyMs = Date.now() - startedAt;
  const metadata = capturedResponseMetadata(response);
  if (!response.ok) {
    throw providerError(
      `${provider.toUpperCase()}_PROVIDER_ERROR:${response.status}`, "HTTP_ERROR", provider, config, startedAt,
      { httpStatus: response.status, ...await metadata }
    );
  }
  let payload: ProviderPayload;
  try {
    payload = await response.json() as ProviderPayload;
  } catch {
    throw providerError(
      `${provider.toUpperCase()}_PROVIDER_ERROR:RESPONSE_PARSE_ERROR`, "RESPONSE_PARSE_ERROR", provider, config, startedAt,
      await metadata
    );
  }
  const choice = payload.choices?.[0];
  if (!choice?.message?.content) {
    throw providerError(
      `${provider.toUpperCase()}_PROVIDER_ERROR:EMPTY_RESPONSE`, "EMPTY_RESPONSE", provider, config, startedAt,
      await metadata
    );
  }
  let content: OfficialAIContent;
  try {
    content = JSON.parse(choice.message.content) as OfficialAIContent;
  } catch {
    throw providerError(
      `${provider.toUpperCase()}_PROVIDER_ERROR:INVALID_JSON`, "INVALID_JSON", provider, config, startedAt,
      responseMetadata(choice.message.content)
    );
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
