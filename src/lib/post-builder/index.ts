import { SOCIALS } from "@/config/socials";
import type { Offer } from "@/types/domain";
import type { CopyStrategy, GeneratedCopyInput } from "@/lib/ai/schemas/generated-copy.schema";

function getMarketplaceText(marketplace?: string, action: string = "Achado"): string {
  if (!marketplace || marketplace.trim() === "" || marketplace.toLowerCase() === "loja online" || marketplace.toLowerCase() === "nenhum") {
    return `🛒 ${action} 👇🏼`;
  }
  return `🛒 ${action} ${marketplace} 👇🏼`;
}

function formatPriceBlock(currentPrice: number, oldPrice?: number | null): string {
  const formatCurrency = (val: number) => 
    val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  if (oldPrice && oldPrice > currentPrice) {
    return `de ${formatCurrency(oldPrice)}\n🔥 por ${formatCurrency(currentPrice)}`;
  }
  return `🔥 Apenas ${formatCurrency(currentPrice)}`;
}

function formatWhatsappPriceBlock(currentPrice: number, oldPrice?: number | null): string {
  const formatCurrency = (val: number) =>
    val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  if (!currentPrice || currentPrice <= 0) {
    return "💰 *PREÇO*\nConfira o preço atualizado no link";
  }

  if (oldPrice && oldPrice > currentPrice) {
    return `💰 *PREÇO*\nDe ${formatCurrency(oldPrice)}\nPor *${formatCurrency(currentPrice)}*`;
  }

  return `💰 *PREÇO*\n*${formatCurrency(currentPrice)}*`;
}

function normalizeMarketplace(marketplace?: string | null): string {
  const value = String(marketplace || "").trim();
  return value && value.toLowerCase() !== "loja online" && value.toLowerCase() !== "nenhum"
    ? value
    : "Loja parceira";
}

export interface BuildPostParams {
  copy: CopyStrategy;
  copyContext: GeneratedCopyInput; // For hashtags, etc
  offer: Offer;
  affiliateLink: string;
}

export class PostBuilder {
  static buildInstagramPost({ copy, copyContext, offer, affiliateLink }: BuildPostParams): string {
    const hashtagsStr = copyContext.hashtags && copyContext.hashtags.length > 0 ? copyContext.hashtags.join(" ") : "";
    const priceBlock = formatPriceBlock(offer.current_price, offer.old_price);
    const couponBlock = offer.coupon ? `\n🎫 Use o cupom: ${offer.coupon}\n` : '';

    const mainText = `🚨 ${copy.headline}\n\n${copy.hook}\n\n${copy.body}\n\n${copy.cta}`;

    return `${mainText}

${priceBlock}
${couponBlock}
👉 O link desta oferta está nos nossos STORIES e no LINK DA BIO! 🔗

${hashtagsStr}`;
  }

  static buildTelegramPost({ copy, copyContext, offer, affiliateLink }: BuildPostParams): string {
    const buyText = getMarketplaceText(copyContext.marketplace || offer.platform, "Achado");
    const priceBlock = formatPriceBlock(offer.current_price, offer.old_price);
    const couponBlock = offer.coupon ? `\n🎫 Use o cupom: ${offer.coupon}\n` : '';

    const mainText = `🚨 *${copy.headline}*\n\n${copy.hook}\n\n${copy.body}\n\n${copy.cta}`;

    return `${mainText}

${priceBlock}
${couponBlock}
${buyText}
🔗 ${affiliateLink}

🚨 CHAMA seus amigos para receber promoções
${SOCIALS.telegram}`;
  }

  static buildWhatsappPost({ copy, copyContext, offer, affiliateLink }: BuildPostParams): string {
    const marketplace = normalizeMarketplace(copyContext.marketplace || offer.platform);
    
    const formatCurrency = (val: number) => val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    let priceBlock = "";
    if (offer.current_price && offer.current_price > 0) {
      if (offer.old_price && offer.old_price > offer.current_price) {
        priceBlock = `💰 De: ${formatCurrency(offer.old_price)}\n🔥 Por: ${formatCurrency(offer.current_price)}`;
      } else {
        priceBlock = `🔥 Por: ${formatCurrency(offer.current_price)}`;
      }
    } else {
      priceBlock = `💰 Confira o preço no link`;
    }

    const couponBlock = offer.coupon ? `\n🎟 Use o cupom: ${offer.coupon}` : "";

    const searchableText = `${offer.product_name} ${copy.headline} ${copy.body}`.toLowerCase();
    const possibleBenefits = ['Prime Day', 'Black Friday', 'Oferta Relâmpago', 'Frete Grátis', 'Cashback', 'Desconto Progressivo', 'Loja Oficial', 'Oferta Exclusiva'];
    const foundBenefits = possibleBenefits.filter(b => searchableText.includes(b.toLowerCase()));
    const benefitBlock = foundBenefits.length > 0 ? `\n✨ ${foundBenefits.join(', ')}` : "";

    let finalCta = copy.cta.replace(/[👇⬇️⬇]/g, '').trim();
    if (!/^[🛒⚡🔥🎯]/.test(finalCta)) {
      finalCta = `🛒 ${finalCta || "Comprar agora"}`;
    }

    const blocks = [
      `🚨 ${copy.headline}`,
      priceBlock,
      `🛒 ${marketplace}${couponBlock}${benefitBlock}`,
      `🔗 ${affiliateLink}`,
      finalCta
    ];

    return blocks.filter(Boolean).join("\n\n");
  }

  static buildCouponTelegramPost({ offer, affiliateLink }: Omit<BuildPostParams, "copy" | "copyContext">): string {
    const discountText = offer.product_name.replace('[CUPOM] ', '');
    return `🚨 *CUPONS FRESQUINHOS LIBERADOS!*

🎫 Cupom: *${offer.coupon}*
💰 Benefício: ${discountText}

🏃‍♀️ Corre que esgota rápido:
🔗 ${affiliateLink}

🚨 CHAMA seus amigos para receber promoções
${SOCIALS.telegram}`;
  }

  static buildCouponWhatsappPost({ offer, affiliateLink }: Omit<BuildPostParams, "copy" | "copyContext">): string {
    const discountText = offer.product_name.replace('[CUPOM] ', '');
    const marketplace = normalizeMarketplace(offer.platform);
    return `🔥 *CUPOM LIBERADO*

🏷 *MARKETPLACE*
${marketplace}

🎟 *CUPOM*
${offer.coupon || "Confira no link"}

🚚 *BENEFÍCIO*
${discountText}

🔗 *LINK DA OFERTA*
${affiliateLink}

👇 *CTA*
Abra o link e resgate antes que acabe.`;
  }

  static buildCouponInstagramPost({ offer, affiliateLink }: Omit<BuildPostParams, "copy" | "copyContext">): string {
    const discountText = offer.product_name.replace('[CUPOM] ', '');
    return `🚨 CUPONS FRESQUINHOS LIBERADOS!

🎫 Cupom: ${offer.coupon}
💰 Benefício: ${discountText}

👉 O cupom secreto desta oferta está nos nossos STORIES e no LINK DA BIO! 🔗

#cupomdesconto #promocao #achadinhos`;
  }
}
