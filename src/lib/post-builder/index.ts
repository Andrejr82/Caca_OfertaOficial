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
👉 O link de afiliado rastreado desta oferta está nos nossos STORIES e no LINK DA BIO! 🔗

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
${SOCIALS.whatsapp}`;
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
    return `🚨 *CUPONS FRESQUINHOS LIBERADOS!*

🎫 Cupom: *${offer.coupon}*
💰 Benefício: ${discountText}

🏃‍♀️ Corre que esgota rápido:
🔗 ${affiliateLink}

🚨 CHAMA seus amigos para receber promoções
${SOCIALS.whatsapp}`;
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
