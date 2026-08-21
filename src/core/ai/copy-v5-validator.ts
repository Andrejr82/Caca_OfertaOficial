import type { CopyV5CommercialAngle, CopyV5Facts, CopyV5Plan } from "./copy-v5-types";

export const PROHIBITED_WORDS_REGEX = /\b(?:corre|ultimas?\s+unidades?|[uú]ltimas?\s+unidades?|imperdivel|imperd[ií]vel|so\s+hoje|s[oó]\s+hoje|estoque\s+acabando|acabando|melhor|excelente|potente|rapido|r[aá]pido|confortavel|confort[aá]vel|economico|econ[oô]mico|ideal\s+para|perfeito\s+para|vale\s+a\s+pena)\b/iu;

export function persistedStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value === "number" || typeof value === "boolean") return [String(value)];
  if (Array.isArray(value)) return value.flatMap(persistedStrings);
  if (value && typeof value === "object") return Object.entries(value).flatMap(([key, nested]) => [key, ...persistedStrings(nested)]);
  return [];
}

export function semantic(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

export function formatBRL(value: number) {
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function calculateDiscountPercent(currentPrice: number, originalPrice: number | null): number | null {
  if (!(currentPrice > 0) || !originalPrice || originalPrice <= currentPrice) return null;
  return Math.round((1 - currentPrice / originalPrice) * 100);
}

export function calculateSavingBRL(currentPrice: number, originalPrice: number | null): number | null {
  if (!(currentPrice > 0) || !originalPrice || originalPrice <= currentPrice) return null;
  return originalPrice - currentPrice;
}

export function productEmoji(facts: CopyV5Facts): string {
  const text = semantic(`${facts.category ?? ""} ${facts.productName}`);

  if (/ar condicionado|climatizador|ventilador|freezer|geladeira|refrigerador|inverter/iu.test(text)) return "❄️";
  if (/smartwatch|relogio|watch|smartband|band\s*\d+/iu.test(text)) return "⌚";
  if (/smartphone|celular|iphone|galaxy|redmi|xiaomi|poco|motorola|realme/iu.test(text)) return "📱";
  if (/fone|headset|headphone|earbuds|airpods|audio|jbl/iu.test(text)) return "🎧";
  if (/notebook|laptop|macbook|chromebook|computador|pc gamer|desktop/iu.test(text)) return "💻";
  if (/tv|smart tv|televisao|televisor|monitor/iu.test(text)) return "📺";
  if (/camera|webcam|filmadora|gopro/iu.test(text)) return "📷";
  if (/console|videogame|playstation|ps5|ps4|xbox|nintendo|switch/iu.test(text)) return "🎮";
  if (/mochila|bolsa|mala|carteira|estojo|necessaire/iu.test(text)) return "🎒";
  if (/tenis|sapato|calcado|chuteira|sandalia|chinelo|bota/iu.test(text)) return "👟";
  if (/camiseta|camisa|jaqueta|casaco|moletom|vestido|calca|bermuda|roupa|short/iu.test(text)) return "👕";
  if (/perfume|desodorante|hidratante|skincare|maquiagem|batom|shampoo|condicionador|sabonete|beleza|cosmetico|body splash/iu.test(text)) return "✨";
  if (/cafe|cafeteira|espresso|nespresso|garrafa termica|caneca|copo termico/iu.test(text)) return "☕";
  if (/fritadeira|air fryer|airfryer|panela|liquidificador|batedeira|micro ondas|fogao|cooktop|cozinha|mixer|churrasco|tramontina/iu.test(text)) return "🔥";
  if (/aspirador|robo aspirador|limpeza|sabao|amaciante|lava e seca|lava loucas|mop/iu.test(text)) return "🧹";
  if (/ferramenta|furadeira|parafusadeira|serra|trena|chave|maleta de ferramentas/iu.test(text)) return "🔧";
  if (/livro|ebook|kindle|box de livros/iu.test(text)) return "📚";
  if (/suplemento|whey|creatina|vitamina|proteina|barra de proteina/iu.test(text)) return "💪";
  if (/pet|racao|tapete higienico|arranhador|gato|cachorro|petisco/iu.test(text)) return "🐾";
  if (/bicicleta|bike|patinete|ciclismo|capacete ciclista/iu.test(text)) return "🚲";
  if (/carro|automotivo|pneu|oleo motor|palheta/iu.test(text)) return "🚗";
  if (/brinquedo|lego|boneco|boneca|jogos de tabuleiro/iu.test(text)) return "🧸";

  return "🔥";
}

export function cleanProductName(value: string): string {
  const normalized = value
    .replace(/^\s*(?:oferta|promoção|achadinho)\s*[:\-–—]\s*/iu, "")
    .replace(/\s*[|•]\s*(?:shopee|amazon|mercado livre|magalu|shein)\s*$/iu, "")
    .replace(/\s+/gu, " ")
    .trim();

  const words = normalized.split(" ");
  const key = (word: string) => word.normalize("NFD").replace(/[\u0300-\u036f]/gu, "").toLocaleLowerCase("pt-BR");

  // Remove consecutive duplicate sub-phrases
  for (let start = 0; start < words.length; start += 1) {
    for (let length = Math.floor((words.length - start) / 2); length > 0; length -= 1) {
      const left = words.slice(start, start + length).map(key).join("\0");
      const right = words.slice(start + length, start + length * 2).map(key).join("\0");
      if (left !== right) continue;
      words.splice(start + length, length);
      start = Math.max(-1, start - 1);
      break;
    }
  }

  let cleaned = words.join(" ")
    .replace(/\s+/gu, " ")
    .trim();

  if (cleaned.length <= 60) return trimDanglingWords(cleaned);
  const cut = cleaned.lastIndexOf(" ", 60);
  return trimDanglingWords(cut > 20 ? cleaned.slice(0, cut) : cleaned.slice(0, 60));
}

function trimDanglingWords(value: string): string {
  let result = value.replace(/[\s,;:–—-]+$/gu, "").trim();
  while (/\b(?:com|para|e|de|da|do|das|dos|em|no|na|nos|nas|a|o)$/iu.test(result)) {
    result = result.replace(/\s+\S+$/u, "").replace(/[\s,;:–—-]+$/gu, "").trim();
  }
  return result;
}

export function extractFactualAttributes(facts: CopyV5Facts): string[] {
  const text = `${facts.productName} ${persistedStrings(facts.evidence ?? {}).join(" ")}`;
  const sem = semantic(text);
  const attributes: string[] = [];

  // Inverter
  if (/inverter/iu.test(text)) attributes.push("Inverter");

  // BTUs
  const btuMatch = text.match(/\b(\d{4,5})\s*btus?\b/iu);
  if (btuMatch) attributes.push(`${btuMatch[1]} BTUs`);

  // Ciclo
  if (/quente\s*(?:e|\/)\s*frio/iu.test(text)) {
    attributes.push("Quente e Frio");
  } else if (/\bfrio\b/iu.test(text) && /ar condicionado|climatizador|inverter/iu.test(sem)) {
    attributes.push("Frio");
  }

  // TV Specs: Alexa, webOS, ThinQ AI, Processador α5 / A5, 4K, Full HD
  if (/\balexa\b/iu.test(text)) attributes.push("Alexa");
  if (/\bwebos\b/iu.test(text)) attributes.push("webOS");
  const procTvMatch = text.match(/\b(?:processador\s+)?(α\d|a\d(?:\s*ger\d+)?)\b/iu);
  if (procTvMatch && /tv|televisao|lg/iu.test(sem)) {
    const raw = procTvMatch[1].replace(/a/iu, "A");
    attributes.push(`Processador ${raw}`);
  }

  // Fritadeira / Air fryer
  const capMatch = text.match(/\b(\d+(?:[.,]\d+)?)\s*(?:litros?|l)\b/iu);
  if (capMatch && /air\s*fryer|airfryer|fritadeira|panela|forno/iu.test(sem)) {
    attributes.push(`${capMatch[1].replace(".", ",")} litros`);
  }
  const powerMatch = text.match(/\b(\d{3,4})\s*w\b/iu);
  if (powerMatch) attributes.push(`${powerMatch[1]}W`);

  // Smartphone / Celular
  if (/\b5g\b/iu.test(text)) attributes.push("5G");
  else if (/\b4g\b/iu.test(text)) attributes.push("4G");

  const storageMatch = text.match(/\b(64|128|256|512)\s*gb\b/iu);
  if (storageMatch && /smartphone|celular|iphone|galaxy|redmi|xiaomi|motorola/iu.test(sem)) {
    attributes.push(`${storageMatch[1]} GB`);
  }

  const screenMatch = text.match(/\btela\s*(?:de\s*)?(\d+(?:[.,]\d+)?)\s*(?:["”]|pol(?:egadas?)?)\b/iu)
    ?? text.match(/\b(\d+(?:[.,]\d+)?)\s*["”]\b/iu);
  if (screenMatch && /smartphone|celular|tv|monitor|notebook/iu.test(sem)) {
    const size = screenMatch[1].replace(".", ",");
    attributes.push(`Tela ${size}"`);
  }

  // Notebook specs
  const ramMatch = text.match(/\b(\d{1,2})\s*gb\s*ram\b/iu) ?? text.match(/\b(\d{1,2}gb)\s*ram\b/iu);
  if (ramMatch) attributes.push(`${ramMatch[1].toUpperCase().replace("RAM", "").trim()} GB RAM`);

  const ssdMatch = text.match(/\b(ssd\s*de\s*\d+\s*(?:gb|tb)|\d+\s*(?:gb|tb)\s*ssd)\b/iu);
  if (ssdMatch) attributes.push(ssdMatch[1].toUpperCase());

  const procMatch = text.match(/\b(ryzen\s*\d|core\s*i\d|intel\s*core\s*i\d|snapdragon\s*\d+)\b/iu);
  if (procMatch) {
    const rawProc = procMatch[1];
    attributes.push(rawProc.charAt(0).toUpperCase() + rawProc.slice(1));
  }

  // Mochila
  if (/à\s+prova\s+d['’]água|imperme[aá]vel/iu.test(text)) attributes.push("À prova d'água");
  if (/expans[ií]vel/iu.test(text)) attributes.push("Expansível");
  if (/refor[cç]ada/iu.test(text)) attributes.push("Reforçada");

  // Áudio / Conectividade
  if (/bluetooth/iu.test(text) && !attributes.includes("Bluetooth")) attributes.push("Bluetooth");
  if (/sem\s+fio/iu.test(text)) attributes.push("Sem fio");
  if (/cancelamento\s+de\s+ru[ií]do/iu.test(text)) attributes.push("Cancelamento de ruído");

  // Voltagem
  const voltMatch = text.match(/\b(110v|127v|220v|bivolt)\b/iu);
  if (voltMatch) {
    const v = voltMatch[1].toUpperCase();
    attributes.push(v === "BIVOLT" ? "Bivolt" : v);
  }

  const unique = Array.from(new Set(attributes));
  return unique.slice(0, 3);
}

export function validateProofAngle(facts: CopyV5Facts, candidate: string | null | undefined): string | null {
  const ev = (facts.evidence && typeof facts.evidence === "object" ? facts.evidence : {}) as Record<string, unknown>;
  const evidenceText = persistedStrings(facts.evidence ?? {}).join(" | ");
  const normalized = semantic(evidenceText);

  // Bestseller rank
  const positionMatch = evidenceText.match(/(?:BEST[_\s-]?SELLER|mais\s+vendid[oa]|bestseller)[^\d#]{0,24}#?\s*(\d{1,3})/iu)
    ?? evidenceText.match(/(?:pos(?:ition|icao|ição)?)[^\d]{0,8}#?\s*(\d{1,3})/iu);
  if (positionMatch && /best seller|bestseller|mais vendido/iu.test(normalized)) {
    return `⭐ Top #${positionMatch[1]} entre os mais vendidos no marketplace.`;
  }
  if (/best seller|bestseller|mais vendido/iu.test(normalized)) {
    return "⭐ Entre os mais vendidos no marketplace.";
  }

  // Reviews with substantial volume (>= 1000 reviews)
  let reviewCount: number | null = null;
  const directCount = ev.reviews_count ?? ev.reviewsCount ?? ev.review_count ?? ev.reviewCount ?? ev.total_reviews ?? ev.totalReviews;
  if (typeof directCount === "number") {
    if (directCount >= 1000) reviewCount = directCount;
  } else if (typeof directCount === "string") {
    const parsed = parseInt(directCount.replace(/\D/g, ""), 10);
    if (parsed >= 1000) reviewCount = parsed;
  }

  if (reviewCount === null) {
    const countMatch = evidenceText.match(/(?:reviews_count|reviewsCount|total_reviews|avalia[cç][õo]es|reviews)[^\d]{0,10}(\d{1,3}(?:\.\d{3})*|\d+)/iu);
    if (countMatch) {
      const cleaned = countMatch[1].replace(/\./g, "");
      const parsed = parseInt(cleaned, 10);
      if (parsed >= 1000) reviewCount = parsed;
    }
  }

  let ratingNum: number | null = null;
  const directRating = ev.rating ?? ev.rating_score ?? ev.score;
  if (typeof directRating === "number") {
    if (directRating >= 4 && directRating <= 5) ratingNum = directRating;
  } else if (typeof directRating === "string") {
    const parsed = Number(directRating.replace(",", "."));
    if (parsed >= 4 && parsed <= 5) ratingNum = parsed;
  }

  if (reviewCount !== null && reviewCount >= 1000) {
    const countFormatted = reviewCount >= 10000
      ? `${Math.floor(reviewCount / 1000)} mil`
      : `${(reviewCount / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;

    if (ratingNum !== null) {
      const formattedRating = Number.isInteger(ratingNum)
        ? `${ratingNum}`
        : `${ratingNum.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}`;
      return `⭐ Avaliação ${formattedRating}/5 com mais de ${countFormatted} avaliações.`;
    }
    return `⭐ Mais de ${countFormatted} avaliações.`;
  }

  return null;
}

export function buildFallbackFactualHook(facts: CopyV5Facts, shortName: string): { hook: string; angle: CopyV5CommercialAngle } {
  const emoji = productEmoji(facts);
  const discountPercent = calculateDiscountPercent(facts.currentPrice, facts.originalPrice);
  const savingBRL = calculateSavingBRL(facts.currentPrice, facts.originalPrice);

  // 1. Deep discount (>= 50%)
  if (discountPercent !== null && discountPercent >= 50) {
    return {
      hook: `🚨 ${discountPercent}% OFF no/na ${shortName}`,
      angle: "deep_discount",
    };
  }

  // 2. High saving (>= 300)
  if (savingBRL !== null && savingBRL >= 300) {
    const roundedSaving = Math.floor(savingBRL / 100) * 100;
    const savingText = roundedSaving >= 100 ? `mais de R$ ${roundedSaving}` : `R$ ${Math.round(savingBRL)}`;
    return {
      hook: `🔥 ${shortName} com ${savingText} de economia`,
      angle: "high_saving",
    };
  }

  // 3. Price threshold (currentPrice below landmark like 200, 300, 500, 1000)
  const landmarks = [200, 300, 500, 1000, 2000];
  const matchedLandmark = landmarks.find((lm) => facts.currentPrice > 0 && facts.currentPrice < lm && lm - facts.currentPrice <= lm * 0.25);
  if (matchedLandmark && (discountPercent !== null && discountPercent >= 20)) {
    return {
      hook: `${emoji} ${shortName} por menos de R$ ${matchedLandmark}`,
      angle: "price_threshold",
    };
  }

  // 4. Moderate saving / discount (>= 20% or >= 30)
  if (discountPercent !== null && discountPercent >= 20) {
    return {
      hook: `🔥 ${shortName} com ${discountPercent}% OFF`,
      angle: "saving",
    };
  }

  // 5. Coupon
  const ev = (facts.evidence && typeof facts.evidence === "object" ? facts.evidence : {}) as Record<string, unknown>;
  const hasCoupon = Boolean(ev.coupon || ev.cupom || ev.coupon_code || ev.couponCode);
  if (hasCoupon) {
    return {
      hook: `🎟️ Tem cupom no/na ${shortName}`,
      angle: "coupon",
    };
  }

  // 6. Free Shipping
  if (facts.freeShipping === true) {
    return {
      hook: `📦 ${shortName} com frete grátis`,
      angle: "free_shipping",
    };
  }

  // 7. Standard Product
  return {
    hook: `${emoji} ${shortName}`,
    angle: "product",
  };
}

export function validateHook(
  candidateHook: string | null | undefined,
  facts: CopyV5Facts,
  shortName: string
): { hook: string; angle: CopyV5CommercialAngle } {
  if (!candidateHook || typeof candidateHook !== "string" || candidateHook.trim().length === 0) {
    return buildFallbackFactualHook(facts, shortName);
  }

  const rawHook = candidateHook.trim();

  // 1. Prohibited words / unverified urgency / adjectives
  if (PROHIBITED_WORDS_REGEX.test(rawHook)) {
    return buildFallbackFactualHook(facts, shortName);
  }

  const discountPercent = calculateDiscountPercent(facts.currentPrice, facts.originalPrice);
  const savingBRL = calculateSavingBRL(facts.currentPrice, facts.originalPrice);

  // 2. Validate claimed discount percentage
  const discountMatch = rawHook.match(/\b(\d{1,2})%\s*OFF\b/iu)
    ?? rawHook.match(/\bdesconto\s+de\s+(\d{1,2})%\b/iu)
    ?? rawHook.match(/\b(\d{1,2})%\s+de\s+desconto\b/iu);

  if (discountMatch) {
    const claimedDiscount = parseInt(discountMatch[1], 10);
    if (discountPercent === null || Math.abs(claimedDiscount - discountPercent) > 2) {
      return buildFallbackFactualHook(facts, shortName);
    }
  }

  // 3. Validate claimed savings amount
  const savingMatch = rawHook.match(/mais\s+de\s+R\$\s*(\d+)/iu)
    ?? rawHook.match(/economia\s+de\s+R\$\s*(\d+)/iu)
    ?? rawHook.match(/economize\s+R\$\s*(\d+)/iu)
    ?? rawHook.match(/baixou\s+mais\s+de\s+R\$\s*(\d+)/iu);

  if (savingMatch) {
    const claimedSaving = parseInt(savingMatch[1], 10);
    if (savingBRL === null || savingBRL < claimedSaving) {
      return buildFallbackFactualHook(facts, shortName);
    }
  }

  // 4. Validate claimed price threshold
  const thresholdMatch = rawHook.match(/por\s+menos\s+de\s+R\$\s*(\d+)/iu)
    ?? rawHook.match(/abaixo\s+de\s+R\$\s*(\d+)/iu);

  if (thresholdMatch) {
    const claimedThreshold = parseInt(thresholdMatch[1], 10);
    if (facts.currentPrice >= claimedThreshold) {
      return buildFallbackFactualHook(facts, shortName);
    }
  }

  // 5. Validate claimed coupon
  if (/\bcupom\b/iu.test(rawHook)) {
    const ev = (facts.evidence && typeof facts.evidence === "object" ? facts.evidence : {}) as Record<string, unknown>;
    const hasCoupon = Boolean(ev.coupon || ev.cupom || ev.coupon_code || ev.couponCode || /\bcupom\b/iu.test(persistedStrings(facts.evidence).join(" ")));
    if (!hasCoupon) {
      return buildFallbackFactualHook(facts, shortName);
    }
  }

  // 6. Validate claimed free shipping
  if (/\bfrete\s+gr[aá]tis\b/iu.test(rawHook)) {
    if (facts.freeShipping !== true) {
      const ev = (facts.evidence && typeof facts.evidence === "object" ? facts.evidence : {}) as Record<string, unknown>;
      const hasFreeShip = Boolean(ev.freeShipping === true || ev.free_shipping === true || ev.frete_gratis === true);
      if (!hasFreeShip) {
        return buildFallbackFactualHook(facts, shortName);
      }
    }
  }

  // Angle classification based on hook content
  let angle: CopyV5CommercialAngle = "product";
  if (discountMatch && discountPercent !== null && discountPercent >= 50) angle = "deep_discount";
  else if (savingMatch && savingBRL !== null && savingBRL >= 300) angle = "high_saving";
  else if (thresholdMatch) angle = "price_threshold";
  else if (discountMatch) angle = "saving";
  else if (/\bcupom\b/iu.test(rawHook)) angle = "coupon";
  else if (/\bfrete\s+gr[aá]tis\b/iu.test(rawHook)) angle = "free_shipping";

  return { hook: rawHook, angle };
}

export function validateAttributes(
  candidateAttributes: readonly string[] | null | undefined,
  facts: CopyV5Facts
): string[] {
  const allFactsText = `${facts.productName} ${persistedStrings(facts.evidence ?? {}).join(" ")}`;
  const semFacts = semantic(allFactsText);

  const factualExtracted = extractFactualAttributes(facts);
  if (!candidateAttributes || candidateAttributes.length === 0) {
    return factualExtracted;
  }

  const valid: string[] = [];
  for (const attr of candidateAttributes) {
    if (!attr || typeof attr !== "string") continue;
    const cleanAttr = attr.trim();
    if (cleanAttr.length === 0 || cleanAttr.length > 40) continue;

    // Check prohibited words
    if (PROHIBITED_WORDS_REGEX.test(cleanAttr)) continue;

    // Check if attribute tokens exist in facts
    const semAttr = semantic(cleanAttr);
    const words = semAttr.split(" ").filter((w) => w.length > 2);
    const matchesFact = words.length > 0 && words.every((w) => semFacts.includes(w));

    if (matchesFact) {
      valid.push(cleanAttr);
    }
  }

  const merged = Array.from(new Set([...valid, ...factualExtracted])).slice(0, 3);
  return merged.length > 0 ? merged : factualExtracted;
}

export function validateCopyV5Plan(
  candidatePlan: Partial<CopyV5Plan> | null | undefined,
  facts: CopyV5Facts
): CopyV5Plan {
  // 1. Short Product Name
  let shortProductName = cleanProductName(candidatePlan?.shortProductName?.trim() || facts.shortName?.trim() || facts.productName);
  if (shortProductName.length < 3 || PROHIBITED_WORDS_REGEX.test(shortProductName)) {
    shortProductName = cleanProductName(facts.shortName?.trim() || facts.productName);
  }

  // 2. Hook & Commercial Angle
  const { hook, angle } = validateHook(candidatePlan?.hook, facts, shortProductName);

  // 3. Selected Attributes
  const selectedAttributes = validateAttributes(candidatePlan?.selectedAttributes, facts);

  // 4. Proof Angle
  const optionalProofAngle = validateProofAngle(facts, candidatePlan?.optionalProofAngle);

  return {
    shortProductName,
    commercialAngle: angle,
    hook,
    selectedAttributes,
    optionalProofAngle,
  };
}
