import {
  buildConversionCopyV4Contract,
  getMarketplaceCtaPrefix as getMarketplaceCtaPrefixV4,
  type CopyV4Facts,
} from "./copy-v4";
import { planCommercialCopyV5 } from "./copy-v5-planner";
import {
  type CopyV5Facts,
  type CopyV5Plan,
} from "./copy-v5-types";
import { validateCopyV5Plan } from "./copy-v5-validator";
import { polishCopyV5Facts, polishCopyV5Plan } from "./copy-v5-polish";
import {
  renderCopyV5ChannelCopy,
  getMarketplaceCtaPrefix as getMarketplaceCtaPrefixV5,
} from "./copy-v5-renderer";
import {
  generateOfficialAI as generateOfficialAIEngine,
  OFFICIAL_AI_PAGE_CONCURRENCY,
} from "./official-ai-service-engine";
import { emitOfficialAITelemetrySafely, type OfficialAIServiceDependencies } from "./ports";
import type {
  OfficialAIChannel,
  OfficialAICommand,
  OfficialAIContent,
  OfficialAIOffer,
  OfficialAIResult,
} from "./types";

export { OFFICIAL_AI_PAGE_CONCURRENCY };
export const getMarketplaceCtaPrefix = getMarketplaceCtaPrefixV5;

export function copyV5FactsFromOffer(offer: OfficialAIOffer): CopyV5Facts {
  const explainabilityMetrics = offer.explainability?.marketplace_metrics;
  const freeShipping = [
    offer.shippingFree,
    offer.explainability?.free_shipping,
    offer.explainability?.shipping_free,
    (offer.marketplaceMetrics as Record<string, unknown> | undefined)?.free_shipping,
    (offer.marketplaceMetrics as Record<string, unknown> | undefined)?.shipping_free,
    (offer.marketplaceMetrics as Record<string, unknown> | undefined)?.shippingFree,
  ].find((v): v is boolean => typeof v === "boolean") ?? null;

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
    freeShipping,
  };
}

function normalizeLine(value: string | null) {
  return value?.trim() || null;
}

function decisionBlocksV4(facts: CopyV4Facts) {
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
 * Compatibilidade legada apenas para testes/migração. Não é autoridade de produção.
 */
export function buildCanonicalCopyV4ChannelDraft(facts: CopyV4Facts, channel: OfficialAIChannel) {
  const { blocks } = decisionBlocksV4(facts);

  if (channel === "facebook") {
    return [...blocks, "👉 Link da oferta no primeiro comentário. 👇"].join("\n\n");
  }
  if (channel === "instagram") {
    return [...blocks, "🔎 Link da oferta na bio. 👇"].join("\n\n");
  }
  const ctaPrefix = getMarketplaceCtaPrefixV4(facts.marketplace);
  return [...blocks, ctaPrefix, "👉"].join("\n\n");
}

/**
 * Autoridade única de copy final: Copy V5.
 */
export function buildCanonicalCopyV5ChannelDraft(
  facts: CopyV5Facts,
  channel: OfficialAIChannel,
  plan?: CopyV5Plan | null,
  trackedUrl?: string | null,
): string {
  const polishedFacts = polishCopyV5Facts(facts);
  const validatedPlan = validateCopyV5Plan(plan, polishedFacts);
  const polishedPlan = polishCopyV5Plan(validatedPlan, polishedFacts);
  const rendered = renderCopyV5ChannelCopy(polishedPlan, polishedFacts, channel, trackedUrl);
  return rendered.feed;
}

export function buildCanonicalCopyV5Content(
  previous: OfficialAIContent,
  offer: OfficialAIOffer,
  channels: readonly OfficialAIChannel[],
  authoritativePlan?: CopyV5Plan | null,
): OfficialAIContent {
  const facts = polishCopyV5Facts(copyV5FactsFromOffer(offer));
  const planCandidate: Partial<CopyV5Plan> | CopyV5Plan = authoritativePlan ?? {
    shortProductName: previous.shortName,
    hook: previous.shortCopy,
    selectedAttributes: previous.highlights,
  };
  const validatedPlan = validateCopyV5Plan(planCandidate, facts);
  const plan = polishCopyV5Plan(validatedPlan, facts);

  return {
    ...previous,
    shortCopy: plan.hook,
    shortName: plan.shortProductName,
    longCopy: `${plan.hook} ${plan.selectedAttributes.join(" • ")}`.trim(),
    hashtags: [],
    callToAction: "Ver oferta",
    highlights: plan.selectedAttributes,
    explanation: "Copy V5: planCommercialCopyV5 é o cérebro único da copy final.",
    channelCopies: {
      ...previous.channelCopies,
      ...Object.fromEntries(channels.map((channel) => [
        channel,
        buildCanonicalCopyV5ChannelDraft(facts, channel, plan),
      ])),
    },
  };
}

/**
 * Os flags V2/V3 antigos ainda podem existir nos callers por compatibilidade,
 * mas não podem selecionar um cérebro ou renderer alternativo nos dois fluxos
 * produtivos que geram drafts em pending_manual_review.
 */
export function neutralizeLegacyCopyRouting(command: OfficialAICommand): OfficialAICommand {
  const isCycle = command.origin === "oracle.discovery"
    && command.actor.type === "service"
    && command.metadata?.copyV2Auto === true;
  const isExpress = command.origin === "publish.quick-publication"
    && (command.metadata?.copyV2Express === true || command.metadata?.copyV3Express === true);

  if (!isCycle && !isExpress) return command;

  const {
    copyV2: _copyV2,
    copyV2Auto: _copyV2Auto,
    copyV2Express: _copyV2Express,
    copyV3Express: _copyV3Express,
    ...metadata
  } = command.metadata ?? {};

  return {
    ...command,
    metadata,
  };
}

export async function generateOfficialAI(
  command: OfficialAICommand,
  dependencies: OfficialAIServiceDependencies,
): Promise<OfficialAIResult> {
  let latestContent: OfficialAIContent | null = null;
  const canonicalCommand = neutralizeLegacyCopyRouting(command);

  const wrappedDependencies: OfficialAIServiceDependencies = {
    ...dependencies,
    // O engine permanece como máquina de estado/compatibilidade. Ele não tem
    // autoridade para escolher outro cérebro: a inferência final é V5 abaixo.
    providers: {
      resolve() {
        throw new Error("COPY_V5_SINGLE_BRAIN_ENFORCED");
      },
    },
    content: {
      persistDrafts: async (input) => {
        const facts = polishCopyV5Facts(copyV5FactsFromOffer(input.offer));
        let provider = null;
        try {
          provider = dependencies.providers.resolve(input.command.providerPreference);
        } catch {
          // O planner registra no_provider e usa somente o fallback factual V5.
        }
        const plan = await planCommercialCopyV5(facts, provider, {
          correlationId: input.command.correlationId,
          timeoutMs: 15_000,
          metadata: input.command.metadata,
          onOutcome: (outcome) => emitOfficialAITelemetrySafely(dependencies.telemetry, {
            eventType: "official_ai.copy_v5.planning.completed",
            correlationId: input.command.correlationId,
            offerId: input.offer.id,
            marketplace: input.offer.marketplace,
            provider: outcome.provider,
            model: outcome.model,
            fallback: outcome.fallback,
            stage: "copy_v5_planning",
            details: {
              source: outcome.source,
              fallbackReason: outcome.reason,
            },
          }),
        });
        const content = buildCanonicalCopyV5Content(input.content, input.offer, input.channels, plan);
        latestContent = content;
        return dependencies.content.persistDrafts({ ...input, content });
      },
    },
  };

  const result = await generateOfficialAIEngine(canonicalCommand, wrappedDependencies);
  if (latestContent && result.status !== "rejected" && canonicalCommand.offerId !== "ALL_PENDING" && !canonicalCommand.batch) {
    return { ...result, content: latestContent };
  }
  return result;
}
