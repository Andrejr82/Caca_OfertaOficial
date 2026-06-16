import { SOCIALS } from "@/config/socials";
import type { Offer } from "@/types/domain";
import type { CopyStrategy, GeneratedCopyInput } from "@/lib/ai/schemas/generated-copy.schema";

function getMarketplaceText(marketplace?: string, action: string = "Comprar"): string {
  if (!marketplace || marketplace.trim() === "" || marketplace.toLowerCase() === "loja online" || marketplace.toLowerCase() === "nenhum") {
    return `🛒 ${action}:`;
  }
  return `🛒 ${action} na ${marketplace}:`;
}

function formatPriceBlock(currentPrice: number, oldPrice?: number | null): string {
  const formatCurrency = (val: number) => 
    val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  if (oldPrice && oldPrice > currentPrice) {
    return `🔥 De ${formatCurrency(oldPrice)}\n💰 Por ${formatCurrency(currentPrice)}`;
  }
  return `💰 Apenas ${formatCurrency(currentPrice)}`;
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

    const mainText = `🚨 ${copy.headline}\n\n${copy.hook}\n\n${copy.body}\n\n${copy.cta}`;

    return `${mainText}

${priceBlock}

👉 Comente "EU QUERO" para receber o link no direct ou acesse nossa vitrine no Link da BIO:
🔗 caca-oferta-oficial.vercel.app/bio



━━━━━━━━━━━━━━━

📲 MAIS OFERTAS

📢 Telegram
${SOCIALS.telegram}

💬 WhatsApp
${SOCIALS.whatsapp}

━━━━━━━━━━━━━━━

${hashtagsStr}`;
  }

  static buildTelegramPost({ copy, copyContext, offer, affiliateLink }: BuildPostParams): string {
    const buyText = getMarketplaceText(copyContext.marketplace || offer.platform, "Comprar");
    const priceBlock = formatPriceBlock(offer.current_price, offer.old_price);

    const mainText = `🚨 *${copy.headline}*\n\n${copy.hook}\n\n${copy.body}\n\n${copy.cta}`;

    return `${mainText}

${priceBlock}

${buyText}
${affiliateLink}

━━━━━━━━━━━━━━━

📸 Instagram
${SOCIALS.instagram}

💬 WhatsApp
${SOCIALS.whatsapp}`;
  }

  static buildWhatsappPost({ copy, copyContext, offer, affiliateLink }: BuildPostParams): string {
    const buyText = getMarketplaceText(copyContext.marketplace || offer.platform, "Comprar");
    const priceBlock = formatPriceBlock(offer.current_price, offer.old_price);

    const mainText = `🚨 *${copy.headline}*\n\n${copy.hook}\n\n${copy.body}\n\n${copy.cta}`;

    return `${mainText}

${priceBlock}

${buyText}
${affiliateLink}

━━━━━━━━━━━━━━━

📢 Telegram
${SOCIALS.telegram}

📸 Instagram
${SOCIALS.instagram}`;
  }
}

