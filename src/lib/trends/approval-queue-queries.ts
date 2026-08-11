import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Offer } from "@/types/domain";

export async function listTrendApprovalQueueOffers(radarRunId?: string | null) {
  if (!radarRunId) return [] as Offer[];
  const client = await createServerSupabaseClient();
  if (!client) return [] as Offer[];
  const { data, error } = await client
    .from("offers")
    .select("*")
    .eq("platform", "Shopee")
    .eq("status", "pending_manual_review")
    .contains("explainability", { provenance: "trend_executive", radar_run_id: radarRunId })
    .order("score", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`Falha ao ler fila Trends: ${error.message}`);
  return (data || []) as Offer[];
}
