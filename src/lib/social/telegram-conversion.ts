import {
  buildConversionCopyV4Contract,
  getMarketplaceCtaPrefix,
  type CopyV4Facts,
} from "@/core/ai/copy-v4";

export const TELEGRAM_CONVERSION_V4_MAX_BLOCKS = 8;

function assertTrackedUrl(trackedUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(trackedUrl);
  } catch {
    throw new Error("Telegram Conversion V4 requires a valid tracked URL");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Telegram Conversion V4 requires an HTTPS tracked URL");
  }
  return parsed.toString();
}

function normalizeLine(value: string) {
  return value.trim();
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
 * Renderer final de conversão para Telegram no padrão brasileiro de ofertas.
 */
export function buildTelegramConversionV4(facts: CopyV4Facts, trackedUrl: string) {
  const url = assertTrackedUrl(trackedUrl);
  const contract = buildConversionCopyV4Contract(facts, "telegram");
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
  push(contract.priceBlock);
  push(contract.couponLine);
  push(contract.shippingLine);
  push(contract.officialStoreLine);
  push(contract.attributesLine);
  push(contract.proofLine);

  const ctaPrefix = getMarketplaceCtaPrefix(facts.marketplace);
  const contentBlocks = blocks.slice(0, TELEGRAM_CONVERSION_V4_MAX_BLOCKS - 1);
  contentBlocks.push(`${ctaPrefix}\n${url}`);

  return contentBlocks.join("\n\n");
}
