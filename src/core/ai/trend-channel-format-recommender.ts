import type { AIProviderPort } from "@/core/ai/ports";
import type { TrendOpportunity } from "@/core/trends/types";
import {
  TREND_RECOMMENDATION_CHANNELS,
  TREND_RECOMMENDATION_FORMATS,
  type TrendRecommendationChannel,
  type TrendRecommendationFormat
} from "@/core/trends/recommendation-contract";

export const TREND_CHANNEL_FORMAT_STRATEGY_VERSION = "trend-channel-format-v1";

export interface TrendRecommendationContext {
  offerTitle: string;
  evidenceStatus: string;
  provenance: string;
  category?: string | null;
  matchReason?: string | null;
  radarEvidence?: readonly string[];
}

export interface AITrendRecommendation {
  channel: TrendRecommendationChannel;
  format: TrendRecommendationFormat;
  rationale: string;
  hypothesis: string;
  confidence: number;
  strategyVersion: string;
  provider: string;
  model: string;
}

type ModelRecommendation = {
  channel?: unknown;
  format?: unknown;
  rationale?: unknown;
  hypothesis?: unknown;
  confidence?: unknown;
};

function isAllowed<T extends readonly string[]>(value: unknown, allowed: T): value is T[number] {
  return typeof value === "string" && allowed.includes(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function containsUnsupportedPerformanceClaim(value: string) {
  return /\b(?:ctr|roas|engagement|engajamento|convers[aã]o|conversion|click[- ]?through|alcance|comiss[aã]o|receita|taxa\s+de\s+(?:clique|venda|convers[aã]o))\b/i.test(value);
}

export async function recommendTrendChannelAndFormat(
  opportunity: TrendOpportunity | null,
  context: TrendRecommendationContext,
  provider: AIProviderPort,
  options: { strategyVersion?: string; correlationId?: string } = {}
): Promise<AITrendRecommendation | null> {
  if (!opportunity?.offerId || opportunity.matchStatus !== "matched") return null;

  const strategyVersion = options.strategyVersion ?? TREND_CHANNEL_FORMAT_STRATEGY_VERSION;
  let response;
  try {
    response = await provider.generate({
      correlationId: options.correlationId ?? `trend-recommendation:${opportunity.id}`,
      timeoutMs: 30_000,
      temperature: 0,
      maxTokens: 500,
      metadata: {
        feature: "trend-channel-format-recommendation",
        strategyVersion,
        offerId: opportunity.offerId,
        marketplace: opportunity.marketplace ?? ""
      },
      prompt: {
        system: `Você recomenda canal e formato para uma oportunidade comercial real já validada. Use somente os dados recebidos. Responda somente JSON com channel (WhatsApp, Telegram, Instagram ou Facebook), format (imagem, carrossel ou vídeo), rationale, hypothesis e confidence (0-100). Não invente nem prometa CTR, conversão, vendas, comissão, ROAS, alcance, engagement, volume, receita ou histórico. A hipótese deve ser qualitativa e condicional, sem métricas de performance. Baseie a justificativa nos atributos e evidências observados; se não houver histórico, não o suponha.`,
        user: JSON.stringify({
          normalized_product_term: opportunity.normalizedProductTerm,
          marketplace: opportunity.marketplace,
          offer_title: context.offerTitle,
          observed_price: opportunity.currentPrice,
          evidence_status: context.evidenceStatus,
          provenance: context.provenance,
          category: context.category ?? null,
          match_reason: context.matchReason ?? opportunity.matchReason,
          radar_evidence: context.radarEvidence ?? []
        })
      }
    });
  } catch {
    return null;
  }

  if (!isObject(response.content)) return null;
  const value = response.content as ModelRecommendation;
  const rationale = typeof value.rationale === "string" ? value.rationale.trim() : "";
  const hypothesis = typeof value.hypothesis === "string" ? value.hypothesis.trim() : "";
  const confidence = typeof value.confidence === "number" && Number.isFinite(value.confidence)
    ? value.confidence
    : null;
  if (
    !isAllowed(value.channel, TREND_RECOMMENDATION_CHANNELS) ||
    !isAllowed(value.format, TREND_RECOMMENDATION_FORMATS) ||
    !rationale ||
    !hypothesis ||
    containsUnsupportedPerformanceClaim(rationale) ||
    containsUnsupportedPerformanceClaim(hypothesis) ||
    confidence === null ||
    confidence < 0 ||
    confidence > 100
  ) return null;

  return {
    channel: value.channel,
    format: value.format,
    rationale,
    hypothesis,
    confidence,
    strategyVersion,
    provider: response.provider,
    model: response.model
  };
}
