import type { AIProviderPort } from "./ports";
import type { CopyV5CommercialIntent, CopyV5Facts, CopyV5Plan } from "./copy-v5-types";
import {
  calculateDiscountPercent,
  calculateSavingBRL,
  extractFactualAttributes,
  formatBRL,
  persistedStrings,
  PROHIBITED_WORDS_REGEX,
  semantic,
  validateCopyV5Plan,
} from "./copy-v5-validator";

export type CopyV5FallbackReason = "no_provider" | "provider_error" | "invalid_output" | "invalid_json";

export interface CopyV5PlanningOutcome {
  source: "llm" | "deterministic-fallback";
  fallback: boolean;
  reason: CopyV5FallbackReason | null;
  provider: string;
  model: string;
}

export const COPY_V5_SYSTEM_PROMPT = `Você é o Commercial Planner de ofertas da Official AI do Caça Oferta Oficial.
Você é o único cérebro de decisão comercial da copy. Os canais apenas renderizam o plano que você criar.
Responda EXCLUSIVAMENTE um objeto JSON válido, sem comentários, sem markdown e sem introduções.

Ordem obrigatória de decisão:
1. Identifique a intenção comercial principal: dor, desejo, rotina, economia, prova ou produto.
2. Escolha o ângulo comercial mais forte sustentado pelos fatos.
3. Crie um hook humano e específico.
4. Gere um benefício curto apenas quando ele for sustentado pelos fatos fornecidos.
5. Selecione no máximo 3 atributos objetivos.
6. Use prova social somente quando houver evidência persistida suficiente.

Campos de saída:
- "shortProductName": nome comercial curto, limpo e direto (máx ~60 caracteres).
- "commercialIntent": "pain" | "desire" | "routine" | "saving" | "proof" | "product".
- "commercialAngle": "deep_discount" | "high_saving" | "saving" | "price_threshold" | "price" | "coupon" | "free_shipping" | "official_store" | "proof" | "product" | "standard".
- "hook": gancho comercial persuasivo, conciso, humano e sustentado pelos fatos.
- "benefitLine": benefício curto e factual, ou null quando não houver suporte suficiente.
- "selectedAttributes": até 3 atributos objetivos e verdadeiros presentes nos fatos.
- "optionalProofAngle": prova social factual, ou null.

Regras obrigatórias:
- Não gere preço, preço anterior, desconto calculado, PIX, cupom, frete, estoque, urgência, marketplace, CTA ou links/URLs. Essas informações são renderizadas por outra camada.
- Nunca invente urgência, escassez, especificação, benefício técnico ou prova social.
- Vendas representam somente vendas/unidades vendidas. Nunca transforme sales/vendas em quantidade de avaliadores, clientes que avaliaram ou compradores que deram uma nota.
- Rating representa somente nota/avaliação/estrelas. Não conclua confiança, garantia ou qualidade a partir da nota.
- Não infira adequação, economia de energia, redução/otimização de consumo ou outro benefício que não esteja textual e explicitamente sustentado pelos fatos.
- Nunca use adjetivos vazios sem comprovação como "melhor", "excelente", "potente", "rápido", "confortável", "econômico", "ideal para", "perfeito para" ou "vale a pena".
- Se não houver evidência suficiente para um benefício, use benefitLine: null.
- Se não houver desconto, não invente promoção.

Exemplo de saída:
{
  "shortProductName": "Smart TV LG 43\" Full HD",
  "commercialIntent": "saving",
  "commercialAngle": "saving",
  "hook": "🔥 LG 43\" com mais de R$ 700 de economia",
  "benefitLine": "Alexa e webOS para controle e navegação na TV",
  "selectedAttributes": ["Alexa", "webOS", "Processador A5"],
  "optionalProofAngle": null
}`;

const COMMERCIAL_INTENTS: readonly CopyV5CommercialIntent[] = ["pain", "desire", "routine", "saving", "proof", "product"];
const UNSUPPORTED_INFERENCE_REGEX = /\b(?:confian[cç]a(?:\s+garantida)?|garantid[oa]s?|adequad[oa]s?\s+para|ideal\s+para|perfeit[oa]s?\s+para|economiz\w*|reduz\w*\s+(?:o\s+)?consumo|otimiz\w*\s+(?:o\s+)?consumo|confort[aá]vel|potente|r[aá]pid[oa]s?|melhor)\b/iu;
const QUANTIFIED_REVIEWER_REGEX = /(?:(?:mais\s+de\s+)?\d[\d.,]*\s+(?:clientes|compradores|pessoas|usu[aá]rios).{0,48}(?:d[aã]o|deram|avalia[cç][aã]o|nota|estrelas?)|(?:avalia[cç][aã]o|nota|estrelas?).{0,48}(?:mais\s+de\s+)?\d[\d.,]*\s+(?:clientes|compradores|pessoas|usu[aá]rios))/iu;

function normalizeCommercialIntent(value: unknown, facts: CopyV5Facts): CopyV5CommercialIntent {
  if (typeof value === "string" && COMMERCIAL_INTENTS.includes(value as CopyV5CommercialIntent)) {
    return value as CopyV5CommercialIntent;
  }
  return calculateDiscountPercent(facts.currentPrice, facts.originalPrice) !== null ? "saving" : "product";
}

function hasExplicitReviewCount(facts: CopyV5Facts): boolean {
  const ev = (facts.evidence && typeof facts.evidence === "object" ? facts.evidence : {}) as Record<string, unknown>;
  const direct = ev.reviews_count ?? ev.reviewsCount ?? ev.review_count ?? ev.reviewCount ?? ev.total_reviews ?? ev.totalReviews;
  if (typeof direct === "number") return Number.isFinite(direct) && direct >= 0;
  if (typeof direct === "string") return /\d/u.test(direct);

  const evidenceText = persistedStrings(facts.evidence ?? {}).join(" ");
  return /(?:reviews_count|review_count|total_reviews|avalia[cç][õo]es|reviews)\D{0,12}\d/iu.test(evidenceText);
}

function sanitizeCandidate(candidate: Partial<CopyV5Plan> | null, facts: CopyV5Facts): Partial<CopyV5Plan> | null {
  if (!candidate) return candidate;
  const rawHook = typeof candidate.hook === "string" ? candidate.hook.replace(/\s+/gu, " ").trim() : "";
  const invalidReviewerClaim = rawHook.length > 0 && QUANTIFIED_REVIEWER_REGEX.test(rawHook) && !hasExplicitReviewCount(facts);
  const unsupportedInference = rawHook.length > 0 && UNSUPPORTED_INFERENCE_REGEX.test(rawHook);

  if (!invalidReviewerClaim && !unsupportedInference) return candidate;
  return { ...candidate, hook: undefined };
}

function validateBenefitLine(value: unknown, facts: CopyV5Facts): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.replace(/\s+/gu, " ").trim();
  if (
    !candidate
    || candidate.length > 120
    || PROHIBITED_WORDS_REGEX.test(candidate)
    || UNSUPPORTED_INFERENCE_REGEX.test(candidate)
    || /https?:\/\//iu.test(candidate)
  ) return null;

  const factualSource = semantic([
    facts.productName,
    facts.category ?? "",
    ...extractFactualAttributes(facts),
    ...persistedStrings(facts.evidence ?? {}).slice(0, 30),
  ].join(" "));
  const meaningfulTokens = semantic(candidate)
    .split(" ")
    .filter((token) => token.length >= 4 && !/^(para|com|mais|menos|uma|esse|essa|produto|rotina)$/u.test(token));

  if (meaningfulTokens.length === 0) return null;
  const supportedCount = meaningfulTokens.filter((token) => factualSource.includes(token)).length;
  const minimumSupported = meaningfulTokens.length === 1 ? 1 : Math.ceil(meaningfulTokens.length * 0.5);
  return supportedCount >= minimumSupported ? candidate : null;
}

function finalizePlan(candidate: Partial<CopyV5Plan> | null, facts: CopyV5Facts): CopyV5Plan {
  const safeCandidate = sanitizeCandidate(candidate, facts);
  const validated = validateCopyV5Plan(safeCandidate, facts);
  return {
    ...validated,
    commercialIntent: normalizeCommercialIntent(safeCandidate?.commercialIntent, facts),
    benefitLine: validateBenefitLine(safeCandidate?.benefitLine, facts),
  };
}

export function buildCopyV5PlannerPrompt(facts: CopyV5Facts) {
  const discountPercent = calculateDiscountPercent(facts.currentPrice, facts.originalPrice);
  const savingBRL = calculateSavingBRL(facts.currentPrice, facts.originalPrice);
  const ev = (facts.evidence && typeof facts.evidence === "object" ? facts.evidence : {}) as Record<string, unknown>;

  const inputPayload = {
    productName: facts.productName,
    shortName: facts.shortName ?? null,
    category: facts.category ?? null,
    marketplace: facts.marketplace,
    currentPriceFormatted: formatBRL(facts.currentPrice),
    originalPriceFormatted: facts.originalPrice ? formatBRL(facts.originalPrice) : null,
    discountPercent: discountPercent !== null ? `${discountPercent}%` : null,
    savingAmountFormatted: savingBRL !== null ? formatBRL(savingBRL) : null,
    hasFreeShipping: facts.freeShipping === true,
    hasCoupon: Boolean(ev.coupon || ev.cupom || ev.coupon_code || ev.couponCode),
    couponCode: (ev.coupon ?? ev.cupom ?? ev.coupon_code ?? ev.couponCode) || null,
    isOfficialStore: Boolean(ev.official_store || ev.is_official_store || ev.officialStore),
    sellerName: ev.seller_name || ev.sellerName || null,
    factualAttributes: extractFactualAttributes(facts),
    evidenceStrings: persistedStrings(facts.evidence ?? {}).slice(0, 15),
  };

  return {
    system: COPY_V5_SYSTEM_PROMPT,
    user: JSON.stringify(inputPayload, null, 2),
  };
}

export function buildDeterministicFallbackPlan(facts: CopyV5Facts): CopyV5Plan {
  return finalizePlan(null, facts);
}

function reportOutcome(
  onOutcome: ((outcome: CopyV5PlanningOutcome) => void | Promise<void>) | undefined,
  outcome: CopyV5PlanningOutcome,
) {
  try {
    void onOutcome?.(outcome);
  } catch {
    // Observabilidade nunca deve interromper a geração da copy.
  }
}

export async function planCommercialCopyV5(
  facts: CopyV5Facts,
  provider?: AIProviderPort | null,
  options?: {
    correlationId?: string;
    timeoutMs?: number;
    metadata?: Readonly<Record<string, string | number | boolean>>;
    onOutcome?: (outcome: CopyV5PlanningOutcome) => void | Promise<void>;
  }
): Promise<CopyV5Plan> {
  if (!provider) {
    reportOutcome(options?.onOutcome, {
      source: "deterministic-fallback",
      fallback: true,
      reason: "no_provider",
      provider: "deterministic-fallback",
      model: "copy-v5-fallback",
    });
    return buildDeterministicFallbackPlan(facts);
  }

  const prompt = buildCopyV5PlannerPrompt(facts);

  try {
    const response = await provider.generate({
      prompt,
      correlationId: options?.correlationId ?? `copy-v5-${Date.now()}`,
      timeoutMs: options?.timeoutMs ?? 15000,
      temperature: 0.4,
      maxTokens: 1000,
      metadata: options?.metadata ?? {},
    });

    if (response.content && typeof response.content === "object") {
      reportOutcome(options?.onOutcome, {
        source: "llm",
        fallback: false,
        reason: null,
        provider: response.provider || provider.name,
        model: response.model || provider.model,
      });
      return finalizePlan(response.content as Partial<CopyV5Plan>, facts);
    }

    if (typeof response.content === "string") {
      const jsonMatch = response.content.trim().match(/\{[\s\S]*\}/u);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]) as Partial<CopyV5Plan>;
          reportOutcome(options?.onOutcome, {
            source: "llm",
            fallback: false,
            reason: null,
            provider: response.provider || provider.name,
            model: response.model || provider.model,
          });
          return finalizePlan(parsed, facts);
        } catch {
          reportOutcome(options?.onOutcome, {
            source: "deterministic-fallback",
            fallback: true,
            reason: "invalid_json",
            provider: "deterministic-fallback",
            model: "copy-v5-fallback",
          });
          return buildDeterministicFallbackPlan(facts);
        }
      }
    }

    reportOutcome(options?.onOutcome, {
      source: "deterministic-fallback",
      fallback: true,
      reason: "invalid_output",
      provider: "deterministic-fallback",
      model: "copy-v5-fallback",
    });
    return buildDeterministicFallbackPlan(facts);
  } catch {
    reportOutcome(options?.onOutcome, {
      source: "deterministic-fallback",
      fallback: true,
      reason: "provider_error",
      provider: "deterministic-fallback",
      model: "copy-v5-fallback",
    });
    return buildDeterministicFallbackPlan(facts);
  }
}
