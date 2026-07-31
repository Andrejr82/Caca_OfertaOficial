import { createHash } from "node:crypto";
import { resolveImportedVideoSource } from "@/lib/videos/import/source-resolver";
import { selectLowestPriceCandidate, type ShopeeReelCandidate } from "./product-selection";

function decodeHtml(value: string) {
  return value.replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").trim();
}

function extractProductTitle(html: string) {
  const description = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1];
  return description ? decodeHtml(description).split("|")[0].replace(/,\s*\d+\s*likes?.*$/i, "").trim() : "";
}

async function fetchShopeeCandidates(keyword: string): Promise<ShopeeReelCandidate[]> {
  const appId = process.env.SHOPEE_APP_ID || "";
  const appSecret = process.env.SHOPEE_APP_SECRET || "";
  if (!appId || !appSecret) throw new Error("SHOPEE_CREDENTIALS_MISSING");
  const query = "query ShopeePromotionOffers($keyword: String, $page: Int, $limit: Int, $sortType: Int, $isAMSOffer: Boolean) { productOfferV2(keyword: $keyword, page: $page, limit: $limit, sortType: $sortType, isAMSOffer: $isAMSOffer) { nodes { itemId shopId productName productLink offerLink imageUrl priceMin priceMax sales shopName ratingStar commissionRate } } }";
  const body = JSON.stringify({ query, variables: { keyword, page: 1, limit: 20, sortType: 1, isAMSOffer: false } });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHash("sha256").update(`${appId}${timestamp}${body}${appSecret}`).digest("hex");
  const response = await fetch("https://open-api.affiliate.shopee.com.br/graphql", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}` }, body, cache: "no-store" });
  const payload = await response.json() as { data?: { productOfferV2?: { nodes?: Array<Record<string, unknown>> } }; errors?: unknown[] };
  if (!response.ok || payload.errors?.length) throw new Error("SHOPEE_PRODUCT_SEARCH_FAILED");
  return (payload.data?.productOfferV2?.nodes || []).map((node) => ({
    itemId: String(node.itemId || ""), shopId: String(node.shopId || ""), productName: String(node.productName || ""), productLink: String(node.productLink || ""), offerLink: String(node.offerLink || ""), imageUrl: typeof node.imageUrl === "string" ? node.imageUrl : null, priceMin: Number(node.priceMin), priceMax: Number(node.priceMax || 0), shopName: typeof node.shopName === "string" ? node.shopName : null, sales: Number(node.sales || 0), ratingStar: Number(node.ratingStar || 0), commissionRate: Number(node.commissionRate || 0)
  }));
}

export async function resolveShopeeReelProduct(sourceUrl: string) {
  const source = await resolveImportedVideoSource(sourceUrl);
  const pageResponse = await fetch(source.resolvedPageUrl, { headers: { "user-agent": "caca-oferta-authorized-reel-import/1.0", accept: "text/html" }, cache: "no-store" });
  if (!pageResponse.ok) throw new Error("SOURCE_PRODUCT_PAGE_FAILED");
  const productTitle = extractProductTitle(await pageResponse.text());
  if (!productTitle) throw new Error("SOURCE_PRODUCT_TITLE_NOT_FOUND");
  const candidates = await fetchShopeeCandidates(productTitle);
  const selected = selectLowestPriceCandidate(candidates);
  if (!selected) throw new Error("SHOPEE_PRODUCT_NOT_FOUND");
  return { ...source, productTitle, candidates, selected };
}

