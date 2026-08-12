import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Offer } from "@/types/domain";

export async function listTrendApprovalQueueOffers(radarRunId?: string | null) {
  if (!radarRunId) return [] as Offer[];
  const client = await createServerSupabaseClient();
  if (!client) return [] as Offer[];
  const { data: run, error: runError } = await client
    .from("trend_radar_runs")
    .select("generated_at")
    .eq("id", radarRunId)
    .maybeSingle();
  if (runError || !run?.generated_at) return [] as Offer[];
  const { data, error } = await client
    .from("offers")
    .select("*")
    .in("platform", ["Shopee", "Mercado Livre"])
    .eq("status", "pending_manual_review")
    .gte("created_at", run.generated_at)
    .contains("explainability", { provenance: "external_radar", radar_run_id: radarRunId })
    .order("score", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`Falha ao ler fila Trends: ${error.message}`);
  return (data || []) as Offer[];
}
