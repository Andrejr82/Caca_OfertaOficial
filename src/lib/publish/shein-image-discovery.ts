export type SheinImageSource =
  | "og:image"
  | "twitter:image"
  | "json-ld"
  | "embedded-state"
  | "picture/source/srcset"
  | "img/src/srcset";

export interface SheinImageCandidate {
  url: string;
  source: SheinImageSource;
  linkedToProduct: boolean;
  alt?: string;
  width?: number;
  height?: number;
  score?: number;
}

export interface SheinImageDiscoveryInput {
  canonicalUrl: string;
  html: string;
  productId?: string;
  validateImage?: (url: string) => Promise<boolean>;
  imageMetadata?: Record<string, { width: number; height: number; contentType?: string }>;
  inspectImage?: (url: string) => Promise<{ valid: boolean; width?: number; height?: number }>;
}

export interface SheinImageDiscoveryResult {
  candidates: SheinImageCandidate[];
  validProductImages: SheinImageCandidate[];
  rejectedAssets: string[];
  sourcesTested: SheinImageSource[];
  fallbackRequired: boolean;
}

function readMeta(html: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
  );
  return match?.[1]?.replace(/&amp;/g, "&").trim() || "";
}

export function extractSheinProductId(url: string): string | undefined {
  return url.match(/(?:^|-)p-(\d+)(?:-|\.|\/|$)/i)?.[1];
}

function isHttpImageUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (parsed.protocol === "http:" || parsed.protocol === "https:")
      && /\.(?:avif|gif|jpe?g|png|webp)(?:$|[?#])/i.test(parsed.pathname + parsed.search);
  } catch {
    return false;
  }
}

function isRejectedAsset(url: string, alt = ""): boolean {
  return /(?:banner|badge|flag|icon|logo|sprite|country|brasil|placeholder|avatar|nav|promotion)/i.test(url)
    || /^(?:icon|logo|flag|badge|banner|placeholder)$/i.test(alt.trim());
}

function scoreCandidate(candidate: SheinImageCandidate, input: SheinImageDiscoveryInput, repeated: number): number {
  const alt = candidate.alt?.trim() || "";
  const metadata = input.imageMetadata?.[candidate.url];
  const width = metadata?.width || candidate.width || 0;
  const height = metadata?.height || candidate.height || 0;
  const ratio = width && height ? width / height : 1;
  let score = 0;

  if (candidate.source === "img/src/srcset" || candidate.source === "picture/source/srcset") score += 25;
  if (candidate.source === "json-ld") score += 20;
  if (candidate.source === "og:image" || candidate.source === "twitter:image") score += 5;
  if (/\/v4\/j\/spmp\//i.test(candidate.url)) score += 15;
  if (input.productId && candidate.url.includes(input.productId)) score += 20;
  if (/\b(?:vis[aã]o|view)\s*1\b/i.test(alt)) score += 50;
  else if (/\b(?:vis[aã]o|view)\s*\d+\b/i.test(alt)) score += 30;
  if (alt.length >= 10 && !/^(?:icon|logo|flag|badge|banner|placeholder)$/i.test(alt)) score += 20;
  if (!alt) score -= 15;
  if (width >= 600 && height >= 600) score += 25;
  if (width && height && ratio >= 0.7 && ratio <= 1.45) score += 15;
  if (width && height && (ratio < 0.45 || ratio > 2.2)) score -= 60;
  if (repeated > 3) score -= 35;
  return score;
}

function parseSrcset(value: string): string[] {
  return value.split(",").map((entry) => entry.trim().split(/\s+/)[0]).filter(Boolean);
}

function addUrl(
  list: { url: string; source: SheinImageSource; alt?: string; width?: number; height?: number; productId?: string }[],
  url: string,
  source: SheinImageSource,
  details: { alt?: string; width?: number; height?: number; productId?: string } = {},
) {
  const normalized = url.replace(/&amp;/g, "&").replace(/\\\//g, "/").trim();
  if (isHttpImageUrl(normalized)) list.push({ url: normalized, source, ...details });
}

function extractCandidates(html: string): { url: string; source: SheinImageSource; alt?: string; width?: number; height?: number; productId?: string }[] {
  const found: { url: string; source: SheinImageSource; alt?: string; width?: number; height?: number; productId?: string }[] = [];
  addUrl(found, readMeta(html, "og:image"), "og:image");
  addUrl(found, readMeta(html, "twitter:image"), "twitter:image");

  const jsonLdBlocks = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const block of jsonLdBlocks) {
    try {
      const value = JSON.parse(block.replace(/<script[^>]*>|<\/script>/gi, "").trim());
      const entries = Array.isArray(value) ? value : [value];
      for (const entry of entries) {
        const images = Array.isArray(entry?.image) ? entry.image : [entry?.image];
        for (const image of images) if (typeof image === "string") addUrl(found, image, "json-ld");
      }
    } catch {
      // Invalid structured data is not an image authority.
    }
  }

  const embeddedUrlPattern = /https?:\\?\/\\?\/[^"'\s<>]+?(?:\.(?:avif|gif|jpe?g|png|webp))(?:\?[^"'\s<>]*)?/gi;
  for (const match of html.match(embeddedUrlPattern) || []) addUrl(found, match, "embedded-state");

  for (const match of html.match(/<source\b[^>]*srcset=["']([^"']+)["'][^>]*>/gi) || []) {
    const srcset = match.match(/\bsrcset=["']([^"']+)["']/i)?.[1] || "";
    for (const url of parseSrcset(srcset)) addUrl(found, url, "picture/source/srcset");
  }

  for (const match of html.match(/<img\b[^>]*>/gi) || []) {
    const src = match.match(/\bsrc=["']([^"']+)["']/i)?.[1];
    const alt = match.match(/\balt=["']([^"']*)["']/i)?.[1]?.trim();
    const width = Number(match.match(/\bwidth=["'](\d+)/i)?.[1] || 0) || undefined;
    const height = Number(match.match(/\bheight=["'](\d+)/i)?.[1] || 0) || undefined;
    const productId = match.match(/\bdata-(?:product|goods|item)-id=["'](\d+)["']/i)?.[1];
    if (src) addUrl(found, src, "img/src/srcset", { alt, width, height, productId });
    const srcset = match.match(/\bsrcset=["']([^"']+)["']/i)?.[1] || "";
    for (const url of parseSrcset(srcset)) addUrl(found, url, "img/src/srcset", { alt, width, height, productId });
  }

  return found;
}

async function defaultInspectImage(url: string): Promise<{ valid: boolean; width?: number; height?: number }> {
  try {
    const response = await fetch(url, {
      headers: { Accept: "image/*" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok || !response.headers.get("content-type")?.toLowerCase().startsWith("image/")) return { valid: false };
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 4_096) return { valid: false };
    const sharpFactory = require("sharp") as (data: Buffer) => { metadata: () => Promise<{ width?: number; height?: number }> };
    const metadata = await sharpFactory(buffer).metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;
    return { valid: width >= 200 && height >= 200, width, height };
  } catch {
    return { valid: false };
  }
}

export async function discoverSheinImages(input: SheinImageDiscoveryInput): Promise<SheinImageDiscoveryResult> {
  if (/(?:risk\/challenge|captcha|page_risk_crawler_block)/i.test(input.html)) {
    return { candidates: [], validProductImages: [], rejectedAssets: [], sourcesTested: [], fallbackRequired: true };
  }
  const sourcePriority: Record<SheinImageSource, number> = {
    "og:image": 0,
    "twitter:image": 1,
    "json-ld": 2,
    "picture/source/srcset": 3,
    "img/src/srcset": 4,
    "embedded-state": 5,
  };
  const raw = extractCandidates(input.html).sort((a, b) => sourcePriority[a.source] - sourcePriority[b.source]);
  const canonicalProductId = extractSheinProductId(input.canonicalUrl);
  const linkedToProduct = Boolean(input.productId && canonicalProductId === input.productId);
  const candidates: SheinImageCandidate[] = [];
  const rejectedAssets: string[] = [];
  const sourcesTested: SheinImageSource[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    if (!sourcesTested.includes(item.source)) sourcesTested.push(item.source);
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    if (isRejectedAsset(item.url, item.alt)) {
      rejectedAssets.push(item.url);
      continue;
    }
    const embeddedIdentityEvidence = item.source !== "embedded-state"
      || Boolean(input.productId && new RegExp(`${input.productId}.{0,1200}${item.url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "is").test(input.html));
    const belongsToOtherProduct = Boolean(item.productId && input.productId && item.productId !== input.productId);
    const metadata = input.imageMetadata?.[item.url];
    if (metadata && (metadata.width < 200 || metadata.height < 200)) {
      rejectedAssets.push(item.url);
      continue;
    }
    candidates.push({
      ...item,
      width: metadata?.width || item.width,
      height: metadata?.height || item.height,
      linkedToProduct: linkedToProduct && embeddedIdentityEvidence && !belongsToOtherProduct,
    });
  }

  const validProductImages: SheinImageCandidate[] = [];
  for (const candidate of candidates) {
    if (!candidate.linkedToProduct) continue;
    const metadata = input.imageMetadata?.[candidate.url];
    const inspection = input.inspectImage
      ? await input.inspectImage(candidate.url)
      : metadata
        ? { valid: true, width: metadata.width, height: metadata.height }
        : input.validateImage
          ? { valid: await input.validateImage(candidate.url) }
          : await defaultInspectImage(candidate.url);
    const width = inspection.width || candidate.width || 0;
    const height = inspection.height || candidate.height || 0;
    const ratio = width && height ? width / height : 1;
    if (width && height && (width < 200 || height < 200 || ratio < 0.45 || ratio > 2.2)) {
      rejectedAssets.push(candidate.url);
      continue;
    }
    if (inspection.valid) validProductImages.push({ ...candidate, width, height });
  }

  for (const candidate of validProductImages) {
    candidate.score = scoreCandidate(candidate, input, raw.filter((item) => item.url === candidate.url).length);
  }
  validProductImages.sort((a, b) => (b.score || 0) - (a.score || 0));
  return { candidates, validProductImages, rejectedAssets, sourcesTested, fallbackRequired: validProductImages.length === 0 };
}
