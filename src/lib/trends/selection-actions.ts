"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type TrendSelectionDecision = "IGNORAR" | "APROVAR_TESTE";

async function persistSelectionDecision(formData: FormData, decision: TrendSelectionDecision) {
  const productId = String(formData.get("product_id") || "").trim();
  if (!productId) throw new Error("Produto do Radar inválido.");

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase não configurado.");

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const { error } = await supabase
    .from("trend_radar_products")
    .update({
      selection_decision: decision,
      selection_decided_at: new Date().toISOString(),
    })
    .eq("id", productId);

  if (error) throw new Error("Falha ao registrar decisão comercial.");
  revalidatePath("/trends");
}

export async function approveTrendTestAction(formData: FormData) {
  await persistSelectionDecision(formData, "APROVAR_TESTE");
}

export async function ignoreTrendProductAction(formData: FormData) {
  await persistSelectionDecision(formData, "IGNORAR");
}
