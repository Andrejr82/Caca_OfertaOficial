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

export function generateTelegramMessage(offer: Offer, link: Pick<AffiliateLink, "tracked_url">) {
  const hasPrice = offer.current_price > 0;
  
  const priceLines = hasPrice 
    ? [
        offer.old_price && offer.old_price > offer.current_price ? `❌ De ${formatCurrency(offer.old_price)}` : null,
        `✅ Por ${formatCurrency(offer.current_price)}`
      ].filter(Boolean)
    : [`⚠️ Preço no link`];

  const lines = [
    `🚨 *${offer.product_name}*`,
    "",
    ...priceLines,
    "",
    offer.coupon ? `🎟️ Use o cupom: ${offer.coupon}\n` : null,
    `✨ link: ${link.tracked_url}`,
    "",
    `#ofertadodia #promoção #cupom #achadinho #desconto`,
    "",
    `Siga nossas Redes Sociais 👇`,
    `📸 Instagram: https://www.instagram.com/${officialBrand.instagram}`,
    `💬 WhatsApp: ${officialBrand.whatsappUrl || "https://whatsapp.com/channel/0029VbCLje16rsQz9pKFeo3c"}`
  ];

  return lines.filter(l => l !== null).join("\n");
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
    hasPrice ? `${formatCurrency(offer.current_price)} ${discount > 0 ? `(${discount}% OFF!)` : ""}` : "Preço especial por tempo limitado!",
    offer.coupon ? `🎫 Use o cupom: ${offer.coupon}` : "Corre que o estoque é limitado!",
    `👆 Arrasta pra cima pra garantir o seu!`,
  ].filter(Boolean);

  const reels = [
    `GANCHO (0-3s): "Você NÃO vai acreditar nesse preço!" — mostrar produto na tela.`,
    `CONTEÚDO (4-20s): Apresentar ${offer.product_name}, falar dos benefícios principais e qualidade.`,
    `OFERTA (21-25s): Revelar o preço ${hasPrice ? formatCurrency(offer.current_price) : ""} com reação de surpresa.${discount > 0 ? ` ${discount}% de desconto!` : ""}`,
    `CTA (26-30s): "Corre pro link na bio antes que acabe! Salva esse reel pra não perder!"`,
  ];

  const carousel = [
    `📦 ${offer.product_name}`,
    `🤔 Pra quem é? Ideal pra quem busca qualidade e bom preço.`,
    `✅ Diferenciais: produto de qualidade da ${offer.platform || "loja"}.`,
    `💡 Dica: aproveite enquanto está disponível nesse preço.`,
    hasPrice ? `💰 Por apenas ${formatCurrency(offer.current_price)}${discount > 0 ? ` (${discount}% OFF)` : ""}` : "💰 Preço especial por tempo limitado",
    offer.coupon ? `🎫 Use o cupom ${offer.coupon} e economize ainda mais!` : "⚡ Garanta antes que acabe!",
    `👉 Link na bio do @${officialBrand.instagram}`,
  ];

  return { feed, stories, reels, carousel };
}

export function generateWhatsAppMessage(offer: Offer, link: Pick<AffiliateLink, "tracked_url">) {
  const hasPrice = offer.current_price > 0;
  const couponOffer = Boolean(offer.coupon) || offer.product_name.startsWith("[CUPOM]");
  const title = couponOffer ? "CUPOM LIBERADO" : offer.product_name;
  const marketplace = normalizeMarketplace(offer.platform);

  let priceBlock = "";
  const formatCurrency = (val: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
  
  if (hasPrice) {
    if (offer.old_price && offer.old_price > offer.current_price) {
      priceBlock = `💰 De: ${formatCurrency(offer.old_price)}\n🔥 Por: ${formatCurrency(offer.current_price)}`;
    } else {
      priceBlock = `🔥 Por: ${formatCurrency(offer.current_price)}`;
    }
  } else {
    priceBlock = `💰 Confira o preço no link`;
  }

  const couponBlock = offer.coupon ? `\n🎟 Use o cupom: ${offer.coupon}` : "";

  const searchableText = `${offer.product_name}`.toLowerCase();
  const possibleBenefits = ['Prime Day', 'Black Friday', 'Oferta Relâmpago', 'Frete Grátis', 'Cashback', 'Desconto Progressivo', 'Loja Oficial', 'Oferta Exclusiva'];
  const foundBenefits = possibleBenefits.filter(b => searchableText.includes(b.toLowerCase()));
  const benefitBlock = foundBenefits.length > 0 ? `\n✨ ${foundBenefits.join(', ')}` : "";

  const ctaBase = couponOffer ? "Resgate antes que acabe" : "Garantir oferta";
  const finalCta = `🛒 ${ctaBase}`;

  const blocks = [
    `🚨 ${title}`,
    priceBlock,
    `🛒 ${marketplace}${couponBlock}${benefitBlock}`,
    `🔗 ${link.tracked_url}`,
    finalCta
  ];

  return blocks.filter(Boolean).join("\n\n");
}

export function generateAllMessages(offer: Offer, link: AffiliateLink) {
  return {
    telegram: generateTelegramMessage(offer, link),
    instagram: generateInstagramMessage(offer, link),
    whatsapp: generateWhatsAppMessage(offer, link),
  };
}

