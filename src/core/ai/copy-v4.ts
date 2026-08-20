import type { OfficialAIChannel } from "./types";

export type CopyV4CommercialAngle = "proof" | "saving" | "price" | "benefit" | "standard";

export interface CopyV4Facts {
  productName: string;
  shortName?: string | null;
  marketplace: string;
  category: string | null;
  currentPrice: number;
  originalPrice: number | null;
  evidence?: Record<string, unknown>;
  freeShipping?: boolean | null;
}

export interface ConversionCopyV4Contract {
  product: string;
  commercialAngle: CopyV4CommercialAngle;
  hook: string;
  benefitLine: string | null;
  proofLine: string | null;
  offerLine: string | null;
  cta: string;
}

function persistedStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value === "number" || typeof value === "boolean") return [String(value)];
  if (Array.isArray(value)) return value.flatMap(persistedStrings);
  if (value && typeof value === "object") return Object.entries(value).flatMap(([key, nested]) => [key, ...persistedStrings(nested)]);
  return [];
}

function semantic(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

function compactProductName(value: string) {
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (normalized.length <= 64) return normalized;
  const cut = normalized.lastIndexOf(" ", 64);
  return (cut > 20 ? normalized.slice(0, cut) : normalized.slice(0, 64)).replace(/[\s,;:–—-]+$/gu, "");
}

function formatBRL(value: number) {
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function discountPercentage(currentPrice: number, originalPrice: number | null) {
  if (!(currentPrice > 0) || !originalPrice || originalPrice <= currentPrice) return null;
  return Math.round((1 - currentPrice / originalPrice) * 100);
}

function absoluteSaving(currentPrice: number, originalPrice: number | null) {
  if (!(currentPrice > 0) || !originalPrice || originalPrice <= currentPrice) return null;
  return originalPrice - currentPrice;
}

function proofFromEvidence(facts: CopyV4Facts): string | null {
  const evidenceText = persistedStrings(facts.evidence ?? {}).join(" | ");
  const normalized = semantic(evidenceText);

  const positionMatch = evidenceText.match(/(?:BEST[_\s-]?SELLER|mais\s+vendid[oa]|bestseller)[^\d#]{0,24}#?\s*(\d{1,3})/iu)
    ?? evidenceText.match(/(?:pos(?:ition|icao|ição)?)[^\d]{0,8}#?\s*(\d{1,3})/iu);
  if (positionMatch && /best seller|bestseller|mais vendido/iu.test(normalized)) {
    return `Destaque oficial entre os mais vendidos (Top #${positionMatch[1]}).`;
  }
  if (/best seller|bestseller|mais vendido/iu.test(normalized)) {
    return "Destaque oficial entre os mais vendidos no marketplace.";
  }

  if (/loja oficial|official store|official_store/iu.test(evidenceText)) {
    return "Loja oficial identificada no marketplace.";
  }
  if (/\bmall\b/iu.test(evidenceText)) {
    return "Selo Mall identificado no marketplace.";
  }

  const ratingMatch = evidenceText.match(/(?:rating|avalia[cç][aã]o)[^\d]{0,10}(\d(?:[.,]\d)?)/iu);
  if (ratingMatch) {
    const rating = Number(ratingMatch[1].replace(",", "."));
    if (rating >= 4 && rating <= 5) return `Avaliação ${rating.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}/5 informada pelo marketplace.`;
  }

  return null;
}

function benefitFromFacts(facts: CopyV4Facts): string | null {
  const text = `${facts.productName} ${persistedStrings(facts.evidence ?? {}).join(" ")}`;
  const candidates: Array<[RegExp, string]> = [
    [/à\s+prova\s+d['’]água|imperme[aá]vel/iu, "Proteção contra água informada no produto."],
    [/expans[ií]vel/iu, "Formato expansível para ganhar espaço quando precisar."],
    [/recarreg[aá]vel/iu, "Modelo recarregável."],
    [/port[aá]til/iu, "Formato portátil para facilitar o uso no dia a dia."],
    [/bluetooth/iu, "Conectividade Bluetooth informada no produto."],
    [/bivolt|110v\/220v/iu, "Compatibilidade bivolt informada no produto."],
    [/sem\s+fio/iu, "Uso sem fio informado no produto."],
  ];
  return candidates.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}

function offerLine(facts: CopyV4Facts) {
  if (!(facts.currentPrice > 0)) return null;
  const discount = discountPercentage(facts.currentPrice, facts.originalPrice);
  const saving = absoluteSaving(facts.currentPrice, facts.originalPrice);
  if (discount !== null && saving !== null && facts.originalPrice !== null) {
    return `De ${formatBRL(facts.originalPrice)} por ${formatBRL(facts.currentPrice)} — ${discount}% OFF, economia de ${formatBRL(saving)}.`;
  }
  return `${formatBRL(facts.currentPrice)} no preço informado agora.`;
}

function resolveCommercialAngle(facts: CopyV4Facts, proofLine: string | null, benefitLine: string | null): CopyV4CommercialAngle {
  const saving = absoluteSaving(facts.currentPrice, facts.originalPrice);
  const discount = discountPercentage(facts.currentPrice, facts.originalPrice);
  if (proofLine) return "proof";
  if (saving !== null && discount !== null && (discount >= 20 || saving >= 30)) return "saving";
  if (facts.currentPrice > 0 && facts.currentPrice < 100) return "price";
  if (benefitLine) return "benefit";
  return "standard";
}

function hookFor(facts: CopyV4Facts, angle: CopyV4CommercialAngle, proofLine: string | null, benefitLine: string | null) {
  const product = compactProductName(facts.shortName?.trim() || facts.productName);
  const discount = discountPercentage(facts.currentPrice, facts.originalPrice);
  const saving = absoluteSaving(facts.currentPrice, facts.originalPrice);
  if (angle === "proof" && proofLine) return `🏆 ${product} chamou atenção pela prova do marketplace.`;
  if (angle === "saving" && saving !== null && discount !== null) return `🔥 ${product} com ${discount}% OFF e ${formatBRL(saving)} de economia.`;
  if (angle === "price" && facts.currentPrice > 0) return `💸 ${product} por ${formatBRL(facts.currentPrice)}.`;
  if (angle === "benefit" && benefitLine) return `✨ ${product}: ${benefitLine}`;
  return `✨ ${product} em destaque agora.`;
}

function channelCta(channel: OfficialAIChannel) {
  if (channel === "facebook") return "👉 Conferir o preço atual no primeiro comentário. 👇";
  if (channel === "instagram") return "🔎 Conferir o preço atual no link da bio. 👇";
  return "👉 Conferir o preço atual 👇";
}

export function buildConversionCopyV4Contract(facts: CopyV4Facts, channel: OfficialAIChannel): ConversionCopyV4Contract {
  const product = compactProductName(facts.shortName?.trim() || facts.productName);
  const proofLine = proofFromEvidence(facts);
  const benefitLine = benefitFromFacts(facts);
  const commercialAngle = resolveCommercialAngle(facts, proofLine, benefitLine);
  return {
    product,
    commercialAngle,
    hook: hookFor(facts, commercialAngle, proofLine, benefitLine),
    benefitLine,
    proofLine,
    offerLine: offerLine(facts),
    cta: channelCta(channel),
  };
}

export function buildCopyV4ChannelCopy(facts: CopyV4Facts, channel: OfficialAIChannel) {
  const contract = buildConversionCopyV4Contract(facts, channel);
  const blocks = [
    contract.hook,
    contract.benefitLine ? `✨ ${contract.benefitLine}` : null,
    contract.proofLine ? `🏆 ${contract.proofLine}` : null,
    facts.freeShipping === true ? "🚚 Frete grátis confirmado." : null,
    contract.offerLine ? `💰 ${contract.offerLine}` : null,
    contract.cta,
  ].filter((value): value is string => Boolean(value));

  const seen = new Set<string>();
  return blocks.filter((block) => {
    const key = semantic(block);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).join("\n\n");
}
