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
  const input = html.match(/<input\b[^>]*\bid=["']url["'][^>]*>/i)?.[0];
  if (!input) return null;
  const valueMatch = input.match(/\bvalue=["']([^"']+)["']/i);
  if (!valueMatch) return null;
  const productUrl = decodeHtml(valueMatch[1].trim());
  const parsed = productUrl.match(/\/([^/?#]+)-p-(\d+)-cat-(\d+)\.html/i);
  if (!parsed) return null;
  const slug = decodeUrl(parsed[1]).replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  const titleFromUrl = slug.length >= 2 ? slug : undefined;
  return { productUrl, productId: parsed[2], categoryId: parsed[3], titleFromUrl };
}
