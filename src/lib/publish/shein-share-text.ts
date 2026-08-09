export interface SheinShareTextResult {
  marketplace: "shein";
  price: number;
  discountPercent?: number;
  title: string;
  couponText?: string;
  originalUrl: string;
}

function parsePrice(value: string): number {
  const normalized = value.replace(/\./g, "").replace(",", ".");
  const price = Number(normalized);
  return Number.isFinite(price) && price > 0 ? price : 0;
}

export function parseSheinShareText(input: string): SheinShareTextResult {
  const text = input.replace(/\r\n/g, "\n").trim();
  const url = text.match(/https:\/\/onelink\.shein\.com\/[^\s]+/i)?.[0];
  if (!url) {
    if (/🛒|Preço\s*\[/i.test(text)) throw new Error("SHEIN_SHARE_URL_REQUIRED");
    throw new Error("SHEIN_SHARE_INVALID");
  }

  const priceMatch = text.match(/Preço\s*\[\s*R\$\s*([\d.,]+)\s*\]\s*(?:-\s*(\d+(?:[.,]\d+)?)\s*%)?/i);
  if (!priceMatch) throw new Error("SHEIN_SHARE_INVALID");
  const price = parsePrice(priceMatch[1]);
  if (!price) throw new Error("SHEIN_SHARE_PRICE_INVALID");

  const titleStart = text.indexOf("🛒");
  const afterCart = titleStart >= 0 ? text.slice(titleStart + "🛒".length) : "";
  const title = (afterCart.split(/💰|🎁|https?:\/\//u)[0] || "").trim();
  if (!title) throw new Error("SHEIN_SHARE_TITLE_REQUIRED");

  const couponMatch = text.match(/🎁\s*([\s\S]*?)(?=https?:\/\/|$)/u);
  const couponText = couponMatch?.[1]?.replace(/\s+/g, " ").trim() || undefined;
  return {
    marketplace: "shein",
    price,
    discountPercent: priceMatch[2] ? Number(priceMatch[2].replace(",", ".")) : undefined,
    title,
    couponText,
    originalUrl: url,
  };
}
