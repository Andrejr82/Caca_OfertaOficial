"use server";

import { validateCommercialDraftRequest } from "@/lib/offers/commercial-draft-validation";

export async function createCommercialCurationDraft(input: { offerId?: string; selectedChannel?: string; confirmCriticalRisk?: boolean }) {
  const validation = validateCommercialDraftRequest(input);
  if (!validation.ok) return validation;
  return {
    ok: false as const,
    code: "OFFICIAL_AI_REQUIRED",
    message: "Curadoria apenas seleciona candidatos. O draft deve ser gerado pela Official AI.",
    selectedChannel: validation.selectedChannel,
  };
}
