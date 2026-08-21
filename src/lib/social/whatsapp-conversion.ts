import {
  buildConversionCopyV4Contract,
  getMarketplaceCtaPrefix,
  type CopyV4Facts,
} from "@/core/ai/copy-v4";

export const WHATSAPP_CONVERSION_V4_MAX_BLOCKS = 8;

function assertTrackedUrl(trackedUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(trackedUrl);
  } catch {
    throw new Error("WhatsApp Conversion V4 requires a valid tracked URL");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("WhatsApp Conversion V4 requires an HTTPS tracked URL");
  }
  return parsed.toString();
}

function normalizeLine(value: string) {
  return value.trim();
}

function isDuplicateLine(candidate: string, existing: readonly string[]) {
  const normalized = normalizeLine(candidate)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .toLocaleLowerCase("pt-BR")
    .trim();
  return existing.some((line) => {
    const compared = normalizeLine(line)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/gu, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .toLocaleLowerCase("pt-BR")
      .trim();
    return normalized === compared;
  });
}

/**
 * Renderer final de conversão para WhatsApp no padrão brasileiro de ofertas.
 */
export function buildWhatsAppConversionV4(facts: CopyV4Facts, trackedUrl: string) {
  const url = assertTrackedUrl(trackedUrl);
  const contract = buildConversionCopyV4Contract(facts, "whatsapp");
  const blocks: string[] = [];

  const push = (value: string | null) => {
    if (!value) return;
    const normalized = normalizeLine(value);
    if (!normalized || isDuplicateLine(normalized, blocks)) return;
    blocks.push(normalized);
  };

  push(contract.hook);
  push(contract.priceBlock);
  push(contract.couponLine);
  push(contract.shippingLine);
  push(contract.officialStoreLine);
  push(contract.attributesLine);
  push(contract.proofLine);

  const ctaPrefix = getMarketplaceCtaPrefix(facts.marketplace);
  const contentBlocks = blocks.slice(0, WHATSAPP_CONVERSION_V4_MAX_BLOCKS - 1);
  contentBlocks.push(`${ctaPrefix}\n${url}`);

  return contentBlocks.join("\n\n");
}
