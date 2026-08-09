import type { SheinImageCandidate } from "@/lib/publish/shein-image-discovery";

export interface SheinCapturedImage {
  currentSrc?: string;
  src?: string;
  alt?: string;
  naturalWidth?: number;
  naturalHeight?: number;
  srcset?: string;
}

export interface SheinCapturePayload {
  pageUrl?: string;
  images?: SheinCapturedImage[];
}

export interface SheinCapturedImagesResult {
  pageUrl: string;
  productId?: string;
  images: SheinImageCandidate[];
}

export const SHEIN_BROWSER_CAPTURE_SNIPPET = `(() => {
  const images = Array.from(document.images).map((image) => ({
    currentSrc: image.currentSrc || "",
    src: image.src || "",
    alt: image.alt || "",
    naturalWidth: image.naturalWidth || 0,
    naturalHeight: image.naturalHeight || 0,
    srcset: image.srcset || ""
  }));
  const payload = { pageUrl: location.href, images };
  navigator.clipboard.writeText(JSON.stringify(payload));
  console.log("SHEIN_CAPTURE_JSON_COPIED", payload);
})()`;

function isSheinPageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:")
      && /(?:^|\.)shein\.com$/i.test(url.hostname);
  } catch {
    return false;
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function extractProductId(url: string): string | undefined {
  return url.match(/(?:^|-)p-(\d+)(?:-|\.|\/|$)/i)?.[1];
}

function isRejectedAsset(url: string, alt = ""): boolean {
  return /(?:banner|badge|flag|icon|logo|sprite|country|brasil|placeholder|avatar|nav|promotion)/i.test(url)
    || /^(?:icon|logo|flag|badge|banner|placeholder)$/i.test(alt.trim());
}

function rankCapturedCandidates(candidates: SheinImageCandidate[]): SheinImageCandidate[] {
  const seen = new Set<string>();
  return candidates
    .filter((candidate) => {
      if (seen.has(candidate.url) || isRejectedAsset(candidate.url, candidate.alt)) return false;
      seen.add(candidate.url);
      const width = candidate.width || 0;
      const height = candidate.height || 0;
      const ratio = width / height;
      return width >= 200 && height >= 200 && ratio >= 0.45 && ratio <= 2.2;
    })
    .map((candidate) => {
      const alt = candidate.alt?.trim() || "";
      const width = candidate.width || 0;
      const height = candidate.height || 0;
      const ratio = width / height;
      let score = 25;
      if (/\b(?:vis[aã]o|view)\s*1\b/i.test(alt)) score += 50;
      else if (/\b(?:vis[aã]o|view)\s*\d+\b/i.test(alt)) score += 30;
      if (alt.length >= 10) score += 20;
      if (width >= 600 && height >= 600) score += 25;
      if (ratio >= 0.7 && ratio <= 1.45) score += 15;
      if (!alt) score -= 15;
      return { ...candidate, score };
    })
    .sort((a, b) => (b.score || 0) - (a.score || 0));
}

export function parseSheinCapturedImages(raw: string): SheinCapturedImagesResult {
  let payload: SheinCapturePayload;
  try {
    payload = JSON.parse(raw) as SheinCapturePayload;
  } catch {
    throw new Error("SHEIN_CAPTURE_INVALID_JSON");
  }

  if (!payload || typeof payload !== "object" || !isSheinPageUrl(payload.pageUrl || "") || !Array.isArray(payload.images)) {
    throw new Error("SHEIN_CAPTURE_INVALID_PAYLOAD");
  }

  const candidates: SheinImageCandidate[] = payload.images.flatMap((image) => {
    const url = typeof image?.currentSrc === "string" && image.currentSrc.trim()
      ? image.currentSrc.trim()
      : typeof image?.src === "string" ? image.src.trim() : "";
    const width = Number(image?.naturalWidth) || 0;
    const height = Number(image?.naturalHeight) || 0;
    if (!isHttpUrl(url) || width < 200 || height < 200) return [];
    return [{
      url,
      source: "img/src/srcset" as const,
      linkedToProduct: true,
      alt: typeof image.alt === "string" ? image.alt : "",
      width,
      height,
    }];
  });

  const productId = extractProductId(payload.pageUrl || "");
  const images = rankCapturedCandidates(candidates);
  if (images.length === 0) throw new Error("SHEIN_CAPTURE_NO_IMAGES");
  return { pageUrl: payload.pageUrl || "", productId, images };
}
