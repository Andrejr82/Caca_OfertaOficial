export const SHEIN_REJECTED_IMAGE_URL = "https://img.ltwebstatic.com/images3_ps1/2024/09/05/1a/17255207321b314100eb24f789bb19ac1da3624dfe.png";

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
}

export interface SheinImageDiscoveryInput {
  canonicalUrl: string;
  html: string;
  productId?: string;
  validateImage?: (url: string) => Promise<boolean>;
}

export interface SheinImageDiscoveryResult {
  candidates: SheinImageCandidate[];
  validProductImages: SheinImageCandidate[];
  rejectedAssets: string[];
  sourcesTested: SheinImageSource[];
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

function isRejectedAsset(url: string): boolean {
  return url === SHEIN_REJECTED_IMAGE_URL
    || /(?:banner|badge|flag|icon|logo|sprite|country|brasil|placeholder|avatar|nav|promotion)/i.test(url);
}

function parseSrcset(value: string): string[] {
  return value.split(",").map((entry) => entry.trim().split(/\s+/)[0]).filter(Boolean);
}

function addUrl(list: { url: string; source: SheinImageSource }[], url: string, source: SheinImageSource) {
  const normalized = url.replace(/&amp;/g, "&").replace(/\\\//g, "/").trim();
  if (isHttpImageUrl(normalized)) list.push({ url: normalized, source });
}

function extractCandidates(html: string): { url: string; source: SheinImageSource }[] {
  const found: { url: string; source: SheinImageSource }[] = [];
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
    if (src) addUrl(found, src, "img/src/srcset");
    const srcset = match.match(/\bsrcset=["']([^"']+)["']/i)?.[1] || "";
    for (const url of parseSrcset(srcset)) addUrl(found, url, "img/src/srcset");
  }

  return found;
}

async function defaultValidateImage(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      headers: { Accept: "image/*" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok || !response.headers.get("content-type")?.toLowerCase().startsWith("image/")) return false;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 4_096) return false;
    const sharpFactory = require("sharp") as (data: Buffer) => { metadata: () => Promise<{ width?: number; height?: number }> };
    const metadata = await sharpFactory(buffer).metadata();
    return (metadata.width || 0) >= 200 && (metadata.height || 0) >= 200;
  } catch {
    return false;
  }
}

export async function discoverSheinImages(input: SheinImageDiscoveryInput): Promise<SheinImageDiscoveryResult> {
  const raw = extractCandidates(input.html);
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
    if (isRejectedAsset(item.url)) {
      rejectedAssets.push(item.url);
      continue;
    }
    candidates.push({ ...item, linkedToProduct });
  }

  const validateImage = input.validateImage || defaultValidateImage;
  const validProductImages: SheinImageCandidate[] = [];
  for (const candidate of candidates) {
    if (!candidate.linkedToProduct) continue;
    if (await validateImage(candidate.url)) validProductImages.push(candidate);
  }

  return { candidates, validProductImages, rejectedAssets, sourcesTested };
}
