import { evaluateHealth, type HealthPort } from "@/core/observability";

export const dynamic = "force-dynamic";

function configured(name: string, required: boolean, predicate: () => boolean): HealthPort {
  return {
    name,
    required,
    check: async () => ({ healthy: predicate(), detail: predicate() ? "configured" : "unavailable" })
  };
}

export async function GET() {
  const supabaseConfigured = () =>
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const probes: HealthPort[] = [
    configured("state-service", true, () => true),
    configured("official-ai", true, () => Boolean(process.env.GROQ_API_KEY || process.env.CEREBRAS_API_KEY)),
    configured("official-publication", true, () => true),
    configured("oracle-worker", false, () => Boolean(process.env.ORACLE_WORKER_URL)),
    configured("transport-configuration", true, () => Boolean(
      process.env.TELEGRAM_BOT_TOKEN || process.env.WHATSAPP_ENGINE_URL ||
      process.env.INSTAGRAM_ACCESS_TOKEN || process.env.FACEBOOK_PAGE_ACCESS_TOKEN
    )),
    configured("provider-configuration", true, () => Boolean(process.env.GROQ_API_KEY || process.env.CEREBRAS_API_KEY)),
    configured("supabase", true, supabaseConfigured),
    configured("idempotency-storage", true, supabaseConfigured),
    configured("audit-storage", true, supabaseConfigured)
  ];
  const result = await evaluateHealth(probes);
  return Response.json(
    { service: "nextjs", ...result, timestamp: new Date().toISOString() },
    { status: result.ready ? 200 : 503 }
  );
}

