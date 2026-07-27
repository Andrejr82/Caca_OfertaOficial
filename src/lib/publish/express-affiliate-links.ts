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

export function buildExpressAffiliateLinks(input: {
  offerId: string;
  userId: string;
  originalUrl: string;
  appUrl: string;
}) {
  const baseUrl = input.appUrl.replace(/\/$/, "");
  return EXPRESS_AFFILIATE_CHANNELS.map(({ channel, prefix }) => ({
    offer_id: input.offerId,
    user_id: input.userId,
    original_url: input.originalUrl,
    channel,
    sub_id: `${prefix}${input.offerId}`,
    tracked_url: `${baseUrl}/go/${prefix}${input.offerId}`,
  }));
}

