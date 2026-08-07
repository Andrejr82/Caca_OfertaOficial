"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { prepareTop30WhatsappLegacyDrafts, SupabaseTop30WhatsappRepository, type Top30WhatsappResult } from "@/lib/offers/prepare-top30-whatsapp-legacy-drafts";

export type Top30WhatsappActionResult = Top30WhatsappResult & { ok: boolean; message?: string };

function failed(message: string): Top30WhatsappActionResult {
  return { ok: false, windowUsed: "today_brt", created: 0, reusedTodayDrafts: 0, reused: 0, skippedAlreadyPosted: 0, skippedAlreadyApproved: 0, skippedAlreadySeenToday: 0, skippedOldDraft: 0, skippedNotFresh: 0, skippedAffiliateFailed: 0, skipped: 0, reasons: { preparation_failed: 1 }, message };
}

export async function prepareTop30WhatsappLegacyDraftsAction(): Promise<Top30WhatsappActionResult> {
  const authClient = await createServerSupabaseClient();
  if (!authClient) return failed("Supabase indisponível para preparar os drafts.");
  const { data: auth } = await authClient.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return failed("Faça login para atualizar as melhores ofertas.");
  const client = createSupabaseAdminClient() || authClient;
  if (!client) return failed("Supabase indisponível para preparar os drafts.");
  try {
    const result = await prepareTop30WhatsappLegacyDrafts(new SupabaseTop30WhatsappRepository(client, userId));
    revalidatePath("/whatsapp");
    return { ok: true, ...result, message: "Drafts WhatsApp preparados em Aguardando aprovação." };
  } catch (error) {
    return failed(error instanceof Error ? error.message : "Não foi possível preparar os drafts WhatsApp.");
  }
}
