import { buildConversionCopyV4Contract, type CopyV4Facts } from "@/core/ai/copy-v4";

export interface FacebookConversionV4 {
  feed: string;
  firstComment: string;
}

export const FACEBOOK_CONVERSION_V4_MAX_FEED_BLOCKS = 6;

function assertTrackedUrl(trackedUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(trackedUrl);
  } catch {
    throw new Error("Facebook Conversion V4 requires a valid tracked URL");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Facebook Conversion V4 requires an HTTPS tracked URL");
  }
  return parsed.toString();
}

function normalizeLine(value: string) {
  return value.replace(/\s+/gu, " ").trim();
}

function semantic(value: string) {
  return normalizeLine(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

/**
 * Task 6 — contrato de conversão para Facebook.
 *
 * O feed constrói confiança e decisão sem URL direta. O tracked URL fica
 * exclusivamente no primeiro comentário, mantendo uma única rota de ação.
 * Ainda não está ligado ao fluxo canônico de produção.
 */
export function buildFacebookConversionV4(facts: CopyV4Facts, trackedUrl: string): FacebookConversionV4 {
  const url = assertTrackedUrl(trackedUrl);
  const contract = buildConversionCopyV4Contract(facts, "facebook");
  const blocks: string[] = [];
  const seen = new Set<string>();

  const push = (value: string | null) => {
    if (!value) return;
    const normalized = normalizeLine(value);
    const key = semantic(normalized);
    if (!normalized || !key || seen.has(key)) return;
    seen.add(key);
    blocks.push(normalized);
  };

  push(contract.hook);
  push(contract.proofLine ? `🏆 ${contract.proofLine}` : null);
  push(contract.offerLine ? `💰 ${contract.offerLine}` : null);
  push(contract.benefitLine ? `✨ ${contract.benefitLine}` : null);
  push(facts.freeShipping === true ? "🚚 Frete grátis confirmado." : null);

  const contentBlocks = blocks.slice(0, FACEBOOK_CONVERSION_V4_MAX_FEED_BLOCKS - 1);
  contentBlocks.push("👉 Conferir o preço atual no primeiro comentário. 👇");

  return {
    feed: contentBlocks.join("\n\n"),
    firstComment: `👉 Conferir o preço atual: ${url}`,
  };
}
