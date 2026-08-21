import { buildConversionCopyV4Contract, type CopyV4Facts } from "@/core/ai/copy-v4";

export const WHATSAPP_CONVERSION_V4_MAX_BLOCKS = 6;

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
  return value.replace(/\s+/gu, " ").trim();
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
 * Task 3 — renderer final de conversão para WhatsApp.
 *
 * Recebe o tracked URL já resolvido pela camada de persistência. Isso permite
 * uma única ação comercial + um único link, sem placeholder e sem depender de
 * uma segunda CTA adicionada depois.
 *
 * Ainda não está ligado ao fluxo canônico de produção; a ativação ocorrerá
 * somente no fechamento do programa Copy V4.
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
  push(contract.proofLine ? `⭐ ${contract.proofLine}` : null);
  push(contract.benefitLine);
  push(facts.freeShipping === true ? "🚚 Frete grátis confirmado." : null);
  push(contract.offerLine ? `💰 ${contract.offerLine}` : null);

  const contentBlocks = blocks.slice(0, WHATSAPP_CONVERSION_V4_MAX_BLOCKS - 1);
  contentBlocks.push(`👉 Conferir o preço atual: ${url}`);

  return contentBlocks.join("\n\n");
}
