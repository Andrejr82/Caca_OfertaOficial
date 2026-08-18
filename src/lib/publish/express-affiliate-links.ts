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

export class ExpressAffiliateDestinationError extends Error {
  readonly code = "ML_AFFILIATE_DESTINATION_NOT_APPROVED";

  constructor(message = "Destino afiliado do Mercado Livre não aprovado.") {
    super(message);
    this.name = "ExpressAffiliateDestinationError";
  }
}

/**
 * Decide o destino comercial usado pelos /go/... da Publicação Expressa.
 *
 * Para Mercado Livre, um link oficial informado pelo usuário é a autoridade de
 * monetização e deve ser preservado byte a byte. A URL resolvida/canônica serve
 * para identidade e extração, não para substituir a atribuição da Central.
 *
 * URLs comuns do Mercado Livre e links legados baseados apenas em partner_id
 * são fail-closed: não podem chegar à persistência de affiliate_links como se
 * fossem destinos monetizados aprovados.
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

  const isUnapprovedMercadoLivreInput = originalClassification.kind === "plain_product_url"
    || originalClassification.kind === "internally_generated_affiliate_url";

  if (isUnapprovedMercadoLivreInput) {
    const generatedClassification = classifyMLAffiliateInput(input.affiliateUrl?.trim() || "");
    if (generatedClassification.monetized && generatedClassification.affiliateUrl) {
      return generatedClassification.affiliateUrl;
    }
    throw new ExpressAffiliateDestinationError();
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
