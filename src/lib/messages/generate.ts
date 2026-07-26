import { officialBrand } from "@/lib/env";
import type { AffiliateLink, Offer } from "@/types/domain";

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

function slugToHashtags(name: string): string {
  // Generate relevant hashtags from product name
  const words = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 5)
    .map((w) => `#${w.replace(/[^a-z0-9]/g, "")}`);

  const base = ["#ofertadodia", "#promoção", "#cupom", "#achadinho", "#desconto", "#promocao", "#oferta"];
  return [...base, ...words].join(" ");
}

export function generateInstagramMessage(offer: Offer, link: Pick<AffiliateLink, "tracked_url">) {
  const hasPrice = offer.current_price > 0;
  const discount = discountPercent(offer);
  const hashtags = slugToHashtags(offer.product_name);

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
    `📦 ${offer.product_name}`,
    `🤔 Pra quem é? Ideal pra quem busca qualidade e bom preço.`,
    `✅ Diferenciais: produto de qualidade da ${offer.platform || "loja"}.`,
    `💡 Dica: aproveite enquanto está disponível nesse preço.`,
    hasPrice ? `💰 Por apenas ${formatCurrency(offer.current_price)}${discount > 0 ? ` (${discount}% OFF)` : ""}` : "💰 Consulte o preço no anúncio",
    offer.coupon ? `🎫 Use o cupom ${offer.coupon} e economize ainda mais!` : "ℹ️ Consulte disponibilidade e condições.",
    `👉 Link na bio do @${officialBrand.instagram}`,
  ];

  return { feed, stories, reels, carousel };
}

function extractCommercialData(offer: Offer) {
  const e = offer.explainability || {};
  const m = offer.marketplace_metrics || {};
  
  return {
    pix_price: e.pix_price ?? m.pix_price,
    installment_count: e.installment_count ?? m.installment_count,
    installment_value: e.installment_value ?? m.installment_value,
    installment_interest_free: e.installment_interest_free ?? m.installment_interest_free,
    coupon_code: offer.coupon || e.coupon_code || m.coupon_code,
    coupon_description: e.coupon_description || m.coupon_description,
    coupon_application_stage: e.coupon_application_stage || m.coupon_application_stage,
    checkout_discount: e.checkout_discount ?? m.checkout_discount,
    subscription_price: e.subscription_price ?? m.subscription_price,
    prime_only: e.prime_only ?? m.prime_only,
    free_shipping: offer.shipping_free ?? e.free_shipping ?? m.free_shipping,
    seller_name: offer.seller_name || m.seller || e.seller_name,
    official_store: e.official_store ?? m.official_store,
    variation_condition: e.variation_condition || m.variation_condition,
  };
}

function generateHashtags(offer: Offer, channel: "facebook" | "telegram" | "whatsapp") {
  if (channel === "whatsapp") return "";
  
  const words = offer.product_name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 3)
    .map((w) => `#${w.replace(/[^a-z0-9]/g, "")}`);

  const categoryTag = offer.category ? `#${offer.category.replace(/[^a-zA-Z0-9]/g, "")}` : "";
  const marketplaceTag = `#${normalizeMarketplace(offer.platform).replace(/[^a-zA-Z0-9]/g, "")}`;
  
  if (channel === "facebook") {
    const base = ["#CacaOfertasOficial", marketplaceTag, categoryTag].filter(Boolean);
    const result = Array.from(new Set([...base, ...words, "#promocao"])).slice(0, 6);
    return result.join(" ");
  }
  
  if (channel === "telegram") {
    const base = [marketplaceTag, categoryTag].filter(Boolean);
    const result = Array.from(new Set([...base, ...words])).slice(0, 4);
    if (result.length < 2) result.push("#oferta");
    return result.join(" ");
  }

  return "";
}

function buildCommercialBlocks(offer: Offer, link: Pick<AffiliateLink, "tracked_url">, hashtags: string) {
  const cd = extractCommercialData(offer);
  const hasPrice = offer.current_price > 0;
  
  const blocks: string[] = [];

  blocks.push(`🔥 Achado do dia!`);
  blocks.push("");
  blocks.push(`🛍️ ${offer.product_name}`);
  blocks.push("");
  
  const storeText = cd.official_store ? `${normalizeMarketplace(offer.platform)} (Loja Oficial)` : normalizeMarketplace(offer.platform);
  blocks.push(`🏪 ${storeText}`);
  blocks.push("");

  if (hasPrice) {
    if (offer.old_price && offer.old_price > offer.current_price) {
      blocks.push(`❌ De: ${formatCurrency(offer.old_price)}`);
    }
    blocks.push(`✅ Por: ${formatCurrency(offer.current_price)}`);
    
    if (cd.pix_price && cd.pix_price < offer.current_price) {
      blocks.push(`💰 No Pix: ${formatCurrency(cd.pix_price)}`);
    }
    
    if (cd.installment_count && cd.installment_value) {
      const semJuros = cd.installment_interest_free ? " sem juros" : "";
      blocks.push(`💳 Ou ${cd.installment_count}x de ${formatCurrency(cd.installment_value)}${semJuros}`);
    }
    blocks.push("");
  }

  if (cd.coupon_code) {
    blocks.push(`🎟️ Cupom: ${cd.coupon_code}`);
    if (cd.coupon_application_stage) {
      blocks.push(`📌 Aplique ${cd.coupon_application_stage}`);
    } else if (cd.checkout_discount) {
      blocks.push(`📌 Aplique na finalização`);
    }
    blocks.push("");
  }

  const extras = [];
  if (cd.subscription_price) {
    extras.push(`🔄 Recorrência: ${formatCurrency(cd.subscription_price)}`);
  }
  if (cd.prime_only) {
    extras.push(`📦 Exclusivo Prime`);
  } else if (cd.free_shipping) {
    extras.push(`📦 Frete Grátis`);
  }
  if (cd.variation_condition) {
    extras.push(`⚠️ ${cd.variation_condition}`);
  }

  if (extras.length > 0) {
    blocks.push(...extras);
    blocks.push("");
  }

  blocks.push(`👉 Comprar:\n${link.tracked_url}`);
  
  if (hashtags) {
    blocks.push("");
    blocks.push(hashtags);
  }

  return blocks.filter(l => l !== null).join("\n").replace(/\n{3,}/g, "\n\n");
}

export function generateTelegramMessage(offer: Offer, link: Pick<AffiliateLink, "tracked_url">) {
  return buildCommercialBlocks(offer, link, generateHashtags(offer, "telegram"));
}

export function generateFacebookMessage(offer: Offer, link: Pick<AffiliateLink, "tracked_url">) {
  return buildCommercialBlocks(offer, link, generateHashtags(offer, "facebook"));
}

export function generateWhatsAppMessage(offer: Offer, link: Pick<AffiliateLink, "tracked_url">) {
  return buildCommercialBlocks(offer, link, generateHashtags(offer, "whatsapp"));
}

export function generateAllMessages(offer: Offer, link: AffiliateLink) {
  return {
    telegram: generateTelegramMessage(offer, link),
    facebook: generateFacebookMessage(offer, link),
    instagram: generateInstagramMessage(offer, link),
    whatsapp: generateWhatsAppMessage(offer, link),
  };
}
