import { buildConversionCopyV4Contract, type CopyV4Facts } from "@/core/ai/copy-v4";

export const TELEGRAM_CONVERSION_V4_MAX_BLOCKS = 6;

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
 * Task 5 — renderer final de conversão para Telegram.
 *
 * O canal funciona como alerta comercial: atenção -> prova -> preço -> benefício
 * -> condição factual -> ação. Recebe o tracked URL já resolvido e mantém um
 * único destino clicável. Ainda não está ligado ao fluxo canônico de produção.
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
  push(contract.proofLine ? `🏆 ${contract.proofLine}` : null);
  push(contract.offerLine ? `💰 ${contract.offerLine}` : null);
  push(contract.benefitLine ? `✨ ${contract.benefitLine}` : null);
  push(facts.freeShipping === true ? "🚚 Frete grátis confirmado." : null);

  const contentBlocks = blocks.slice(0, TELEGRAM_CONVERSION_V4_MAX_BLOCKS - 1);
  contentBlocks.push(`👉 Conferir o preço atual: ${url}`);

  return contentBlocks.join("\n\n");
}
