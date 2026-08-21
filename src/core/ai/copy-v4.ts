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
  priceBlock: string | null;
  couponLine: string | null;
  shippingLine: string | null;
  officialStoreLine: string | null;
  attributesLine: string | null;
  proofLine: string | null;
  offerLine: string | null;
  benefitLine: string | null;
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

function productEmoji(facts: CopyV4Facts): string {
  const text = semantic(`${facts.category ?? ""} ${facts.productName}`);

  if (/ar condicionado|climatizador|ventilador|freezer|geladeira|refrigerador|inverter/iu.test(text)) return "❄️";
  if (/smartphone|celular|iphone|galaxy|redmi|xiaomi|poco|motorola|realme/iu.test(text)) return "📱";
  if (/fone|headset|headphone|earbuds|airpods|audio/iu.test(text)) return "🎧";
  if (/notebook|laptop|macbook|chromebook|computador|pc gamer|desktop/iu.test(text)) return "💻";
  if (/smartwatch|relogio|watch|smartband/iu.test(text)) return "⌚";
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

function hookFor(facts: CopyV4Facts): string {
  const emoji = productEmoji(facts);
  const product = compactProductName(facts.shortName?.trim() || facts.productName);
  return `${emoji} ${product}`;
}

function priceBlock(facts: CopyV4Facts): string | null {
  if (!(facts.currentPrice > 0)) return null;

  const isPix = facts.evidence && (
    facts.evidence.is_pix === true ||
    facts.evidence.payment_method === "pix" ||
    facts.evidence.paymentMethod === "pix" ||
    facts.evidence.payment === "pix" ||
    /no pix|via pix/iu.test(persistedStrings(facts.evidence).join(" "))
  );

  const isAVista = facts.evidence && (
    facts.evidence.a_vista === true ||
    facts.evidence.is_a_vista === true ||
    /à vista|a vista/iu.test(persistedStrings(facts.evidence).join(" "))
  );

  const priceSuffix = isPix ? " no PIX" : isAVista ? " à vista" : "";

  if (facts.originalPrice && facts.originalPrice > facts.currentPrice) {
    return `De ${formatBRL(facts.originalPrice)}\npor ${formatBRL(facts.currentPrice)}${priceSuffix}`;
  }

  return `${formatBRL(facts.currentPrice)}${priceSuffix}`;
}

function couponFromEvidence(facts: CopyV4Facts): string | null {
  if (!facts.evidence || typeof facts.evidence !== "object") return null;

  const ev = facts.evidence as Record<string, unknown>;
  const directCoupon = ev.coupon ?? ev.cupom ?? ev.coupon_code ?? ev.couponCode;
  const directRule = ev.coupon_rule ?? ev.couponRule ?? ev.regra_cupom;

  if (typeof directCoupon === "string" && directCoupon.trim().length > 0) {
    const code = directCoupon.trim().toUpperCase();
    if (typeof directRule === "string" && directRule.trim().length > 0) {
      return `🎟️ Cupom: ${code} — ${directRule.trim()}`;
    }
    return `🎟️ Cupom: ${code}`;
  }

  const strings = persistedStrings(facts.evidence).join(" ");
  const match = strings.match(/\bcupom(?:\s+de)?[:\s]+([A-Z0-9_-]{3,24})\b/iu);
  if (match) {
    return `🎟️ Cupom: ${match[1].toUpperCase()}`;
  }

  return null;
}

function shippingFromEvidence(facts: CopyV4Facts): string | null {
  if (facts.freeShipping === true) return "📦 Frete grátis";
  if (facts.evidence && typeof facts.evidence === "object") {
    const ev = facts.evidence as Record<string, unknown>;
    if (ev.freeShipping === true || ev.free_shipping === true || ev.frete_gratis === true) {
      return "📦 Frete grátis";
    }
  }
  return null;
}

function officialStoreFromEvidence(facts: CopyV4Facts): string | null {
  if (!facts.evidence || typeof facts.evidence !== "object") return null;

  const ev = facts.evidence as Record<string, unknown>;
  const seller = ev.seller_name ?? ev.sellerName ?? ev.store_name ?? ev.storeName ?? ev.official_store_name;

  if (typeof seller === "string" && seller.trim().length > 0) {
    return `🏪 Loja oficial ${seller.trim()}`;
  }

  const strings = persistedStrings(facts.evidence).join(" ");
  if (/loja oficial|official store|official_store/iu.test(strings)) {
    const match = strings.match(/loja oficial\s+([A-Za-z0-9À-ÿ\s]{2,30})/iu);
    if (match && !/no marketplace|identificada/iu.test(match[1])) {
      return `🏪 Loja oficial ${match[1].trim()}`;
    }
    return "🏪 Loja oficial no marketplace";
  }

  return null;
}

function attributesFromFacts(facts: CopyV4Facts): string | null {
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

  // Outros
  const bocasMatch = text.match(/\b(\d)\s*bocas?\b/iu);
  if (bocasMatch && /fogao|cooktop/iu.test(sem)) attributes.push(`${bocasMatch[1]} bocas`);

  if (/recarreg[aá]vel/iu.test(text) && !attributes.includes("Recarregável")) attributes.push("Recarregável");
  if (/port[aá]til/iu.test(text) && !attributes.includes("Portátil")) attributes.push("Portátil");

  // Voltagem
  const voltMatch = text.match(/\b(110v|127v|220v|bivolt)\b/iu);
  if (voltMatch) {
    const v = voltMatch[1].toUpperCase();
    attributes.push(v === "BIVOLT" ? "Bivolt" : v);
  }

  // Deduplicate
  const seen = new Set<string>();
  const uniqueAttributes: string[] = [];
  for (const attr of attributes) {
    const key = attr.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      uniqueAttributes.push(attr);
    }
  }

  return uniqueAttributes.length > 0 ? uniqueAttributes.join(" • ") : null;
}

function proofFromEvidence(facts: CopyV4Facts): string | null {
  const ev = (facts.evidence && typeof facts.evidence === "object" ? facts.evidence : {}) as Record<string, unknown>;
  const evidenceText = persistedStrings(facts.evidence ?? {}).join(" | ");
  const normalized = semantic(evidenceText);

  // Bestseller highlight
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

  if (ratingNum === null) {
    const ratingMatch = evidenceText.match(/(?:rating|avalia[cç][aã]o)[^\d]{0,10}(\d(?:[.,]\d)?)/iu);
    if (ratingMatch) {
      const parsed = Number(ratingMatch[1].replace(",", "."));
      if (parsed >= 4 && parsed <= 5) ratingNum = parsed;
    }
  }

  if (reviewCount !== null && reviewCount >= 1000) {
    const countFormatted = reviewCount >= 10000
      ? `${Math.floor(reviewCount / 1000)} mil`
      : reviewCount >= 1000
        ? `${(reviewCount / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`
        : reviewCount.toLocaleString("pt-BR");

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

export function getMarketplaceCtaPrefix(marketplace?: string | null): string {
  const norm = marketplace?.trim().toLowerCase();
  if (norm === "amazon") return "👉 Achado na Amazon:";
  if (norm === "mercado livre") return "👉 Achado no Mercado Livre:";
  if (norm === "shopee") return "👉 Achado na Shopee:";
  if (norm === "magalu") return "👉 Achado no Magalu:";
  if (norm === "shein") return "👉 Achado na Shein:";
  return "👉 Ver oferta:";
}

function channelCta(channel: OfficialAIChannel, marketplace?: string | null): string {
  if (channel === "facebook") return "👉 Link da oferta no primeiro comentário. 👇";
  if (channel === "instagram") return "🔎 Link da oferta na bio. 👇";
  return getMarketplaceCtaPrefix(marketplace);
}

function resolveCommercialAngle(facts: CopyV4Facts, proofLine: string | null, attributesLine: string | null): CopyV4CommercialAngle {
  const saving = absoluteSaving(facts.currentPrice, facts.originalPrice);
  const discount = discountPercentage(facts.currentPrice, facts.originalPrice);
  if (proofLine) return "proof";
  if (saving !== null && discount !== null && (discount >= 20 || saving >= 30)) return "saving";
  if (facts.currentPrice > 0 && facts.currentPrice < 100) return "price";
  if (attributesLine) return "benefit";
  return "standard";
}

export function buildConversionCopyV4Contract(facts: CopyV4Facts, channel: OfficialAIChannel): ConversionCopyV4Contract {
  const product = compactProductName(facts.shortName?.trim() || facts.productName);
  const hook = hookFor(facts);
  const price = priceBlock(facts);
  const coupon = couponFromEvidence(facts);
  const shipping = shippingFromEvidence(facts);
  const store = officialStoreFromEvidence(facts);
  const attributes = attributesFromFacts(facts);
  const proof = proofFromEvidence(facts);
  const cta = channelCta(channel, facts.marketplace);

  return {
    product,
    commercialAngle: resolveCommercialAngle(facts, proof, attributes),
    hook,
    priceBlock: price,
    couponLine: coupon,
    shippingLine: shipping,
    officialStoreLine: store,
    attributesLine: attributes,
    proofLine: proof,
    offerLine: price,
    benefitLine: attributes,
    cta,
  };
}

export function buildCopyV4ChannelCopy(facts: CopyV4Facts, channel: OfficialAIChannel) {
  const contract = buildConversionCopyV4Contract(facts, channel);
  const blocks = [
    contract.hook,
    contract.priceBlock,
    contract.couponLine,
    contract.shippingLine,
    contract.officialStoreLine,
    contract.attributesLine,
    contract.proofLine,
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
