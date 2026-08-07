import type { CommercialQueueCandidate } from "@/lib/offers/commercial-curation-queue";

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
    targetQueue = "panel_only";
    reason = "Amazon permanece fora do roteamento comercial V1.";
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
