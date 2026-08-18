import { classifyMLAffiliateInput } from "@/lib/platforms/mercadolivre-affiliate";

export const EXPRESS_AFFILIATE_CHANNELS = [
  { channel: "telegram", prefix: "tg_" },
  { channel: "whatsapp", prefix: "wp_" },
  { channel: "facebook", prefix: "fb_" },
  { channel: "instagram", prefix: "ig_" },
] as const;

export function isAmazonAffiliateInput(url: string): boolean {
  const value = url.toLowerCase();
  return value.includes("link.amazon/")
    || value.includes("amzn.to/")
    || value.includes("a.co/")
    || /[?&]tag=/.test(value);
}

export function isShopeeAffiliateInput(url: string): boolean {
  const value = url.toLowerCase();
  return value.includes("s.shopee.com.br/")
    || value.includes("shope.ee/")
    || value.includes("aff_click")
    || value.includes("customized")
    || value.includes("ext_camp")
    || value.includes("is_from_login=true");
}

/**
 * Decide o destino comercial usado pelos /go/... da Publicação Expressa.
 *
 * Para Mercado Livre, um link oficial informado pelo usuário é a autoridade de
 * monetização e deve ser preservado byte a byte. A URL resolvida/canônica serve
 * para identidade e extração, não para substituir a atribuição da Central.
 *
 * Para entradas que não sejam links oficiais ML, mantém o comportamento já
 * existente da Publicação Expressa. O fail-closed do fluxo automático é tratado
 * separadamente na Task 3 para não deixar ofertas parcialmente persistidas.
 */
export function selectExpressAffiliateDestination(input: {
  originalUrl: string;
  affiliateUrl?: string;
}): string {
  const originalUrl = input.originalUrl.trim();
  const originalClassification = classifyMLAffiliateInput(originalUrl);

  if (originalClassification.monetized && originalClassification.affiliateUrl) {
    return originalClassification.affiliateUrl;
  }

  return input.affiliateUrl?.trim() || originalUrl;
}

export function buildExpressAffiliateLinks(input: {
  offerId: string;
  userId: string;
  originalUrl: string;
  affiliateUrl?: string;
  appUrl: string;
}) {
  const baseUrl = input.appUrl.replace(/\/$/, "");
  const redirectUrl = selectExpressAffiliateDestination({
    originalUrl: input.originalUrl,
    affiliateUrl: input.affiliateUrl,
  });

  return EXPRESS_AFFILIATE_CHANNELS.map(({ channel, prefix }) => ({
    offer_id: input.offerId,
    user_id: input.userId,
    original_url: redirectUrl,
    channel,
    sub_id: `${prefix}${input.offerId}`,
    tracked_url: `${baseUrl}/go/${prefix}${input.offerId}`,
  }));
}
