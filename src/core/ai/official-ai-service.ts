import { buildConversionCopyV4Contract, type CopyV4Facts } from "./copy-v4";
import {
  generateOfficialAI as generateOfficialAIEngine,
  OFFICIAL_AI_PAGE_CONCURRENCY,
} from "./official-ai-service-engine";
import type { OfficialAIServiceDependencies } from "./ports";
import type {
  OfficialAIChannel,
  OfficialAICommand,
  OfficialAIContent,
  OfficialAIOffer,
  OfficialAIResult,
} from "./types";

export { OFFICIAL_AI_PAGE_CONCURRENCY };

function copyV4FactsFromOffer(offer: OfficialAIOffer): CopyV4Facts {
  const explainabilityMetrics = offer.explainability?.marketplace_metrics;
  return {
    productName: offer.productName,
    shortName: offer.shortName,
    marketplace: offer.marketplace,
    category: offer.category,
    currentPrice: offer.currentPrice,
    originalPrice: offer.originalPrice,
    evidence: {
      ...offer.explainability,
      marketplace_metrics: {
        ...(explainabilityMetrics && typeof explainabilityMetrics === "object"
          ? explainabilityMetrics as Record<string, unknown>
          : {}),
        ...(offer.marketplaceMetrics ?? {}),
      },
    },
    freeShipping: offer.shippingFree ?? null,
  };
}

function normalizeLine(value: string | null) {
  return value?.replace(/\s+/gu, " ").trim() || null;
}

function decisionBlocks(facts: CopyV4Facts) {
  const contract = buildConversionCopyV4Contract(facts, "whatsapp");
  return {
    contract,
    blocks: [
      normalizeLine(contract.hook),
      normalizeLine(contract.proofLine ? `🏆 ${contract.proofLine}` : null),
      normalizeLine(contract.offerLine ? `💰 ${contract.offerLine}` : null),
      normalizeLine(contract.benefitLine ? `✨ ${contract.benefitLine}` : null),
      facts.freeShipping === true ? "🚚 Frete grátis confirmado." : null,
    ].filter((value): value is string => Boolean(value)),
  };
}

/**
 * Copy V4 canônica antes da materialização do tracked URL.
 * WhatsApp/Telegram terminam com uma seta vazia de propósito: o adapter oficial
 * anexa ali o único tracked URL. Facebook reserva o destino ao primeiro comentário.
 * Instagram vira um handoff de Stories e a rota de publicação impede que isso seja
 * enviado acidentalmente como Feed/Reel.
 */
export function buildCanonicalCopyV4ChannelDraft(facts: CopyV4Facts, channel: OfficialAIChannel) {
  const { contract, blocks } = decisionBlocks(facts);

  if (channel === "facebook") {
    return [...blocks, "👉 Conferir o preço atual no primeiro comentário. 👇"].join("\n\n");
  }
  if (channel === "instagram") {
    const proofOffer = [contract.proofLine, contract.offerLine].filter(Boolean).join("\n");
    return [
      "STORIES V4 · HANDOFF MANUAL",
      `TELA 1/3\n${contract.hook}`,
      `TELA 2/3\n${proofOffer || contract.benefitLine || contract.product}`,
      "TELA 3/3\n👉 Conferir o preço atual",
    ].join("\n\n");
  }
  return [...blocks, "👉 Conferir o preço atual", "👉"].join("\n\n");
}

function buildCanonicalCopyV4Content(
  previous: OfficialAIContent,
  offer: OfficialAIOffer,
  channels: readonly OfficialAIChannel[],
): OfficialAIContent {
  const facts = copyV4FactsFromOffer(offer);
  const contract = buildConversionCopyV4Contract(facts, "whatsapp");
  return {
    ...previous,
    shortCopy: contract.hook,
    longCopy: [contract.hook, contract.proofLine, contract.offerLine, contract.benefitLine]
      .filter(Boolean)
      .join(" "),
    hashtags: [],
    callToAction: "Conferir o preço atual",
    highlights: [contract.proofLine, contract.offerLine, contract.benefitLine]
      .filter((value): value is string => Boolean(value)),
    explanation: "Copy V4 canônica: decisão comercial factual, CTA único e entrega específica por canal.",
    channelCopies: {
      ...previous.channelCopies,
      ...Object.fromEntries(channels.map((channel) => [
        channel,
        buildCanonicalCopyV4ChannelDraft(facts, channel),
      ])),
    },
  };
}

export async function generateOfficialAI(
  command: OfficialAICommand,
  dependencies: OfficialAIServiceDependencies,
): Promise<OfficialAIResult> {
  let latestContent: OfficialAIContent | null = null;

  const wrappedDependencies: OfficialAIServiceDependencies = {
    ...dependencies,
    content: {
      persistDrafts: async (input) => {
        const content = buildCanonicalCopyV4Content(input.content, input.offer, input.channels);
        latestContent = content;
        return dependencies.content.persistDrafts({ ...input, content });
      },
    },
  };

  const result = await generateOfficialAIEngine(command, wrappedDependencies);
  if (latestContent && result.status !== "rejected" && command.offerId !== "ALL_PENDING" && !command.batch) {
    return { ...result, content: latestContent };
  }
  return result;
}
