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
 * Links comuns do Mercado Livre não são promovidos a afiliados aqui. Nesses
 * casos, a validação de monetização do fluxo continua responsável por bloquear
 * a publicação quando não existir um destino aprovado.
 */
export function selectExpressAffiliateDestination(input: {
  originalUrl: string;
  affiliateUrl?: string;
}): string {
  const originalUrl = input.originalUrl.trim();
  const classified = classifyMLAffiliateInput(originalUrl);

  if (classified.monetized && classified.affiliateUrl) {
    return classified.affiliateUrl;
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
