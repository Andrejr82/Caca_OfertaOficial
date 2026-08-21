import type { CopyV5Facts, CopyV5Plan } from "./copy-v5-types";
import {
  calculateDiscountPercent,
  calculateSavingBRL,
  formatBRL,
  productEmoji,
  semantic,
} from "./copy-v5-validator";

function trimDangling(value: string) {
  let result = value.replace(/[\s,;:–—-]+$/gu, "").trim();
  while (/\b(?:com|para|e|de|da|do|das|dos|em|no|na|nos|nas)$/iu.test(result)) {
    result = result.replace(/\s+\S+$/u, "").replace(/[\s,;:–—-]+$/gu, "").trim();
  }
  return result;
}

function compactFallback(value: string) {
  const normalized = value.replace(/\s+/gu, " ").trim();
  const words = normalized.split(" ");
  const candidate = words.slice(0, 7).join(" ");
  if (candidate.length <= 54) return trimDangling(candidate);
  const cut = candidate.lastIndexOf(" ", 54);
  return trimDangling(cut > 18 ? candidate.slice(0, cut) : candidate.slice(0, 54));
}

export function commercialShortProductName(facts: CopyV5Facts, candidate?: string | null) {
  const source = `${candidate?.trim() || facts.shortName?.trim() || facts.productName}`.replace(/\s+/gu, " ").trim();

  const tv = source.match(/\b(?:Smart\s+TV|TV)\s+([A-Za-z0-9]+)\s+(\d{2,3})\s*["”]?\s*(4K|Full\s+HD|HD)?/iu);
  if (tv) return `Smart TV ${tv[1]} ${tv[2]}"${tv[3] ? ` ${tv[3].replace(/\s+/gu, " ")}` : ""}`;

  const band = source.match(/\b(?:Smartwatch\s+)?(HUAWEI\s+Band\s+\d+[A-Za-z0-9-]*)\b/iu);
  if (band) return `Smartwatch ${band[1]}`;

  const air = source.match(/\bAr\s+Condicionado(?:\s+Inverter)?\s+([A-Za-z0-9-]+).*?\b(\d{4,5})\s*BTUs?\b/iu);
  if (air) return `Ar Condicionado ${air[1]} ${air[2]} BTUs`;

  const phone = source.match(/\b(?:Smartphone\s+)?(Samsung\s+Galaxy\s+[A-Za-z0-9-]+)(?:\s+(5G|4G))?(?:\s+(64|128|256|512)\s*GB)?/iu);
  if (phone) {
    return ["Smartphone", phone[1], phone[2], phone[3] ? `${phone[3]}GB` : null].filter(Boolean).join(" ");
  }

  const fryer = source.match(/\b(?:Fritadeira\s+Sem\s+[ÓO]leo\s+)?Air\s+Fryer\s+([A-Za-z0-9-]+).*?\b(\d+(?:[.,]\d+)?)\s*(?:Litros?|L)\b/iu);
  if (fryer) return `Air Fryer ${fryer[1]} ${fryer[2].replace(",", ".")}L`;

  return compactFallback(source);
}

function hookSubject(facts: CopyV5Facts, shortName: string) {
  const tv = shortName.match(/Smart TV\s+([A-Za-z0-9]+)\s+(\d{2,3})"/iu);
  if (tv) return `${tv[1]} ${tv[2]}"`;

  const band = shortName.match(/HUAWEI\s+Band\s+\d+[A-Za-z0-9-]*/iu);
  if (band) return band[0];

  const air = facts.productName.match(/Ar\s+Condicionado(?:\s+Inverter)?\s+([A-Za-z0-9-]+)/iu);
  if (air) return `${air[1]}${/\binverter\b/iu.test(facts.productName) ? " Inverter" : ""}`;

  const galaxy = shortName.match(/Galaxy\s+[A-Za-z0-9-]+(?:\s+5G)?/iu);
  if (galaxy) return galaxy[0];

  return compactFallback(shortName).split(" ").slice(0, 5).join(" ");
}

function factualFallbackHook(plan: CopyV5Plan, facts: CopyV5Facts, shortName: string) {
  const subject = hookSubject(facts, shortName);
  const discount = calculateDiscountPercent(facts.currentPrice, facts.originalPrice);
  const saving = calculateSavingBRL(facts.currentPrice, facts.originalPrice);
  const emoji = productEmoji(facts);

  if (plan.commercialAngle === "deep_discount" && discount !== null) {
    return `🚨 ${discount}% OFF — ${subject}`;
  }

  if (plan.commercialAngle === "high_saving" && saving !== null) {
    const floorHundreds = Math.floor(saving / 100) * 100;
    const safeSaving = floorHundreds > 0 ? floorHundreds : Math.floor(saving);
    return `🔥 Mais de ${formatBRL(safeSaving).replace(",00", "")} de economia — ${subject}`;
  }

  if (plan.commercialAngle === "price_threshold") {
    const landmarks = [200, 300, 500, 1000, 2000];
    const landmark = landmarks.find((value) => facts.currentPrice > 0 && facts.currentPrice < value);
    if (landmark) return `${emoji} ${subject} por menos de R$ ${landmark.toLocaleString("pt-BR")}`;
  }

  if (plan.commercialAngle === "saving" && discount !== null) {
    return `🔥 ${discount}% OFF — ${subject}`;
  }

  if (plan.commercialAngle === "coupon") return `🎟️ Cupom disponível — ${subject}`;
  if (plan.commercialAngle === "free_shipping") return `📦 Frete grátis — ${subject}`;
  return `${emoji} ${shortName}`;
}

function normalizeMoneyInHook(value: string) {
  return value.replace(/R\$\s*(\d{4,})\b/gu, (_match, digits: string) => `R$ ${Number(digits).toLocaleString("pt-BR")}`);
}

function polishHook(plan: CopyV5Plan, facts: CopyV5Facts, shortName: string) {
  let hook = normalizeMoneyInHook(plan.hook.replace(/\s+/gu, " ").trim());
  const problematic = hook.length > 72 || /\bno\/na\b/iu.test(hook) || /\bdo\/da\b/iu.test(hook);
  if (problematic) return factualFallbackHook(plan, facts, shortName);

  hook = hook.replace(/\bno\/na\b/giu, "—").replace(/\bdo\/da\b/giu, "—");
  return hook;
}

function dedupeAttributes(attributes: readonly string[], shortName: string) {
  const nameSem = semantic(shortName);
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of attributes) {
    const attr = raw.replace(/α(?=\d)/giu, "A").trim();
    const key = semantic(attr);
    if (!key || seen.has(key)) continue;
    const words = key.split(" ").filter(Boolean);
    if (words.length > 0 && words.every((word) => nameSem.includes(word))) continue;
    seen.add(key);
    result.push(attr);
    if (result.length === 3) break;
  }

  return result;
}

function cleanStoreLabel(value: unknown) {
  if (typeof value !== "string") return value;
  return value.replace(/\s+oficial\s*$/iu, "").trim();
}

export function polishCopyV5Facts(facts: CopyV5Facts): CopyV5Facts {
  if (!facts.evidence || typeof facts.evidence !== "object") return facts;
  const evidence = { ...facts.evidence } as Record<string, unknown>;
  const storeKeys = ["official_store_name", "officialStoreName", "seller_name", "sellerName", "store_name", "storeName"];
  for (const key of storeKeys) {
    if (key in evidence) evidence[key] = cleanStoreLabel(evidence[key]);
  }
  if (evidence.marketplace_metrics && typeof evidence.marketplace_metrics === "object") {
    const metrics = { ...(evidence.marketplace_metrics as Record<string, unknown>) };
    for (const key of storeKeys) {
      if (key in metrics) metrics[key] = cleanStoreLabel(metrics[key]);
    }
    evidence.marketplace_metrics = metrics;
  }
  return { ...facts, evidence };
}

export function polishCopyV5Plan(plan: CopyV5Plan, facts: CopyV5Facts): CopyV5Plan {
  const shortProductName = commercialShortProductName(facts, plan.shortProductName);
  return {
    ...plan,
    shortProductName,
    hook: polishHook(plan, facts, shortProductName),
    selectedAttributes: dedupeAttributes(plan.selectedAttributes, shortProductName),
  };
}
