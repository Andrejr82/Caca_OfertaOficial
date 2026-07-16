import type { SupabaseClient } from "@supabase/supabase-js";
import type { AIProviderPort, AIProviderRegistryPort } from "@/core/ai";
import { CerebrasOfficialAIProvider } from "@/core/ai/providers/cerebras-provider";
import { GroqOfficialAIProvider } from "@/core/ai/providers/groq-provider";
import { OfficialAIProviderRequestError } from "@/core/ai/providers/http-provider";
import { createSupabaseStateDependencies } from "@/lib/state/supabase-state-adapter";
import { SupabaseOfficialAIRegenerationAdapter, withSupabaseOfficialAIAdapters } from "./supabase-official-ai-adapter";
import { AIObservabilityAuditAdapter, createServerObservabilityDependencies } from "@/lib/observability";

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

const RETRYABLE_STATUSES = new Set([401, 403, 408, 429, 500, 502, 503, 504]);
const credentialCooldowns = new Map<string, number>();

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
}

export class OfficialAIProviderRegistry implements AIProviderRegistryPort {
  private readonly provider: AIProviderPort;

  constructor(options: OfficialAIProviderRegistryOptions = {}) {
    const env = options.env ?? process.env;
    const now = options.now ?? Date.now;
    const primary = this.readProvider(env.LLM_PROVIDER, "LLM_PROVIDER");
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
            model: env.CEREBRAS_MODEL || "gpt-oss-120b",
            baseUrl: `${(env.CEREBRAS_BASE_URL || "https://api.cerebras.ai/v1").replace(/\/$/, "")}/chat/completions`,
            fetcher: options.fetcher,
            now
          })
        : new GroqOfficialAIProvider({
            apiKey,
            model: env.GROQ_MODEL || "llama-3.3-70b-versatile",
            fetcher: options.fetcher,
            now
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
        for (const credential of chain) {
          if ((cooldowns.get(credential.label) ?? 0) > now()) continue;
          cooldowns.delete(credential.label);
          try {
            return await credential.provider.generate(request);
          } catch (error) {
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
  const dependencies = withSupabaseOfficialAIAdapters(
    client,
    tenantId,
    createSupabaseStateDependencies(client, tenantId),
    {
      providers: new OfficialAIProviderRegistry(),
      clock: { now: () => new Date().toISOString() }
    }
  );
  return {
    ...dependencies,
    audit: new AIObservabilityAuditAdapter(
      dependencies.audit,
      createServerObservabilityDependencies()
    )
  };
}

export function createOfficialAIRegenerationDependencies(client: SupabaseClient, tenantId: string) {
  return {
    drafts: new SupabaseOfficialAIRegenerationAdapter(client, tenantId),
    providers: new OfficialAIProviderRegistry()
  };
}
