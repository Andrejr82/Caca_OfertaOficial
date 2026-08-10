import type { AIProviderPort, AIProviderResponse } from "./ports";
import type { TrendSignal, TrendSignalClassification } from "@/core/trends/types";

export const TREND_COMMERCIAL_STRATEGY_VERSION = "trend-commercial-v1";

type ModelClassification = {
  commercial_relevance?: unknown;
  is_product_intent?: unknown;
  normalized_product_term?: unknown;
  category_hint?: unknown;
  decision?: unknown;
  reason?: unknown;
};

const NON_PRODUCT_CONTEXT = [
  "airlines", "companhia aérea", "companhias aéreas", "aeroporto", "viagem", "passagem aérea",
  "celebridade", "política", "eleição", "time de futebol", "notícia", "evento", "hotel"
];

function normalizedWords(value: string) {
  return value.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(\d{1,3}(?:[.,]\d{3})+)\b/g, (group) => group.replace(/[.,]/g, ""))
    .match(/[a-z0-9]+/g) ?? [];
}

function identityTokens(value: string) {
  return normalizedWords(value).filter((word) => /\d/.test(word));
}

function isNonProductContext(term: string) {
  const value = term.toLocaleLowerCase("pt-BR");
  return NON_PRODUCT_CONTEXT.some((fragment) => value.includes(fragment));
}

function extractClassification(response: AIProviderResponse): ModelClassification | null {
  if (!response.content || typeof response.content !== "object") return null;
  return response.content as ModelClassification;
}

function rejected(signal: TrendSignal, aiModel: string, reason: string, classifiedAt: string): TrendSignalClassification {
  return {
    id: "",
    signalId: signal.id,
    commercialRelevance: 0,
    isProductIntent: false,
    normalizedProductTerm: null,
    categoryHint: null,
    decision: "rejected",
    reason,
    aiModel,
    strategyVersion: TREND_COMMERCIAL_STRATEGY_VERSION,
    classifiedAt
  };
}

export async function classifyTrendSignal(
  signal: TrendSignal,
  provider: AIProviderPort,
  options: { now?: () => string; strategyVersion?: string; correlationId?: string } = {}
): Promise<TrendSignalClassification> {
  const classifiedAt = options.now?.() ?? new Date().toISOString();
  const strategyVersion = options.strategyVersion ?? TREND_COMMERCIAL_STRATEGY_VERSION;
  const aiModel = provider.model;
  const request = {
    correlationId: options.correlationId ?? `trend-classification:${signal.id}`,
    timeoutMs: 30_000,
    temperature: 0,
    maxTokens: 500,
    metadata: { feature: "trend-commercial-classification", strategyVersion },
    prompt: {
      system: `Você classifica sinais de tendência para triagem comercial de marketplace. Analise apenas o termo e a evidência recebidos. Não invente produto, marca, modelo, variante, preço, volume ou intenção. Responda somente JSON com as chaves commercial_relevance (0-100), is_product_intent (boolean), normalized_product_term (string ou null), category_hint (string ou null), decision (eligible ou rejected) e reason (string). Só use eligible quando houver produto identificável e intenção comercial clara; na dúvida use rejected.`,
      user: JSON.stringify({
        term: signal.term,
        region: signal.region,
        trend_strength: signal.trendStrength,
        trend_direction: signal.trendDirection,
        evidence: signal.evidence
      })
    }
  } as const;

  let response: AIProviderResponse;
  try {
    response = await provider.generate(request);
  } catch {
    return rejected(signal, aiModel, "Classificação indisponível; decisão fail-closed.", classifiedAt);
  }

  const value = extractClassification(response);
  const relevance = typeof value?.commercial_relevance === "number" && Number.isFinite(value.commercial_relevance)
    ? Math.max(0, Math.min(100, value.commercial_relevance))
    : null;
  const productIntent = value?.is_product_intent === true;
  const normalized = typeof value?.normalized_product_term === "string" ? value.normalized_product_term.trim() : "";
  const category = typeof value?.category_hint === "string" ? value.category_hint.trim() : "";
  const reason = typeof value?.reason === "string" && value.reason.trim() ? value.reason.trim() : "Resposta sem justificativa válida.";
  const modelDecision = value?.decision === "eligible" || value?.decision === "rejected" ? value.decision : "rejected";
  const sourceWords = new Set(normalizedWords(signal.term));
  const normalizedIsDerived = normalized.length > 0 && normalizedWords(normalized).every((word) => sourceWords.has(word));
  const normalizedWordsSet = new Set(normalizedWords(normalized));
  const preservesIdentityTokens = identityTokens(signal.term).every((word) => normalizedWordsSet.has(word));
  const blocked = isNonProductContext(signal.term);
  const eligible = modelDecision === "eligible" && productIntent && relevance !== null && relevance >= 50 && normalizedIsDerived && !blocked;

  if (!eligible) {
    const failureReason = blocked
      ? "Contexto não representa produto marketplace claro."
      : !normalizedIsDerived && normalized
        ? "Produto normalizado contém termos ausentes no sinal original."
        : reason;
    return { ...rejected(signal, response.model, failureReason, classifiedAt), strategyVersion };
  }

  return {
    id: "",
    signalId: signal.id,
    commercialRelevance: relevance,
    isProductIntent: true,
    normalizedProductTerm: preservesIdentityTokens ? normalized : signal.term,
    categoryHint: category || null,
    decision: "eligible",
    reason,
    aiModel: response.model,
    strategyVersion,
    classifiedAt
  };
}
