export interface SheinLinkProductReference {
  productUrl: string;
  productId: string;
  categoryId?: string;
  titleFromUrl?: string;
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function decodeUrl(value: string) {
  let decoded = value;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }
  return decoded;
}

/**
 * SHEIN OneLinks expose the attributed product URL in a hidden `#url` input.
 * The social metadata can be a generic campaign title, so this reference is
 * used only to enrich the title/evidence; price must still come from verified
 * product metadata and is never inferred from the link.
 */
export function parseSheinOneLinkHtml(html: string): SheinLinkProductReference | null {
  const normalizedHtml = html
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&")
    .replace(/\\"/g, '"');
  const input = normalizedHtml.match(/<input\b[^>]*\bid=["']url["'][^>]*>/i)?.[0];
  const valueMatch = input?.match(/\bvalue=["']([^"']+)["']/i);
  const embeddedUrl = normalizedHtml.match(/https?:\/\/(?:br\.)?shein\.com\/[^\s"'<>]+-p-\d+-cat-\d+\.html(?:\?[^\s"'<>]*)?/i)?.[0];
  const rawProductUrl = valueMatch?.[1] || embeddedUrl;
  if (!rawProductUrl) return null;
  const productUrl = decodeHtml(rawProductUrl.trim()).replace(/[\\,;}]+$/, "");
  const parsed = productUrl.match(/\/([^/?#]+)-p-(\d+)-cat-(\d+)\.html/i);
  if (!parsed) return null;
  const slug = decodeUrl(parsed[1]).replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  const titleFromUrl = slug.length >= 2 ? slug : undefined;
  return { productUrl, productId: parsed[2], categoryId: parsed[3], titleFromUrl };
}
