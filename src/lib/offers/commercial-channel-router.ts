import { buildCommercialQueue, filterOperationalPanelOffers, type CommercialQueueCandidate } from "@/lib/offers/commercial-curation-queue";
import type { Offer } from "@/types/domain";

export type CommercialTargetQueue = "telegram" | "manual_whatsapp" | "reels_manual" | "panel_only";
export type RoutedCommercialCandidate = CommercialQueueCandidate & {
  targetQueue: CommercialTargetQueue;
  reason: string;
  priority: number;
  reelsHook: string;
  reelsScript: string;
  caption: string;
};

const VISUAL_INTENTS = new Set(["casa_organizada_antes_depois", "autocuidado_que_resolve", "tech_de_bolso", "pet_recorrente_e_util", "faca_voce_mesmo_leve", "audio_e_gadget_visual", "eletro_validado_para_casa"]);
const HIGH_RISK = new Set(["regulated_or_sensitive", "security_camera_manual", "electronics_high_ticket_manual", "large_or_freight_sensitive_manual", "large_furniture_manual"]);

export function routeCommercialCandidate(candidate: CommercialQueueCandidate): RoutedCommercialCandidate {
  const risks = candidate.commercialRiskFlags || [];
  const critical = risks.some((risk) => HIGH_RISK.has(risk));
  let targetQueue: CommercialTargetQueue = "panel_only";
  let reason = "Sem canal seguro definido; manter na auditoria.";
  if (candidate.platform === "Amazon") {
    targetQueue = "manual_whatsapp";
    reason = "Amazon elegível para revisão manual no painel WhatsApp; não entra em Telegram automático.";
  } else if (!candidate.rejected && !critical && candidate.automaticEligible && candidate.achadinhoScore >= 75) {
    targetQueue = "telegram";
    reason = "Score alto, elegibilidade automática e baixo risco para revisão no Telegram.";
  } else if (!candidate.rejected && !critical && VISUAL_INTENTS.has(candidate.commercialIntent) && candidate.achadinhoScore >= 55) {
    targetQueue = "reels_manual";
    reason = "Produto visual com demonstração simples para roteiro manual.";
  } else if (!candidate.rejected && !critical && candidate.achadinhoScore >= 50) {
    targetQueue = "manual_whatsapp";
    reason = "Oferta explicável para copiar e enviar manualmente no WhatsApp.";
  }
  const hook = candidate.commercialIntent === "casa_organizada_antes_depois" ? "Organização simples que ajuda de verdade" : candidate.commercialIntent === "tech_de_bolso" ? "Acessório tech para mostrar em poucos segundos" : "Achado prático para demonstrar no dia a dia";
  const product = candidate.product_name || "Produto";
  const reelsScript = `0–3s: ${hook}.\n3–15s: mostrar ${product} em uso e destacar ${candidate.commercialReasons?.[0] || "a utilidade principal"}.\n15–25s: apresentar o preço e orientar a conferir o link.`;
  return { ...candidate, targetQueue, reason, priority: Math.max(0, Math.round(candidate.achadinhoScore * 10) + (targetQueue === "telegram" ? 100 : 0)), reelsHook: hook, reelsScript, caption: `${hook}\n\n${product}\n${candidate.suggestedCopy || "Confira a oferta no link."}` };
}

export function routeCommercialCandidates(candidates: CommercialQueueCandidate[]) {
  return candidates.map(routeCommercialCandidate).sort((a, b) => b.priority - a.priority);
}

type OperationalSelectionChannel = Exclude<CommercialTargetQueue, "panel_only"> | "operational";

export function selectOperationalTopCandidates(candidates: RoutedCommercialCandidate[], options: { limit?: number; channel: OperationalSelectionChannel; diversity?: boolean } ) {
  const limit = options.limit || 30;
  const pool = candidates.filter((candidate) => options.channel === "operational" ? candidate.targetQueue !== "panel_only" : candidate.targetQueue === options.channel).sort((a, b) => b.priority - a.priority || b.achadinhoScore - a.achadinhoScore);
  if (options.diversity === false) return pool.slice(0, limit);
  const selected: RoutedCommercialCandidate[] = [];
  const families = new Set<string>(); const categories = new Map<string, number>(); const sellers = new Map<string, number>();
  const familyOf = (candidate: RoutedCommercialCandidate) => String(candidate.product_name || "").toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/\s+/).filter((word) => word.length > 3 && !["para", "com", "kit", "preto", "branco"].includes(word)).slice(0, 3).join(" ");
  for (const candidate of pool) {
    const family = familyOf(candidate); const category = String(candidate.category || "Sem categoria"); const seller = String(candidate.seller_name || "");
    if (family && families.has(family) && selected.length < limit - 5) continue;
    if ((categories.get(category) || 0) >= 4 && selected.length < limit - 3) continue;
    if (seller && (sellers.get(seller) || 0) >= 3 && selected.length < limit - 2) continue;
    selected.push(candidate); if (family) families.add(family); categories.set(category, (categories.get(category) || 0) + 1); if (seller) sellers.set(seller, (sellers.get(seller) || 0) + 1);
    if (selected.length >= limit) break;
  }
  if (selected.length < limit) for (const candidate of pool) { if (!selected.some((item) => item.id === candidate.id)) selected.push(candidate); if (selected.length >= limit) break; }
  return selected;
}

/** Operational panel boundary: discovery remains broad; only rendered candidates are capped. */
export function selectOperationalPanelTop30(offers: Offer[], limit = 30, now = new Date(), options: { allowRecentFallback?: boolean } = {}): RoutedCommercialCandidate[] {
  const eligible = filterOperationalPanelOffers(offers, now, options);
  const candidates = buildCommercialQueue(eligible);
  const routed = routeCommercialCandidates(candidates.filter((candidate) => !candidate.rejected && Boolean(candidate.image_url)));
  return selectOperationalTopCandidates(routed, { channel: "operational", limit, diversity: true });
}

export function isManualExpressOffer(offer: Partial<Offer>): boolean {
  return offer.explainability?.manual_source === true;
}

/** Editorial Top30 boundary. Manual Express offers are rendered separately and never rank here. */
export function selectEditorialTop30(offers: Offer[], limit = 30, now = new Date(), options: { allowRecentFallback?: boolean } = {}): RoutedCommercialCandidate[] {
  return selectOperationalPanelTop30(offers.filter((offer) => !isManualExpressOffer(offer)), limit, now, options);
}
