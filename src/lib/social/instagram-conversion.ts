import { buildConversionCopyV4Contract, type CopyV4Facts } from "@/core/ai/copy-v4";

export interface InstagramStoryFrameV4 {
  frame: 1 | 2 | 3;
  purpose: "hook" | "proof_offer" | "action";
  text: string;
  linkStickerLabel?: string;
  trackedUrl?: string;
}

export interface InstagramReelBeatV4 {
  startSecond: number;
  endSecond: number;
  purpose: "hook" | "proof_benefit" | "offer" | "action";
  text: string;
}

export interface InstagramConversionV4Plan {
  commercialAngle: ReturnType<typeof buildConversionCopyV4Contract>["commercialAngle"];
  storyFrames: readonly InstagramStoryFrameV4[];
  reelBeats: readonly InstagramReelBeatV4[];
}

function assertTrackedUrl(trackedUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(trackedUrl);
  } catch {
    throw new Error("Instagram Conversion V4 requires a valid tracked URL");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Instagram Conversion V4 requires an HTTPS tracked URL");
  }
  return parsed.toString();
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
 * Task 4 — plano determinístico de Instagram Stories + Reels.
 *
 * Stories usam um único destino rastreado no sticker da última tela. Reels não
 * recebem URL no texto: terminam com uma única ação para consultar o preço nos
 * Stories, evitando duas rotas concorrentes. Nenhuma publicação é feita aqui.
 */
export function buildInstagramConversionV4Plan(facts: CopyV4Facts, storyTrackedUrl: string): InstagramConversionV4Plan {
  const trackedUrl = assertTrackedUrl(storyTrackedUrl);
  const contract = buildConversionCopyV4Contract(facts, "instagram");
  const hook = compact(contract.hook, 90);
  const proof = contract.proofLine ? compact(contract.proofLine, 90) : null;
  const benefit = contract.benefitLine ? compact(contract.benefitLine, 90) : null;
  const offer = contract.offerLine ? compact(contract.offerLine, 105) : null;

  const middle = [
    proof ? `🏆 ${proof}` : null,
    offer ? `💰 ${offer}` : null,
  ].filter((value): value is string => Boolean(value)).join("\n");

  const storyFrames: InstagramStoryFrameV4[] = [
    { frame: 1, purpose: "hook", text: hook },
    {
      frame: 2,
      purpose: "proof_offer",
      text: middle || compact(benefit ?? removeLeadingEmoji(hook), 105),
    },
    {
      frame: 3,
      purpose: "action",
      text: "Conferir o preço atual",
      linkStickerLabel: "Ver preço atual",
      trackedUrl,
    },
  ];

  const proofOrBenefit = proof
    ? `🏆 ${proof}`
    : benefit
      ? `✨ ${benefit}`
      : compact(removeLeadingEmoji(hook), 90);

  const reelBeats: InstagramReelBeatV4[] = [
    { startSecond: 0, endSecond: 2, purpose: "hook", text: hook },
    { startSecond: 2, endSecond: 6, purpose: "proof_benefit", text: proofOrBenefit },
    { startSecond: 6, endSecond: 10, purpose: "offer", text: offer ? `💰 ${offer}` : "Confira as condições atuais no anúncio." },
    { startSecond: 10, endSecond: 13, purpose: "action", text: "Conferir o preço atual nos Stories." },
  ];

  return { commercialAngle: contract.commercialAngle, storyFrames, reelBeats };
}
