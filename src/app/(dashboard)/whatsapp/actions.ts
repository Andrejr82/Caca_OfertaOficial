"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { rotateNextWhatsappEditorialBatch, SupabaseTop30WhatsappRepository, type WhatsappNextBatchResult } from "@/lib/offers/prepare-top30-whatsapp-legacy-drafts";

export type Top30WhatsappActionResult = WhatsappNextBatchResult & { ok: boolean; message?: string };

function failed(message: string): Top30WhatsappActionResult {
  return { ok: false, mode: "next-batch", status: "exhausted", selectedOfferIds: [], selectedCount: 0, availableBeforeSelection: 0, message };
}

export async function rotateNextWhatsappEditorialBatchAction(): Promise<Top30WhatsappActionResult> {
  const authClient = await createServerSupabaseClient();
  if (!authClient) return failed("Supabase indisponível para preparar os drafts.");
  const { data: auth } = await authClient.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return failed("Faça login para atualizar as melhores ofertas.");
  const client = createSupabaseAdminClient() || authClient;
  if (!client) return failed("Supabase indisponível para preparar os drafts.");
  try {
    const result = await rotateNextWhatsappEditorialBatch(new SupabaseTop30WhatsappRepository(client, userId));
    revalidatePath("/whatsapp");
    return { ok: true, ...result, message: result.status === "selected" ? "Novo lote editorial WhatsApp selecionado." : "Não há mais ofertas editoriais disponíveis hoje." };
  } catch (error) {
    return failed(error instanceof Error ? error.message : "Não foi possível preparar os drafts WhatsApp.");
  }
}

/** @deprecated Use rotateNextWhatsappEditorialBatchAction for the refresh control. */
export const prepareTop30WhatsappLegacyDraftsAction = rotateNextWhatsappEditorialBatchAction;
