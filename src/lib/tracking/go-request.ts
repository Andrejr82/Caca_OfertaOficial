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

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) return false;

  const octets = parts.map(Number);
  if (octets.some((value) => value < 0 || value > 255)) return false;

  const [a, b] = octets;
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || a >= 224;
}

function decodeIpv4MappedIpv6(hostname: string): string | null {
  const suffix = hostname.slice("::ffff:".length);
  if (!suffix) return null;
  if (suffix.includes(".")) return suffix;

  const groups = suffix.split(":");
  if (groups.length !== 2 || groups.some((group) => !/^[0-9a-f]{1,4}$/i.test(group))) {
    return null;
  }

  const high = Number.parseInt(groups[0], 16);
  const low = Number.parseInt(groups[1], 16);
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
}

function isPrivateIpv6(hostname: string): boolean {
  if (!hostname.includes(":")) return false;

  if (
    hostname === "::"
    || hostname === "::1"
    || hostname.startsWith("fc")
    || hostname.startsWith("fd")
    || /^fe[89ab]/i.test(hostname)
  ) {
    return true;
  }

  if (hostname.startsWith("::ffff:")) {
    const mappedIpv4 = decodeIpv4MappedIpv6(hostname);
    return mappedIpv4 ? isPrivateIpv4(mappedIpv4) : true;
  }

  return false;
}

function isPrivateHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (
    normalized === "localhost"
    || normalized.endsWith(".localhost")
    || normalized.endsWith(".local")
    || normalized.endsWith(".internal")
  ) {
    return true;
  }

  return isPrivateIpv4(normalized) || isPrivateIpv6(normalized);
}

export function resolveGoAffiliateDestination(rawUrl: string): string | null {
  const value = rawUrl?.trim();
  if (!value) return null;

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (parsed.username || parsed.password) return null;
    if (isPrivateHostname(parsed.hostname)) return null;
    return value;
  } catch {
    return null;
  }
}

export function resolveTrackingSource(referer: string, channel: string): string {
  const fallback = String(channel || "").trim().slice(0, 64) || "direct";
  const value = String(referer || "").trim();
  if (!value) return fallback;

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return fallback;
    return `ref:${parsed.hostname.toLowerCase()}`;
  } catch {
    return fallback;
  }
}
