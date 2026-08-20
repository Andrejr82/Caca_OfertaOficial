import { buildConversionCopyV4Contract, type CopyV4Facts } from "@/core/ai/copy-v4";

export interface InstagramReelBeatV4 {
  startSecond: number;
  endSecond: number;
  purpose: "hook" | "proof_benefit" | "offer" | "action";
  text: string;
}

export interface InstagramConversionV4Plan {
  commercialAngle: ReturnType<typeof buildConversionCopyV4Contract>["commercialAngle"];
  reelBeats: readonly InstagramReelBeatV4[];
}

function compact(value: string, max = 110) {
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (normalized.length <= max) return normalized;
  const cut = normalized.lastIndexOf(" ", max);
  return `${normalized.slice(0, cut > 30 ? cut : max).replace(/[\s,;:–—-]+$/gu, "")}…`;
}

function removeLeadingEmoji(value: string) {
  return value.replace(/^[^\p{L}\p{N}]+/u, "").trim();
}

/**
 * Plano determinístico de conversão para Instagram Reels.
 *
 * O gerador de cards estáticos de Stories foi aposentado. Stories passam a ser
 * um destino possível para reutilização do próprio vídeo, tratado no fluxo de
 * publicação audiovisual, não aqui.
 */
export function buildInstagramConversionV4Plan(facts: CopyV4Facts): InstagramConversionV4Plan {
  const contract = buildConversionCopyV4Contract(facts, "instagram");
  const hook = compact(contract.hook, 90);
  const proof = contract.proofLine ? compact(contract.proofLine, 90) : null;
  const benefit = contract.benefitLine ? compact(contract.benefitLine, 90) : null;
  const offer = contract.offerLine ? compact(contract.offerLine, 105) : null;

  const proofOrBenefit = proof
    ? `🏆 ${proof}`
    : benefit
      ? `✨ ${benefit}`
      : compact(removeLeadingEmoji(hook), 90);

  const reelBeats: InstagramReelBeatV4[] = [
    { startSecond: 0, endSecond: 2, purpose: "hook", text: hook },
    { startSecond: 2, endSecond: 6, purpose: "proof_benefit", text: proofOrBenefit },
    { startSecond: 6, endSecond: 10, purpose: "offer", text: offer ? `💰 ${offer}` : "Confira as condições atuais no anúncio." },
    { startSecond: 10, endSecond: 13, purpose: "action", text: "Confira a oferta no link do perfil." },
  ];

  return { commercialAngle: contract.commercialAngle, reelBeats };
}
