import type { AIProviderPort, AIProviderResponse } from "@/core/ai/ports";
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
  return /\b(?:ctr|roas|engagement|engajamento|convers(?:ão|ões)|conversion(?:s)?|click[- ]?through|clique(?:s)?|alcance|vendas?|comiss(?:ão|ões)|receita|search\s+volume|volume\s+de\s+pesquisa|sold\s+quantity|quantidade\s+vendida|taxa\s+de\s+(?:clique|venda|convers(?:ão|ões)))\b/iu.test(value);
}

function normalizeChannel(value: unknown): TrendRecommendationChannel | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLocaleLowerCase("pt-BR");
  const aliases: Record<string, TrendRecommendationChannel> = {
    whatsapp: "WhatsApp",
    telegram: "Telegram",
    instagram: "Instagram",
    facebook: "Facebook"
  };
  const channel = aliases[normalized] ?? value;
  return isAllowed(channel, TREND_RECOMMENDATION_CHANNELS) ? channel : null;
}

function normalizeFormat(value: unknown): TrendRecommendationFormat | null {
  if (typeof value !== "string") return null;
  const aliases: Record<string, TrendRecommendationFormat> = {
    image: "imagem",
    imagem: "imagem",
    carousel: "carrossel",
    carrossel: "carrossel",
    video: "vídeo",
    vídeo: "vídeo"
  };
  const format = aliases[value.trim().toLocaleLowerCase("pt-BR")] ?? value;
  return isAllowed(format, TREND_RECOMMENDATION_FORMATS) ? format : null;
}

function parseRecommendation(response: AIProviderResponse, strategyVersion: string): AITrendRecommendation | null {
  if (!isObject(response.content)) return null;
  const value = response.content as ModelRecommendation;
  const channel = normalizeChannel(value.channel);
  const format = normalizeFormat(value.format);
  const rationale = typeof value.rationale === "string" ? value.rationale.trim() : "";
  const hypothesis = typeof value.hypothesis === "string" ? value.hypothesis.trim() : "";
  const confidence = typeof value.confidence === "number" && Number.isFinite(value.confidence)
    ? value.confidence
    : null;
  if (
    !channel ||
    !format ||
    !rationale ||
    !hypothesis ||
    containsUnsupportedPerformanceClaim(rationale) ||
    containsUnsupportedPerformanceClaim(hypothesis) ||
    confidence === null ||
    confidence < 0 ||
    confidence > 100
  ) return null;

  return {
    channel,
    format,
    rationale,
    hypothesis,
    confidence,
    strategyVersion,
    provider: response.provider,
    model: response.model
  };
}

export async function recommendTrendChannelAndFormat(
  opportunity: TrendOpportunity | null,
  context: TrendRecommendationContext,
  provider: AIProviderPort,
  options: { strategyVersion?: string; correlationId?: string } = {}
): Promise<AITrendRecommendation | null> {
  if (!opportunity?.offerId || opportunity.matchStatus !== "matched") return null;

  const strategyVersion = options.strategyVersion ?? TREND_CHANNEL_FORMAT_STRATEGY_VERSION;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await provider.generate({
        correlationId: options.correlationId ?? `trend-recommendation:${opportunity.id}`,
        timeoutMs: 30_000,
        temperature: 0,
        maxTokens: 500,
        metadata: {
          feature: "trend-channel-format-recommendation",
          strategyVersion,
          offerId: opportunity.offerId,
          marketplace: opportunity.marketplace ?? "",
          attempt
        },
        prompt: {
          system: `Você recomenda canal e formato para uma oportunidade comercial real já validada. Use somente os dados recebidos. Responda somente JSON com channel (WhatsApp, Telegram, Instagram ou Facebook), format (imagem, carrossel ou vídeo; video também é aceito), rationale, hypothesis e confidence (0-100). Não invente nem prometa CTR, cliques, conversão, vendas, comissão, ROAS, alcance, engagement, engajamento, volume, search volume, sold quantity, receita ou histórico. A hipótese deve ser qualitativa e condicional, sem métricas de performance. Baseie a justificativa nos atributos e evidências observados; se não houver histórico, não o suponha.${attempt === 1 ? " A resposta anterior foi inválida por conter afirmações de performance. Remova qualquer menção a CTR, cliques, conversão, vendas, comissão, ROAS, alcance, engagement, engajamento, volume, search volume, sold quantity ou receita. Não use aumentar, aumentarão, potencializar, taxa ou probabilidade de conversão. Responda com hipótese qualitativa sobre demonstração, adequação de canal/formato e atributos observados." : ""}`,
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
      const parsed = parseRecommendation(response, strategyVersion);
      if (parsed) return parsed;
    } catch {
      return null;
    }
  }
  return null;
}
