export const COMMERCIAL_DRAFT_CHANNELS = ["telegram", "manual_whatsapp", "reels_manual", "panel_only"] as const;
export type CommercialDraftChannel = (typeof COMMERCIAL_DRAFT_CHANNELS)[number];

export function validateCommercialDraftRequest(input: { offerId?: string; selectedChannel?: string; confirmCriticalRisk?: boolean }) {
  if (!input.offerId?.trim()) return { ok: false as const, code: "MISSING_OFFER_ID", message: "Oferta não informada." };
  if (!COMMERCIAL_DRAFT_CHANNELS.includes(input.selectedChannel as CommercialDraftChannel)) return { ok: false as const, code: "CHANNEL_REQUIRED", message: "Escolha um canal antes de criar o draft." };
  return { ok: true as const, offerId: input.offerId, selectedChannel: input.selectedChannel as CommercialDraftChannel, confirmCriticalRisk: input.confirmCriticalRisk === true };
}
