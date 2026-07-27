import { officialBrand } from "@/lib/env";
import type { AffiliateLink, Offer } from "@/types/domain";

export type OfferSignals = {
  hasRealDiscount: boolean;
  discountPercent?: number;
  hasPixBenefit: boolean;
  pixSavings?: number;
  hasInstallments: boolean;
  installmentCount?: number;
  installmentValue?: number;
  interestFreeConfirmed: boolean;
  hasCoupon: boolean;
  couponCode?: string;
  couponStage?: string;
  hasFreeShipping: boolean;
  isPrimeOnly: boolean;
  hasSubscriptionPrice: boolean;
  isOfficialStore: boolean;
  hasVariationRestriction: boolean;
  isBestSeller: boolean;
  hasLimitedTimeEvidence: boolean;
};

export type CopyValidationError = {
  code: string;
  field?: string;
  message: string;
};

export type CopyValidationResult = {
  valid: boolean;
  errors: CopyValidationError[];
};

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined || value === 0) return "confira o preço atualizado no link";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function normalizeMarketplace(value: string | null | undefined) {
  const marketplace = String(value || "").trim();
  return marketplace || "Loja parceira";
}

function discountPercent(offer: Pick<Offer, "old_price" | "current_price">) {
  if (!offer.old_price || offer.old_price <= offer.current_price) return 0;
  return Math.round(((offer.old_price - offer.current_price) / offer.old_price) * 100);
}

function cleanStr(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "");
}

function toPascalCase(str: string) {
  return str.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join("");
}

export function validateLinkMarketplace(offer: Offer, link: Pick<AffiliateLink, "tracked_url">) {
  const trackedUrl = (link.tracked_url || "").toLowerCase();
  const affiliateUrl = (offer.explainability?.affiliate_url || "").toLowerCase();
  const originalUrl = (offer.original_url || "").toLowerCase();
  const platform = (offer.platform || "").toLowerCase();

  const isGoRedirect = trackedUrl.includes("/go/");
  // Se for redirect /go/, nós exigimos que a oferta possua um affiliate_url ou que a original_url possua monetização.
  const urlToCheck = isGoRedirect ? (affiliateUrl || originalUrl) : trackedUrl;

  if (platform.includes("amazon")) {
    if (!urlToCheck.includes("amazon.") && !urlToCheck.includes("amzn.to")) {
      throw new Error("Link incompatível com o marketplace");
    }
    if (!urlToCheck.includes("tag=") && !urlToCheck.includes("amzn.to") && !urlToCheck.includes("link.amazon/")) {
      throw new Error("Link incompatível com o marketplace");
    }
  } else if (platform.includes("mercado livre") || platform.includes("mercadolivre")) {
    if (!urlToCheck.includes("mercadolivre.") && !urlToCheck.includes("meli.la")) {
      throw new Error("Link incompatível com o marketplace");
    }
    if (!urlToCheck.includes("meli.la") && !urlToCheck.includes("camp=") && !urlToCheck.includes("partner_id=") && !urlToCheck.includes("afiliados")) {
      throw new Error("Link incompatível com o marketplace");
    }
  } else if (platform.includes("shopee")) {
    if (!urlToCheck.includes("shopee.") && !urlToCheck.includes("shope.ee")) {
      throw new Error("Link incompatível com o marketplace");
    }
    if (!urlToCheck.includes("shope.ee") && !urlToCheck.includes("s.shopee.com.br") && !urlToCheck.includes("aff_click") && !urlToCheck.includes("customized")) {
      throw new Error("Link incompatível com o marketplace");
    }
  }
}

export function extractCommercialData(offer: Offer) {
  const e = offer.explainability || {};
  const m = (offer.marketplace_metrics as any) || {};
  
  const isAmazon = (offer.platform || "").toLowerCase().includes("amazon");
  
  return {
    pix_price: e.pix_price ?? m.pix_price,
    installment_count: e.installment_count ?? m.installment_count,
    installment_value: e.installment_value ?? m.installment_value,
    installment_interest_free: e.installment_interest_free ?? m.installment_interest_free,
    coupon_code: offer.coupon || e.coupon_code || m.coupon_code,
    coupon_description: e.coupon_description || m.coupon_description,
    coupon_application_stage: e.coupon_application_stage || m.coupon_application_stage,
    checkout_discount: e.checkout_discount ?? m.checkout_discount,
    subscription_price: isAmazon ? (e.subscription_price ?? m.subscription_price) : undefined,
    prime_only: isAmazon ? (e.prime_only ?? m.prime_only) : undefined,
    free_shipping: offer.shipping_free ?? e.free_shipping ?? m.free_shipping,
    seller_name: offer.seller_name || m.seller || e.seller_name,
    official_store: e.official_store ?? m.official_store,
    variation_condition: e.variation_condition || m.variation_condition,
    best_seller: e.best_seller ?? m.best_seller,
    flash_sale: e.flash_sale ?? m.flash_sale,
  };
}

export function deriveOfferSignals(offer: Offer, commercialData: any): OfferSignals {
  const isAmazon = (offer.platform || "").toLowerCase().includes("amazon");

  const hasRealDiscount = offer.old_price != null && offer.current_price > 0 && offer.old_price > offer.current_price;
  const discountPct = hasRealDiscount ? Math.round(((offer.old_price! - offer.current_price) / offer.old_price!) * 100) : undefined;
  
  // Rule 9. PIX INVÁLIDO
  let hasPixBenefit = commercialData.pix_price != null && commercialData.pix_price > 0 && commercialData.pix_price < offer.current_price;
  let pixSavings = hasPixBenefit ? (offer.current_price - commercialData.pix_price) : undefined;
  if (commercialData.pix_price != null && commercialData.pix_price >= offer.current_price) {
    hasPixBenefit = false;
    pixSavings = undefined;
  }

  const hasInstallments = commercialData.installment_count != null && commercialData.installment_count > 0 && commercialData.installment_value != null && commercialData.installment_value > 0;
  
  const hasCouponCode = !!commercialData.coupon_code;
  const hasCouponStage = !!commercialData.coupon_application_stage || !!commercialData.checkout_discount;
  
  return {
    hasRealDiscount,
    discountPercent: discountPct,
    hasPixBenefit,
    pixSavings,
    hasInstallments,
    installmentCount: commercialData.installment_count,
    installmentValue: commercialData.installment_value,
    interestFreeConfirmed: commercialData.installment_interest_free === true,
    hasCoupon: hasCouponCode || hasCouponStage,
    couponCode: commercialData.coupon_code,
    couponStage: commercialData.coupon_application_stage || (commercialData.checkout_discount ? "na finalização" : undefined),
    hasFreeShipping: !!commercialData.free_shipping,
    isPrimeOnly: isAmazon ? !!commercialData.prime_only : false,
    hasSubscriptionPrice: isAmazon && commercialData.subscription_price != null && commercialData.subscription_price > 0,
    isOfficialStore: !!commercialData.official_store,
    hasVariationRestriction: !!commercialData.variation_condition,
    isBestSeller: !!commercialData.best_seller,
    hasLimitedTimeEvidence: !!commercialData.flash_sale
  };
}

// Rule 5: Aplicar exatamente a prioridade
export function selectPrimaryAngle(signals: OfferSignals): string {
  if (signals.hasCoupon) return "coupon";
  if (signals.hasRealDiscount) return "discount";
  if (signals.hasPixBenefit) return "pix";
  if (signals.hasInstallments) return "installment";
  if (signals.hasFreeShipping) return "free_shipping";
  if (signals.hasSubscriptionPrice) return "subscription";
  if (signals.isPrimeOnly) return "prime";
  if (signals.isOfficialStore) return "official_store";
  if (signals.isBestSeller) return "best_seller";
  return "simple_offer";
}

const callsByAngle: Record<string, string[]> = {
  coupon: [
    "🎟️ Cupom disponível!",
    "🏷️ Use o cupom e pague menos!"
  ],
  discount: [
    "💥 Preço caiu!",
    "📉 Desconto confirmado!",
    "🔥 Menor preço encontrado!"
  ],
  pix: [
    "💰 Menor preço no Pix!",
    "⚡ Economia pagando no Pix!"
  ],
  installment: [], // Handled dynamically
  free_shipping: [
    "📦 Frete grátis confirmado!",
    "🚚 Aproveite com frete grátis!"
  ],
  subscription: [
    "🔄 Menor preço na recorrência!"
  ],
  prime: [
    "⭐ Oferta exclusiva para Prime!"
  ],
  official_store: [
    "🏪 Oferta em loja oficial!"
  ],
  best_seller: [
    "⭐ Mais vendido em oferta!"
  ],
  simple_offer: [
    "🔥 Oferta encontrada!",
    "🛍️ Achadinho do dia!",
    "⭐ Vale conferir!"
  ]
};

// Rule 6: Variação estável (Hash determinístico)
export function selectStableCall(angle: string, fallbackId: string, channel: string, signals: OfferSignals): string {
  const str = `${fallbackId}:${channel}:${angle}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0; 
  }
  hash = Math.abs(hash);

  let list = callsByAngle[angle] || callsByAngle.simple_offer;

  // Rule 4: Chamada de parcelamento
  if (angle === "installment") {
    if (signals.interestFreeConfirmed) {
      list = ["💳 Parcele sem juros!", `🛒 Dá para dividir em ${signals.installmentCount}x!`];
    } else {
      list = [`🛒 Dá para dividir em ${signals.installmentCount}x!`];
    }
  }

  return list[hash % list.length];
}

// Block Builder
export function buildCommercialBlocks(offer: Offer, commercialData: any, signals: OfferSignals): string[] {
  const blocks: string[] = [];
  const hasPrice = offer.current_price > 0;

  blocks.push(`🛍️ ${offer.product_name}`);
  blocks.push("");
  
  const storeText = signals.isOfficialStore ? `${normalizeMarketplace(offer.platform)} (Loja Oficial)` : normalizeMarketplace(offer.platform);
  blocks.push(`🏪 ${storeText}`);
  blocks.push("");

  if (hasPrice) {
    if (signals.hasRealDiscount && offer.old_price) {
      blocks.push(`❌ De: ${formatCurrency(offer.old_price)}`);
      blocks.push(`💰 Por: ${formatCurrency(offer.current_price)} (${signals.discountPercent}% OFF)`);
    } else {
      blocks.push(`💰 Por: ${formatCurrency(offer.current_price)}`);
    }
    
    if (signals.hasPixBenefit) {
      blocks.push(`💰 No Pix: ${formatCurrency(commercialData.pix_price)}`);
    }
    
    if (signals.hasInstallments) {
      const semJuros = signals.interestFreeConfirmed ? " sem juros" : "";
      blocks.push(`💳 Ou ${signals.installmentCount}x de ${formatCurrency(signals.installmentValue)}${semJuros}`);
    }
    blocks.push("");
  }

  // Rule 10: Cupom
  if (signals.hasCoupon) {
    if (signals.couponCode) {
      blocks.push(`🎟️ Cupom: ${signals.couponCode}`);
    } else {
      blocks.push(`🎟️ Ative o cupom na página do produto`);
    }
    if (signals.couponStage) {
      blocks.push(`📌 Aplique ${signals.couponStage}`);
    }
    blocks.push("");
  }

  const extras = [];
  if (signals.hasSubscriptionPrice) {
    extras.push(`🔄 Recorrência: ${formatCurrency(commercialData.subscription_price)}`);
  }
  
  if (signals.hasFreeShipping) {
    extras.push(`📦 Frete Grátis`);
  }
  
  if (signals.isPrimeOnly) {
    extras.push(`⭐ Exclusivo Prime`);
  }
  
  if (signals.hasVariationRestriction) {
    extras.push(`⚠️ ${commercialData.variation_condition}`);
  }

  if (extras.length > 0) {
    blocks.push(...extras);
    blocks.push("");
  }

  return blocks;
}

// Rule 3: Fluxo separado e renderizador simples
export function renderCopy(call: string, blocks: string[], channel: string, link: Pick<AffiliateLink, "tracked_url">, hashtags: string, offer: any): string {
  const finalBlocks = [call, "", ...blocks];

  if (channel !== "instagram") {
    let finalUrl = "";

    // Tentar pegar do array affiliate_links injetado no offer
    if (offer && Array.isArray(offer.affiliate_links)) {
      const match = offer.affiliate_links.find((l: any) => l.channel === channel);
      if (match && match.tracked_url) {
        finalUrl = match.tracked_url;
      }
    }

    // Se não encontrou no array, verifica se o link repassado é compatível com o canal
    if (!finalUrl) {
      const prefixMap: Record<string, string> = { telegram: "tg_", whatsapp: "wp_", facebook: "fb_" };
      const requiredPrefix = prefixMap[channel];

      if (requiredPrefix && link.tracked_url) {
        // Se usar nosso redirecionador, precisa ter o prefixo correto
        if (link.tracked_url.includes("/go/")) {
          if (link.tracked_url.includes(`/go/${requiredPrefix}`)) {
            finalUrl = link.tracked_url;
          }
        } else {
          // Links diretos (ex: meli.la, amzn.to) sem nosso redirecionador são aceitos
          finalUrl = link.tracked_url;
        }
      } else if (!requiredPrefix && link.tracked_url) {
        // Se for um canal sem prefixo estrito requerido, aceitamos o link fornecido
        finalUrl = link.tracked_url;
      }
    }

    if (!finalUrl) {
      throw new Error(`Validation Error: Link incompatível ou ausente para o canal ${channel}.`);
    }

    finalBlocks.push(`👉 Comprar:\n${finalUrl}`);
  }

  if (hashtags) {
    finalBlocks.push("");
    finalBlocks.push(hashtags);
  }
  return finalBlocks.filter(l => l !== null).join("\n").replace(/\n{3,}/g, "\n\n");
}

export function validateGeneratedCopy(
  copy: string,
  offer: Offer,
  commercialData: any,
  signals: OfferSignals,
  angle: string,
  channel: string,
  hashtags: string,
  link: Pick<AffiliateLink, "tracked_url">
): CopyValidationResult {
  const errors: CopyValidationError[] = [];
  
  // Rule 8: Link Incompatível
  try {
    validateLinkMarketplace(offer, link);
  } catch (e: any) {
    errors.push({ code: "INVALID_LINK_MARKETPLACE", field: "tracked_url", message: "Link incompatível com marketplace" });
  }

  const platform = (offer.platform || "").toLowerCase();
  const isAmazon = platform.includes("amazon");

  // Rule 7: Prime/Recorrência
  if (!isAmazon) {
    if (signals.isPrimeOnly || copy.includes("Exclusivo Prime")) {
      errors.push({ code: "INVALID_PRIME", message: "Prime fora da Amazon" });
    }
    if (signals.hasSubscriptionPrice || copy.includes("Recorrência")) {
      errors.push({ code: "INVALID_SUBSCRIPTION", message: "Recorrência fora da Amazon" });
    }
  }

  // Rule 4 validation
  if (copy.includes("sem juros") && !signals.interestFreeConfirmed) {
    errors.push({ code: "UNCONFIRMED_INTEREST_FREE", message: "Sem juros não confirmado" });
  }

  if (!signals.hasRealDiscount && (copy.includes("Preço caiu") || copy.includes("Desconto"))) {
    errors.push({ code: "UNCONFIRMED_DISCOUNT", message: "Desconto sem old_price > current_price" });
  }

  // Rule 10 validation
  if (!signals.hasCoupon && (copy.includes("Cupom") || copy.includes("cupom"))) {
    errors.push({ code: "UNCONFIRMED_COUPON", message: "Cupom sem evidência" });
  }

  // Rule 9 validation
  if (commercialData.pix_price != null && commercialData.pix_price >= offer.current_price) {
    if (signals.hasPixBenefit || copy.includes("No Pix")) {
      errors.push({ code: "INVALID_PIX", message: "Pix maior ou igual ao preço atual" });
    }
  }

  // Hashtags limits
  if (channel === "whatsapp" && hashtags.trim().length > 0) {
    errors.push({ code: "WHATSAPP_HASHTAGS", message: "WhatsApp com hashtags" });
  }
  
  const tagsCount = (hashtags.match(/#/g) || []).length;
  if (channel === "facebook" && (tagsCount < 3 || tagsCount > 6)) {
    errors.push({ code: "INVALID_HASHTAGS_COUNT", message: `Facebook hashtags out of bounds: ${tagsCount}` });
  }
  if (channel === "telegram" && (tagsCount < 2 || tagsCount > 4)) {
    errors.push({ code: "INVALID_HASHTAGS_COUNT", message: `Telegram hashtags out of bounds: ${tagsCount}` });
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function generateHashtags(offer: Offer, channel: "facebook" | "telegram" | "whatsapp") {
  if (channel === "whatsapp") return "";
  
  const productWords = offer.product_name.split(/\s+/).slice(0, 2).join(" ");
  // Rule 2: Normalização Unicode corrigida
  const productTag = `#${cleanStr(toPascalCase(productWords))}`;
  const categoryTag = offer.category ? `#${cleanStr(toPascalCase(offer.category))}` : "";
  const marketplaceTag = `#${cleanStr(toPascalCase(normalizeMarketplace(offer.platform)))}`;
  
  if (channel === "facebook") {
    const base = ["#CacaOfertasOficial", productTag, categoryTag, marketplaceTag].filter(Boolean);
    const result = Array.from(new Set([...base, "#Oferta"])).slice(0, 6);
    return result.join(" ");
  }
  
  if (channel === "telegram") {
    const base = [productTag, categoryTag, marketplaceTag].filter(Boolean);
    const result = Array.from(new Set([...base])).slice(0, 4);
    if (result.length < 2) result.push("#Oferta");
    return result.join(" ");
  }

  return "";
}

// Core Engine Pipeline (Rule 3)
function processChannel(offer: Offer, link: Pick<AffiliateLink, "tracked_url">, channel: "telegram"|"facebook"|"whatsapp") {
  const commercialData = extractCommercialData(offer);
  const signals = deriveOfferSignals(offer, commercialData);
  const angle = selectPrimaryAngle(signals);
  
  // Deterministic Fallback
  const fallbackId = offer.id || (offer as any).external_id || link.tracked_url || `${offer.product_name}-${offer.platform}`;
  
  const call = selectStableCall(angle, fallbackId, channel, signals);
  const blocks = buildCommercialBlocks(offer, commercialData, signals);
  const hashtags = generateHashtags(offer, channel);
  
  const copy = renderCopy(call, blocks, channel, link, hashtags, offer);
  const validation = validateGeneratedCopy(copy, offer, commercialData, signals, angle, channel, hashtags, link);
  
  if (!validation.valid) {
    throw new Error(`Validation Error: ${validation.errors.map(e => e.message).join(", ")}`);
  }
  
  return copy;
}

export function generateTelegramMessage(offer: Offer, link: Pick<AffiliateLink, "tracked_url">) {
  return processChannel(offer, link, "telegram");
}

export function generateFacebookMessage(offer: Offer, link: Pick<AffiliateLink, "tracked_url">) {
  return processChannel(offer, link, "facebook");
}

export function generateWhatsAppMessage(offer: Offer, link: Pick<AffiliateLink, "tracked_url">) {
  return processChannel(offer, link, "whatsapp");
}

export function generateInstagramMessage(offer: Offer, link: Pick<AffiliateLink, "tracked_url">) {
  validateLinkMarketplace(offer, link);
  const hasPrice = offer.current_price > 0;
  const discount = discountPercent(offer);
  
  const productWords = offer.product_name.split(/\s+/).slice(0, 2).join(" ");
  const productTag = `#${cleanStr(toPascalCase(productWords))}`;
  const categoryTag = offer.category ? `#${cleanStr(toPascalCase(offer.category))}` : "";
  const marketplaceTag = `#${cleanStr(toPascalCase(normalizeMarketplace(offer.platform)))}`;

  const hashtagsArr = [
    "#ofertadodia", "#promocao",
    offer.coupon ? "#cupom" : "",
    "#achadinho", "#desconto", "#oferta",
    productTag, categoryTag, marketplaceTag
  ].filter(Boolean);
  const hashtags = Array.from(new Set(hashtagsArr)).join(" ");

  const priceLine = hasPrice ? `💰 ${formatCurrency(offer.current_price)}` : "💰 Confira o preço no link da bio";
  const discountLine = discount > 0 ? `📉 ${discount}% de desconto!` : "";
  const couponLine = offer.coupon ? `🎫 Cupom: ${offer.coupon}` : "";

  const feed = [
    `🔥 Achado do dia que você PRECISA ver!`,
    "",
    `${offer.product_name}`,
    "",
    `Já imaginou ter esse produto com um precinho desses? Perfeito pra quem busca qualidade e economia!`,
    "",
    priceLine,
    discountLine,
    couponLine,
    "",
    `👉 Link na bio do @${officialBrand.instagram}`,
    "",
    hashtags,
    "",
    `---`,
    `📢 Siga @${officialBrand.instagram} para mais ofertas!`,
  ].filter(Boolean).join("\n");

  const stories = [
    `🔥 Olha esse ACHADO!`,
    `${offer.product_name} — pra quem busca qualidade sem pagar caro!`,
    hasPrice ? `${formatCurrency(offer.current_price)} ${discount > 0 ? `(${discount}% OFF!)` : ""}` : "Consulte o preço no anúncio.",
    offer.coupon ? `🎫 Use o cupom: ${offer.coupon}` : "ℹ️ Consulte disponibilidade e condições.",
    `👆 Arrasta pra cima pra garantir o seu!`,
  ].filter(Boolean);

  const reels = [
    `GANCHO (0-3s): "Você NÃO vai acreditar nesse preço!" — mostrar produto na tela.`,
    `CONTEÚDO (4-20s): Apresentar ${offer.product_name}, falar dos benefícios principais e qualidade.`,
    `OFERTA (21-25s): Revelar o preço ${hasPrice ? formatCurrency(offer.current_price) : ""} com reação de surpresa.${discount > 0 ? ` ${discount}% de desconto!` : ""}`,
    `CTA (26-30s): "Acesse o link na bio para consultar a oferta e salve este Reel."`,
  ];

  const carousel = [
    `🛍️ ${offer.product_name}`,
    `🎯 Pra quem é? Ideal pra quem busca qualidade e bom preço.`,
    `⭐ Diferenciais: produto de qualidade da ${offer.platform || "loja"}.`,
    `💡 Dica: aproveite enquanto está disponível nesse preço.`,
    hasPrice ? `💰 Por apenas ${formatCurrency(offer.current_price)}${discount > 0 ? ` (${discount}% OFF)` : ""}` : "💰 Consulte o preço no anúncio",
    offer.coupon ? `🎫 Use o cupom ${offer.coupon} e economize ainda mais!` : "ℹ️ Consulte disponibilidade e condições.",
    `👉 Link na bio do @${officialBrand.instagram}`,
  ];

  return { feed, stories, reels, carousel };
}

export function generateAllMessages(offer: Offer, linksArray: AffiliateLink[]) {
  const requiredChannels = ["telegram", "whatsapp", "facebook", "instagram"];
  const safeLinks = Array.isArray(linksArray) ? linksArray : [];
  const missingChannels = requiredChannels.filter((channel) => !safeLinks.some((link) => link.channel === channel));
  if (missingChannels.length > 0) {
    throw new Error(`affiliate_links ausentes para os canais: ${missingChannels.join(", ")}`);
  }

  (offer as any).affiliate_links = safeLinks;

  const getLinkForChannel = (channel: string) => {
    const link = safeLinks.find((candidate) => candidate.channel === channel);
    if (!link) throw new Error(`affiliate_links ausentes para o canal: ${channel}`);
    return link;
  };

  return {
    telegram: generateTelegramMessage(offer, getLinkForChannel("telegram")),
    facebook: generateFacebookMessage(offer, getLinkForChannel("facebook")),
    instagram: generateInstagramMessage(offer, getLinkForChannel("instagram")),
    whatsapp: generateWhatsAppMessage(offer, getLinkForChannel("whatsapp")),
  };
}
