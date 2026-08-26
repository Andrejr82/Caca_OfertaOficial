import type { SupabaseClient } from "@supabase/supabase-js";
import type { AIProviderPort, AIProviderRegistryPort } from "@/core/ai";
import { emitOfficialAITelemetrySafely } from "@/core/ai/ports";
import { CerebrasOfficialAIProvider } from "@/core/ai/providers/cerebras-provider";
import { GroqOfficialAIProvider } from "@/core/ai/providers/groq-provider";
import { OfficialAIProviderRequestError } from "@/core/ai/providers/http-provider";
import { createSupabaseStateDependencies } from "@/lib/state/supabase-state-adapter";
import { SupabaseOfficialAIRegenerationAdapter, withSupabaseOfficialAIAdapters } from "./supabase-official-ai-adapter";
import { AIObservabilityAuditAdapter, createServerObservabilityDependencies } from "@/lib/observability";
import { promptTelemetry, StructuredOfficialAITelemetry } from "./official-ai-telemetry";

type ProviderName = "groq" | "cerebras";
type CredentialLabel = `${ProviderName}:${"primary" | "secondary"}`;
type AttemptSummary = {
  credential: CredentialLabel;
  provider: ProviderName;
  code: string;
  status?: number;
  timeout?: boolean;
  network?: boolean;
};

const RETRYABLE_STATUSES = new Set([401, 402, 403, 408, 429, 500, 502, 503, 504]);
const credentialCooldowns = new Map<string, number>();
const GROQ_MODEL = "openai/gpt-oss-120b";
const CEREBRAS_MODEL = "gpt-oss-120b";

function resolveModel(provider: ProviderName, configured: string | undefined) {
  const value = configured?.trim();
  if (provider === "groq" && (!value || value === "llama-3.3-70b-versatile")) return GROQ_MODEL;
  if (provider === "cerebras" && !value) return CEREBRAS_MODEL;
  return value ?? (provider === "groq" ? GROQ_MODEL : CEREBRAS_MODEL);
}

export class OfficialAIProvidersExhaustedError extends Error {
  readonly code = "OFFICIAL_AI_PROVIDERS_EXHAUSTED";

  constructor(readonly attempts: readonly AttemptSummary[]) {
    super(`OFFICIAL_AI_PROVIDERS_EXHAUSTED:${attempts.map(({ credential, code }) => `${credential}[${code}]`).join(",")}`);
    this.name = "OfficialAIProvidersExhaustedError";
  }
}

export interface OfficialAIProviderRegistryOptions {
  env?: Record<string, string | undefined>;
  fetcher?: typeof fetch;
  now?: () => number;
  cooldowns?: Map<string, number>;
  telemetry?: import("@/core/ai").OfficialAITelemetryPort;
}

export class OfficialAIProviderRegistry implements AIProviderRegistryPort {
  private readonly provider: AIProviderPort;

  constructor(options: OfficialAIProviderRegistryOptions = {}) {
    const env = options.env ?? process.env;
    const now = options.now ?? Date.now;
    // A chave é a fonte de verdade operacional. LLM_PROVIDER é opcional para
    // manter o mesmo comportamento do Oracle/health check quando a Vercel
    // possui apenas GROQ_API_KEY ou CEREBRAS_API_KEY configurada.
    const inferredProvider = env.GROQ_API_KEY?.trim()
      ? "groq"
      : env.CEREBRAS_API_KEY?.trim()
        ? "cerebras"
        : undefined;
    const primary = this.readProvider(env.LLM_PROVIDER ?? inferredProvider, "LLM_PROVIDER");
    const fallback = env.LLM_FALLBACK
      ? this.readProvider(env.LLM_FALLBACK, "LLM_FALLBACK")
      : undefined;
    if (fallback === primary) throw new Error("LLM_FALLBACK must differ from LLM_PROVIDER");

    const providers = [primary, fallback].filter((value): value is ProviderName => Boolean(value));
    const chain = providers.flatMap((name) => (["primary", "secondary"] as const).flatMap((slot) => {
      const suffix = slot === "primary" ? "" : "_2";
      const apiKey = env[`${name.toUpperCase()}_API_KEY${suffix}`]?.trim();
      if (!apiKey) return [];
      const provider = name === "cerebras"
        ? new CerebrasOfficialAIProvider({
            apiKey,
            model: resolveModel("cerebras", env.CEREBRAS_MODEL),
            baseUrl: `${(env.CEREBRAS_BASE_URL || "https://api.cerebras.ai/v1").replace(/\/$/, "")}/chat/completions`,
            fetcher: options.fetcher,
            now,
            telemetry: options.telemetry
          })
        : new GroqOfficialAIProvider({
            apiKey,
            model: resolveModel("groq", env.GROQ_MODEL),
            fetcher: options.fetcher,
            now,
            telemetry: options.telemetry
          });
      return [{ label: `${name}:${slot}` as CredentialLabel, provider }];
    }));
    if (chain.length === 0) throw new Error("Official AI requires at least one configured credential");

    const cooldowns = options.cooldowns ?? credentialCooldowns;
    const configuredCooldown = Number(env.OFFICIAL_AI_DEFAULT_COOLDOWN_MS);
    const defaultCooldownMs = Number.isFinite(configuredCooldown) && configuredCooldown >= 0
      ? configuredCooldown
      : 30_000;
    const first = chain[0].provider;
    this.provider = {
      name: first.name,
      model: first.model,
      generate: async (request) => {
        const attempts: AttemptSummary[] = [];
        let attempt = 0;
        for (const credential of chain) {
          if ((cooldowns.get(credential.label) ?? 0) > now()) continue;
          attempt += 1;
          cooldowns.delete(credential.label);
          const fallback = attempt > 1;
          await emitOfficialAITelemetrySafely(options.telemetry, {
            eventType: fallback ? "official_ai.provider.fallback.started" : "official_ai.provider.selected",
            correlationId: request.correlationId,
            offerId: typeof request.metadata.offerId === "string" ? request.metadata.offerId : undefined,
            marketplace: typeof request.metadata.marketplace === "string" ? request.metadata.marketplace : undefined,
            provider: credential.provider.name, model: credential.provider.model, attempt, fallback, stage: "provider_registry",
            details: { credential: credential.label, temperature: request.temperature, maxTokens: request.maxTokens, timeoutMs: request.timeoutMs, ...promptTelemetry(request.prompt) }
          });
          const attemptStartedAt = Date.now();
          try {
            const result = await credential.provider.generate({ ...request, metadata: { ...request.metadata, attempt, fallback } });
            await emitOfficialAITelemetrySafely(options.telemetry, {
              eventType: "official_ai.provider.attempt.completed", correlationId: request.correlationId,
              offerId: typeof request.metadata.offerId === "string" ? request.metadata.offerId : undefined,
              marketplace: typeof request.metadata.marketplace === "string" ? request.metadata.marketplace : undefined,
              provider: result.provider, model: result.model, attempt, fallback, stage: "provider_registry", durationMs: result.latencyMs,
              details: { credential: credential.label, finishReason: result.finishReason ?? null }
            });
            return result;
          } catch (error) {
            const source = error instanceof Error ? error : new Error(String(error));
            const providerError = error instanceof OfficialAIProviderRequestError ? error : null;
            await emitOfficialAITelemetrySafely(options.telemetry, {
              eventType: "official_ai.provider.attempt.failed", correlationId: request.correlationId,
              offerId: typeof request.metadata.offerId === "string" ? request.metadata.offerId : undefined,
              marketplace: typeof request.metadata.marketplace === "string" ? request.metadata.marketplace : undefined,
              provider: credential.provider.name, model: credential.provider.model, attempt, fallback, stage: "provider_registry",
              durationMs: Date.now() - attemptStartedAt,
              details: {
                credential: credential.label, exceptionType: source.name, exceptionMessageChars: source.message.length, exceptionStackChars: (source.stack ?? "").length,
                failureCode: providerError?.code ?? null, httpStatus: providerError?.status ?? null,
                timeout: providerError?.timeout ?? false, network: providerError?.network ?? false,
                retryAfterMs: providerError?.retryAfterMs ?? null, retryEligible: providerError
                  ? providerError.timeout || providerError.network || RETRYABLE_STATUSES.has(providerError.status ?? 0)
                  : false
              }
            });
            if (!(error instanceof OfficialAIProviderRequestError)) throw error;
            if (!error.timeout && !error.network && !RETRYABLE_STATUSES.has(error.status ?? 0)) throw error;
            attempts.push({
              credential: credential.label,
              provider: error.provider,
              code: error.code,
              status: error.status,
              timeout: error.timeout || undefined,
              network: error.network || undefined
            });
            if (error.status === 429) {
              cooldowns.set(credential.label, now() + (error.retryAfterMs ?? defaultCooldownMs));
            }
          }
        }
        throw new OfficialAIProvidersExhaustedError(attempts);
      }
    };
  }

  private readProvider(value: string | undefined, variable: "LLM_PROVIDER" | "LLM_FALLBACK"): ProviderName {
    if (value !== "cerebras" && value !== "groq") throw new Error(`Invalid ${variable}: expected cerebras or groq`);
    return value;
  }

  resolve(_preference?: ProviderName) {
    return this.provider;
  }
}

export function createOfficialAIServiceDependencies(client: SupabaseClient, tenantId: string) {
  const telemetry = new StructuredOfficialAITelemetry();
  const dependencies = withSupabaseOfficialAIAdapters(
    client,
    tenantId,
    createSupabaseStateDependencies(client, tenantId),
    {
      providers: new OfficialAIProviderRegistry({ telemetry }),
      clock: { now: () => new Date().toISOString() },
      telemetry
    }
  );
  return {
    ...dependencies,
    telemetry,
    audit: new AIObservabilityAuditAdapter(
      dependencies.audit,
      createServerObservabilityDependencies()
    )
  };
}

export function createOfficialAIRegenerationDependencies(client: SupabaseClient, tenantId: string) {
  const telemetry = new StructuredOfficialAITelemetry();
  return {
    drafts: new SupabaseOfficialAIRegenerationAdapter(client, tenantId),
    providers: new OfficialAIProviderRegistry({ telemetry })
  };
}
