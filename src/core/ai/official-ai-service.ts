import {
  buildConversionCopyV4Contract,
  getMarketplaceCtaPrefix,
  type CopyV4Facts,
} from "./copy-v4";
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
  return value?.trim() || null;
}

function decisionBlocks(facts: CopyV4Facts) {
  const contract = buildConversionCopyV4Contract(facts, "whatsapp");
  return {
    contract,
    blocks: [
      normalizeLine(contract.hook),
      normalizeLine(contract.priceBlock),
      normalizeLine(contract.couponLine),
      normalizeLine(contract.shippingLine),
      normalizeLine(contract.officialStoreLine),
      normalizeLine(contract.attributesLine),
      normalizeLine(contract.proofLine),
    ].filter((value): value is string => Boolean(value)),
  };
}

/**
 * Copy V4 canônica antes da materialização do tracked URL.
 * WhatsApp/Telegram recebem um único tracked URL pelo adapter.
 * Facebook reserva o destino ao primeiro comentário.
 * Instagram volta a ser uma legenda manual/feed. Stories e Reels são superfícies
 * separadas e não são codificadas dentro do draft textual do Instagram.
 */
export function buildCanonicalCopyV4ChannelDraft(facts: CopyV4Facts, channel: OfficialAIChannel) {
  const { blocks } = decisionBlocks(facts);

  if (channel === "facebook") {
    return [...blocks, "👉 Link da oferta no primeiro comentário. 👇"].join("\n\n");
  }
  if (channel === "instagram") {
    return [...blocks, "🔎 Link da oferta na bio. 👇"].join("\n\n");
  }
  const ctaPrefix = getMarketplaceCtaPrefix(facts.marketplace);
  return [...blocks, ctaPrefix, "👉"].join("\n\n");
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
