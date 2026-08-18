const PREVIEW_CRAWLER_PATTERNS = [
  /WhatsApp/i,
  /facebookexternalhit/i,
  /Facebot/i,
  /TelegramBot/i,
  /Twitterbot/i,
  /LinkedInBot/i,
  /Slackbot/i,
  /Discordbot/i,
  /SkypeUriPreview/i,
  /Pinterestbot/i,
] as const;

const SEARCH_CRAWLER_PATTERNS = [
  /Googlebot/i,
  /bingbot/i,
  /Applebot/i,
  /DuckDuckBot/i,
  /YandexBot/i,
  /Baiduspider/i,
] as const;

export function isPreviewCrawler(userAgent: string): boolean {
  return PREVIEW_CRAWLER_PATTERNS.some((pattern) => pattern.test(userAgent));
}

export function isNonHumanTraffic(userAgent: string): boolean {
  if (!userAgent.trim()) return false;
  return isPreviewCrawler(userAgent)
    || SEARCH_CRAWLER_PATTERNS.some((pattern) => pattern.test(userAgent));
}

export function resolveGoAffiliateDestination(rawUrl: string): string | null {
  const value = rawUrl?.trim();
  if (!value) return null;

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return value;
  } catch {
    return null;
  }
}
