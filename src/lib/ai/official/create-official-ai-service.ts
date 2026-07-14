import type { SupabaseClient } from "@supabase/supabase-js";
import type { AIProviderPort, AIProviderRegistryPort } from "@/core/ai";
import { CerebrasOfficialAIProvider } from "@/core/ai/providers/cerebras-provider";
import { GroqOfficialAIProvider } from "@/core/ai/providers/groq-provider";
import { createSupabaseStateDependencies } from "@/lib/state/supabase-state-adapter";
import { withSupabaseOfficialAIAdapters } from "./supabase-official-ai-adapter";
import { AIObservabilityAuditAdapter, createServerObservabilityDependencies } from "@/lib/observability";

class OfficialAIProviderRegistry implements AIProviderRegistryPort {
  private readonly providers = new Map<"groq" | "cerebras", AIProviderPort>();

  constructor() {
    if (process.env.GROQ_API_KEY) {
      this.providers.set("groq", new GroqOfficialAIProvider({
        apiKey: process.env.GROQ_API_KEY,
        model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile"
      }));
    }
    if (process.env.CEREBRAS_API_KEY) {
      this.providers.set("cerebras", new CerebrasOfficialAIProvider({
        apiKey: process.env.CEREBRAS_API_KEY,
        model: process.env.CEREBRAS_MODEL || "gpt-oss-120b",
        baseUrl: `${(process.env.CEREBRAS_BASE_URL || "https://api.cerebras.ai/v1").replace(/\/$/, "")}/chat/completions`
      }));
    }
  }

  resolve(preference?: "groq" | "cerebras") {
    const selected = preference ?? (this.providers.has("groq") ? "groq" : "cerebras");
    const provider = this.providers.get(selected);
    if (!provider) throw new Error(`Official AI provider ${selected} is not configured`);
    return provider;
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
