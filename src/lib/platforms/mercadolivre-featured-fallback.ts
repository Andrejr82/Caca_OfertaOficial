import type { LinkMetadata } from "@/lib/publish/quality-gate";
import { Platform } from "@/types/domain";

export const ML_EXPRESS_SOURCE_PARAM = "__express_ml_source";

const SHORT_HOST = "meli.la";
const ML_HOSTS = ["mercadolivre.com.br", "mercadolibre.com"] as const;

type RecordValue = Record<string, unknown>;
type MLIdentity = { type: "item" | "product"; id: string };
type FeaturedSnapshot = {
  itemId: string;
  title: string;
  price: number;
  imageUrl: string;
  finalUrl: string;
};

function asRecord(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as RecordValue
    : null;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x3a;/gi, ":")
    .replace(/&#58;/g, ":")
    .trim();
}

function isAllowedMLHost(hostname: string, includeShort = false): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  if (includeShort && host === SHORT_HOST) return true;
  return ML_HOSTS.some((base) => host === base || host.endsWith(`.${base}`));
}

function normalizeMLId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace("-", "").toUpperCase();
  return /^MLB\d+$/.test(normalized) ? normalized : null;
}

function extractIdentityFromAllowedUrl(rawUrl: string, baseUrl: string): MLIdentity | null {
  try {
    const url = new URL(decodeHtml(rawUrl), baseUrl);
    if (url.protocol !== "https:" || !isAllowedMLHost(url.hostname)) return null;

    const pdpFilters = url.searchParams.get("pdp_filters") || "";
    const itemParam = url.searchParams.get("item_id")
      || url.searchParams.get("itemId")
      || pdpFilters.match(/(?:^|[;,&])item_id[:=](MLB-?\d+)/i)?.[1];
    const itemId = normalizeMLId(itemParam);
    if (itemId) return { type: "item", id: itemId };

    const productMatch = url.pathname.match(/\/p\/(MLB-?\d+)/i);
    if (productMatch) return { type: "product", id: normalizeMLId(productMatch[1])! };

    const itemMatch = url.pathname.match(/(MLB-?\d+)/i);
    const pathItem = normalizeMLId(itemMatch?.[1]);
    return pathItem ? { type: "item", id: pathItem } : null;
  } catch {
    return null;
  }
}

function extractBalancedJsonObject(value: string, searchFrom: number): string | null {
  const start = value.indexOf("{", searchFrom);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < value.length; index++) {
    const char = value[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") depth++;
    else if (char === "}") {
      depth--;
      if (depth === 0) return value.slice(start, index + 1);
      if (depth < 0) return null;
    }
  }
  return null;
}

function parseNordicContext(html: string): unknown | null {
  const scripts = html.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const script of scripts) {
    const openTag = script.match(/^<script\b[^>]*>/i)?.[0];
    if (!openTag || !/__NORDIC_RENDERING_CTX__/i.test(openTag)) continue;

    const rawBody = script.slice(openTag.length).replace(/<\/script>\s*$/i, "").trim();
    for (const candidate of [rawBody, decodeHtml(rawBody)]) {
      try {
        return JSON.parse(candidate);
      } catch {
        for (const pattern of [
          /(?:window\.)?__NORDIC_RENDERING_CTX__\s*=\s*/i,
          /(?:window\.)?_n\.ctx\.r\s*=\s*/i,
        ]) {
          const match = pattern.exec(candidate);
          if (!match || match.index === undefined) continue;
          const objectText = extractBalancedJsonObject(candidate, match.index + match[0].length);
          if (!objectText) continue;
          try {
            return JSON.parse(objectText);
          } catch {
            // tenta o próximo formato sem executar JavaScript
          }
        }
      }
    }
  }
  return null;
}

function isFeaturedMarker(value: unknown): boolean {
  return typeof value === "string" && value.toLowerCase() === "/home/card-featured/element";
}

function urlFragmentsHaveFeaturedMarker(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    const params = new URLSearchParams(decodeHtml(value).replace(/^\?/, ""));
    return isFeaturedMarker(params.get("c_id"));
  } catch {
    return false;
  }
}

function objectHasFeaturedMarker(value: unknown): boolean {
  const object = asRecord(value);
  if (!object) return false;
  if (isFeaturedMarker(object.c_id)) return true;
  const metadata = asRecord(object.metadata);
  return Boolean(metadata && (isFeaturedMarker(metadata.c_id) || urlFragmentsHaveFeaturedMarker(metadata.url_fragments)));
}

function findSingleFeaturedCard(context: unknown): RecordValue | null {
  const cards: RecordValue[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry);
      return;
    }
    const object = asRecord(value);
    if (!object) return;

    const polycards = object.polycards;
    if (Array.isArray(polycards)) {
      const containerFeatured = objectHasFeaturedMarker(object);
      for (const card of polycards) {
        const record = asRecord(card);
        if (record && (containerFeatured || objectHasFeaturedMarker(record))) cards.push(record);
      }
    }
    for (const child of Object.values(object)) visit(child);
  };
  visit(context);
  return cards.length === 1 ? cards[0] : null;
}

function parsePrice(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[^\d,.-]/g, "").trim();
  if (!cleaned) return null;
  let normalized = cleaned;
  if (cleaned.includes(",")) normalized = cleaned.replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 && parsed < 100_000_000 ? parsed : null;
}

type Candidate<T> = { score: number; value: T; path: string };

function walk(value: unknown, path: string[], visit: (key: string, value: unknown, path: string[]) => void): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => walk(entry, [...path, String(index)], visit));
    return;
  }
  const object = asRecord(value);
  if (!object) return;
  for (const [key, child] of Object.entries(object)) {
    const childPath = [...path, key];
    visit(key, child, childPath);
    walk(child, childPath, visit);
  }
}

function chooseTopUnique<T>(candidates: Candidate<T>[], normalize: (value: T) => string): T | null {
  if (candidates.length === 0) return null;
  const maxScore = Math.max(...candidates.map((candidate) => candidate.score));
  const top = candidates.filter((candidate) => candidate.score === maxScore);
  const unique = new Map<string, T>();
  for (const candidate of top) unique.set(normalize(candidate.value), candidate.value);
  return unique.size === 1 ? [...unique.values()][0] : null;
}

function extractTitle(card: RecordValue): string | null {
  const candidates: Candidate<string>[] = [];
  walk(card, [], (key, value, path) => {
    if (typeof value !== "string") return;
    const text = value.replace(/\s+/g, " ").trim();
    if (text.length < 8 || /^https?:\/\//i.test(text)) return;
    const lowerKey = key.toLowerCase();
    const lowerPath = path.join(".").toLowerCase();
    let score = 0;
    if (lowerKey === "title") score = 120;
    else if (lowerKey === "product_name") score = 110;
    else if (lowerKey === "name" && /product|item|title/.test(lowerPath)) score = 80;
    if (/installment|shipping|seller|badge|label/.test(lowerPath)) score -= 80;
    if (score > 0) candidates.push({ score, value: text, path: lowerPath });
  });
  return chooseTopUnique(candidates, (value) => value.toLowerCase());
}

function extractPrice(card: RecordValue): number | null {
  const candidates: Candidate<number>[] = [];
  walk(card, [], (key, value, path) => {
    const parsed = parsePrice(value);
    if (parsed === null) return;
    const lowerKey = key.toLowerCase();
    const lowerPath = path.join(".").toLowerCase();
    let score = 0;
    if (lowerKey === "current_price") score = 150;
    else if (lowerKey === "price" && /current|sale|offer/.test(lowerPath)) score = 140;
    else if (lowerKey === "price") score = 120;
    else if ((lowerKey === "value" || lowerKey === "amount") && /current[_\-.]?price|sale[_\-.]?price|price\.current|price\.amount/.test(lowerPath)) score = 130;
    else if ((lowerKey === "value" || lowerKey === "amount") && /price/.test(lowerPath)) score = 90;
    if (/original|old|previous|list_price|installment|installments|discount/.test(lowerPath)) score -= 100;
    if (score > 0) candidates.push({ score, value: parsed, path: lowerPath });
  });
  return chooseTopUnique(candidates, (value) => value.toFixed(2));
}

function extractImage(card: RecordValue, baseUrl: string): string | null {
  const candidates: Candidate<string>[] = [];
  walk(card, [], (key, value, path) => {
    if (typeof value !== "string") return;
    try {
      const url = new URL(decodeHtml(value), baseUrl);
      const host = url.hostname.toLowerCase();
      if (url.protocol !== "https:" || !(host === "mlstatic.com" || host.endsWith(".mlstatic.com"))) return;
      const lowerKey = key.toLowerCase();
      const lowerPath = path.join(".").toLowerCase();
      let score = 50;
      if (/secure_url|image_url|imageurl/.test(lowerKey)) score = 150;
      else if (/thumbnail|picture|image|src/.test(lowerKey)) score = 130;
      if (/logo|icon|badge|seller/.test(lowerPath)) score -= 100;
      if (score > 0) candidates.push({ score, value: url.toString(), path: lowerPath });
    } catch {
      // ignora strings que não são URLs
    }
  });
  return chooseTopUnique(candidates, (value) => value);
}

function extractFeaturedSnapshot(html: string, baseUrl: string, expectedItemId: string): FeaturedSnapshot | null {
  const normalizedExpected = normalizeMLId(expectedItemId);
  if (!normalizedExpected) return null;

  const context = parseNordicContext(html);
  const card = context ? findSingleFeaturedCard(context) : null;
  if (!card) return null;

  const metadata = asRecord(card.metadata);
  if (!metadata) return null;
  const itemId = normalizeMLId(metadata.id);
  const productId = normalizeMLId(metadata.product_id);
  const rawUrl = typeof metadata.url === "string" ? metadata.url : "";
  if (!itemId || itemId !== normalizedExpected || !rawUrl) return null;

  const identity = extractIdentityFromAllowedUrl(rawUrl, baseUrl);
  if (!identity) return null;
  if (identity.type === "item" && identity.id !== itemId) return null;
  if (identity.type === "product" && (!productId || identity.id !== productId)) return null;

  const title = extractTitle(card);
  const price = extractPrice(card);
  const imageUrl = extractImage(card, baseUrl);
  if (!title || !price || !imageUrl) return null;

  const finalUrl = new URL(decodeHtml(rawUrl), baseUrl).toString();
  return { itemId, title, price, imageUrl, finalUrl };
}

function readSourceUrl(extractionUrl: string): string | null {
  try {
    const source = new URL(extractionUrl).searchParams.get(ML_EXPRESS_SOURCE_PARAM);
    if (!source) return null;
    const parsed = new URL(source);
    if (parsed.protocol !== "https:" || !isAllowedMLHost(parsed.hostname, true)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

async function fetchAllowedHtml(sourceUrl: string): Promise<{ html: string; finalUrl: string } | null> {
  let current = sourceUrl;
  for (let redirects = 0; redirects <= 6; redirects++) {
    const parsed = new URL(current);
    if (parsed.protocol !== "https:" || !isAllowedMLHost(parsed.hostname, true)) return null;

    const response = await fetch(current, {
      redirect: "manual",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return null;
      const next = new URL(location, current);
      if (next.protocol !== "https:" || !isAllowedMLHost(next.hostname, true)) return null;
      current = next.toString();
      continue;
    }

    if (!response.ok) return null;
    const finalUrl = response.url || current;
    const finalParsed = new URL(finalUrl);
    if (!isAllowedMLHost(finalParsed.hostname)) return null;
    return { html: await response.text(), finalUrl };
  }
  return null;
}

export async function fetchMLFeaturedSnapshotFallback(
  extractionUrl: string,
  expectedItemId: string,
): Promise<LinkMetadata | null> {
  const sourceUrl = readSourceUrl(extractionUrl);
  if (!sourceUrl) return null;

  try {
    const fetched = await fetchAllowedHtml(sourceUrl);
    if (!fetched) return null;
    const snapshot = extractFeaturedSnapshot(fetched.html, fetched.finalUrl, expectedItemId);
    if (!snapshot) return null;

    return {
      title: snapshot.title,
      platform: "Mercado Livre" as Platform,
      imageUrl: snapshot.imageUrl,
      price: snapshot.price,
      finalUrl: snapshot.finalUrl,
      imageSource: "mercadolivre_social_ssr",
      confidenceScore: 100,
      extractionDate: new Date().toISOString(),
    };
  } catch (error) {
    console.warn("[ML API] Fallback SSR da vitrine afiliada indisponível", {
      itemId: expectedItemId,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return null;
  }
}
