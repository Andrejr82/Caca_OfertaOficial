import type { AIProviderRequest, AIProviderResponse } from "../ports";
import type { OfficialAIContent } from "../types";

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

export async function generateOpenAICompatible(
  provider: "groq" | "cerebras",
  defaultUrl: string,
  config: HTTPProviderConfig,
  request: AIProviderRequest
): Promise<AIProviderResponse> {
  const fetcher = config.fetcher ?? fetch;
  const startedAt = Date.now();
  const response = await fetcher(config.baseUrl ?? defaultUrl, {
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
  const latencyMs = Date.now() - startedAt;
  if (!response.ok) {
    throw new Error(`${provider.toUpperCase()}_PROVIDER_ERROR:${response.status}`);
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
