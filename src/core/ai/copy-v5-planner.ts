import type { AIProviderPort } from "./ports";
import type { CopyV5Facts, CopyV5Plan } from "./copy-v5-types";
import {
  calculateDiscountPercent,
  calculateSavingBRL,
  cleanProductName,
  extractFactualAttributes,
  formatBRL,
  persistedStrings,
  validateCopyV5Plan,
  validateProofAngle,
} from "./copy-v5-validator";

export const COPY_V5_SYSTEM_PROMPT = `Você é o Commercial Planner de ofertas da Official AI do Caça Oferta Oficial.
Seu papel é atuar como especialista de achadinhos e promoções do e-commerce brasileiro (WhatsApp, Telegram, Facebook e Instagram).
Você decide o posicionamento comercial e o gancho da oferta com base estrita nos fatos fornecidos.
Responda EXCLUSIVAMENTE um objeto JSON válido, sem comentários, sem markdown e sem introduções.

Regras obrigatórias:
1. Decida SOMENTE:
   - "shortProductName": Nome comercial curto, limpo e direto (máx ~60 caracteres).
   - "commercialAngle": Um dos ângulos: "deep_discount" | "high_saving" | "saving" | "price_threshold" | "price" | "coupon" | "free_shipping" | "product" | "standard".
   - "hook": Gancho comercial persuasivo, conciso, humano e sustentado pelos fatos da oferta.
   - "selectedAttributes": Lista com no máximo 3 especificações técnicas/atributos objetivos e verdadeiros presentes nos fatos (ex: ["Alexa", "webOS", "Processador α5"] ou ["Inverter", "9000 BTUs", "220V"]).
   - "optionalProofAngle": Prova social apenas se houver volume expressivo nos dados (ex: "⭐ 4,9/5 com mais de 10 mil avaliações" ou "⭐ Top #14 entre os mais vendidos"), senão null.

2. Você NUNCA deve gerar diretamente:
   - preço, preço anterior, desconto calculado, PIX, cupom, frete, estoque, urgência, marketplace, CTA ou links/URLs.
   - A formatação de preços e links é feita de forma determinística por outra camada.

3. PROIBIDO INVENTAR:
   - Nunca use urgência falsa ("corre", "últimas unidades", "só hoje", "estoque acabando", "promoção acaba hoje").
   - Nunca invente adjetivos vazios sem comprovação ("melhor", "excelente", "potente", "rápido", "confortável", "econômico", "ideal para", "perfeito para", "vale a pena").
   - Se o produto não tiver desconto, faça um gancho focado no produto/especificação, sem inventar promoção.

4. Exemplo de saída:
{
  "shortProductName": "Smart TV LG 43\\" Full HD",
  "commercialAngle": "saving",
  "hook": "🔥 LG 43\\" com mais de R$ 700 de economia",
  "selectedAttributes": ["Alexa", "webOS", "Processador α5"],
  "optionalProofAngle": null
}`;

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
  return validateCopyV5Plan(null, facts);
}

export async function planCommercialCopyV5(
  facts: CopyV5Facts,
  provider?: AIProviderPort | null,
  options?: {
    correlationId?: string;
    timeoutMs?: number;
    metadata?: Readonly<Record<string, string | number | boolean>>;
  }
): Promise<CopyV5Plan> {
  if (!provider) {
    return buildDeterministicFallbackPlan(facts);
  }

  const prompt = buildCopyV5PlannerPrompt(facts);

  try {
    const response = await provider.generate({
      prompt,
      correlationId: options?.correlationId ?? `copy-v5-${Date.now()}`,
      timeoutMs: options?.timeoutMs ?? 15000,
      temperature: 0.4,
      maxTokens: 500,
      metadata: options?.metadata ?? {},
    });

    if (response.content && typeof response.content === "object") {
      return validateCopyV5Plan(response.content as Partial<CopyV5Plan>, facts);
    }

    if (typeof response.content === "string") {
      const rawText = response.content.trim();
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Partial<CopyV5Plan>;
        return validateCopyV5Plan(parsed, facts);
      }
    }

    return buildDeterministicFallbackPlan(facts);
  } catch {
    return buildDeterministicFallbackPlan(facts);
  }
}
