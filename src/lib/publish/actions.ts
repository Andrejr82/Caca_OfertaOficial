"use server";

import { createHash } from "crypto";

import { generateOfficialAI, type OfficialAIChannel, type OfficialAICommand } from "@/core/ai";
import { createOfficialAIServiceDependencies } from "@/lib/ai/official/create-official-ai-service";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserId } from "@/lib/offers/queries";
import type { Channel, Offer, Platform } from "@/types/domain";
import { validateProductTitle } from "@/core/quality/product-title-quality";
import { parseSheinOneLinkHtml } from "@/lib/publish/shein-link";
import { fetchMLProductDetailsResult, generateMLAffiliateLinkWithId, validateAffiliateMonetization } from "@/lib/platforms/mercadolivre";
import { resolveMarketplaceUrl } from "@/lib/publish/express-url-resolver";
import { classifyResolution } from "@/lib/publish/product-extraction-contract";
import { validateExpressProduct, getExpressErrorMessage } from "@/lib/publish/express-product-validator";
import { extractMLId } from "@/lib/platforms/mercadolivre";
import { buildExpressAffiliateLinks, isAmazonAffiliateInput, isShopeeAffiliateInput } from "@/lib/publish/express-affiliate-links";
import { chooseMLExtractionUrl } from "@/lib/publish/ml-extraction-url";

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface QuickPostResult {
  ok: boolean;
  message: string;
  status?: string;
  offer?: Offer;
  trackedUrl?: string;
  affiliateUrl?: string;
  copy?: string;
  copies?: { telegram: string; whatsapp: string; instagram: string };
}

// ─── Telemetria (sem dados sensíveis) ────────────────────────────────────────

function sanitizeUrlForLog(url: string): string {
  try {
    const parsed = new URL(url);
    // Remover parâmetros sensíveis
    ["ua", "matt_tool", "partner_id", "access_token", "token", "key", "secret"].forEach((p) =>
      parsed.searchParams.delete(p)
    );
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url.substring(0, 100); // truncar se inválida
  }
}

function log(tag: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({
    tag,
    timestamp: new Date().toISOString(),
    ...data,
  }));
}

// ─── Utilitários de extração de HTML ─────────────────────────────────────────

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function metaTag(html: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i")
  );
  return match ? decodeHtml(match[1].trim()) : "";
}

function extractJsonLdPrice(html: string): number {
  const blocks = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi);
  if (!blocks) return 0;
  for (const block of blocks) {
    try {
      const clean = block.replace(/<script[^>]*>|<\/script>/gi, "").trim();
      const data = JSON.parse(clean);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        const price = item?.offers?.price || item?.offers?.[0]?.price || item?.price;
        if (price && Number(price) > 0) return Number(price);
      }
    } catch { /* ignorar */ }
  }
  return 0;
}

function parseMarketplacePrice(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const normalized = value.replace(/[^\d,.-]/g, "");
  if (!normalized) return 0;
  const parsed = Number(normalized.includes(",") ? normalized.replace(/\./g, "").replace(",", ".") : normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

// ─── Detector de marketplace ──────────────────────────────────────────────────

function detectPlatform(value: string): Platform {
  const lowerUrl = value.toLowerCase();
  if (lowerUrl.includes("shein")) return "Shein";
  if (lowerUrl.includes("magazineluiza") || lowerUrl.includes("magalu") || lowerUrl.includes("magazinevoce")) return "Magalu";
  if (lowerUrl.includes("shopee") || lowerUrl.includes("s.shopee")) return "Shopee";
  if (lowerUrl.includes("amzn") || lowerUrl.includes("amazon") || lowerUrl.includes("a.co")) return "Amazon";
  if (lowerUrl.includes("mercadolivre") || lowerUrl.includes("mercadolibre") || lowerUrl.includes("meli.la")) return "Mercado Livre";
  return "Outro";
}

// ─── Extração de shop_id e item_id da URL Shopee ─────────────────────────────

function extractShopeeIds(url: string): { shopId?: string; itemId?: string } {
  try {
    const parsed = new URL(url);
    // Formato: /product/{shopId}/{itemId}
    const productMatch = parsed.pathname.match(/\/product\/(\d+)\/(\d+)/i);
    if (productMatch) return { shopId: productMatch[1], itemId: productMatch[2] };

    // Formato: /i.{shopId}.{itemId}
    const iMatch = parsed.pathname.match(/\/i\.(\d+)\.(\d+)/i);
    if (iMatch) return { shopId: iMatch[1], itemId: iMatch[2] };

    // Shortlinks afiliados podem resolver para /opaanlp/{shopId}/{itemId}.
    const opaanlpMatch = parsed.pathname.match(/\/opaanlp\/(\d+)\/(\d+)/i);
    if (opaanlpMatch) return { shopId: opaanlpMatch[1], itemId: opaanlpMatch[2] };

    // Parâmetros de query
    const shopId = parsed.searchParams.get("shop_id") || undefined;
    const itemId = parsed.searchParams.get("item_id") || undefined;
    if (shopId || itemId) return { shopId, itemId };
  } catch { /* ignorar */ }
  return {};
}

// ─── API Oficial da Shopee (GraphQL) ─────────────────────────────────────────

export async function fetchShopeeOfficialProduct(shopId: string, itemId: string): Promise<{
  title: string;
  imageUrl: string;
  price: number;
  affiliateUrl: string;
} | null> {
  const appId = process.env.SHOPEE_APP_ID || "";
  const appSecret = process.env.SHOPEE_APP_SECRET || "";
  if (!appId || !appSecret) {
    console.warn("[ACTIONS][SHOPEE] SHOPEE_APP_ID ou SHOPEE_APP_SECRET não configurados.");
    return null;
  }

  const query = "query ShopeePromotionOffers($keyword: String, $page: Int, $limit: Int, $sortType: Int, $isAMSOffer: Boolean) { productOfferV2(keyword: $keyword, page: $page, limit: $limit, sortType: $sortType, isAMSOffer: $isAMSOffer) { nodes { itemId productName imageUrl priceMin offerLink } } }";
  const keywords = [`https://shopee.com.br/product/${shopId}/${itemId}`, itemId];

  for (const keyword of keywords) {
    const variables = { keyword, page: 1, limit: 1, sortType: 2, isAMSOffer: true };
    const requestBody = JSON.stringify({ query, variables });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHash("sha256")
      .update(`${appId}${timestamp}${requestBody}${appSecret}`)
      .digest("hex");

    try {
      const response = await fetch("https://open-api.affiliate.shopee.com.br/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`
        },
        body: requestBody,
        signal: AbortSignal.timeout(12_000)
      });

      const data = await response.json();
      const nodes = data?.data?.productOfferV2?.nodes;
      if (Array.isArray(nodes) && nodes.length > 0) {
        const product = nodes.find((node: any) => !node.itemId || String(node.itemId) === String(itemId)) || nodes[0];
        const price = parseMarketplacePrice(product.priceMin);
        const imageUrl = typeof product.imageUrl === "string" && product.imageUrl.startsWith("//")
          ? `https:${product.imageUrl}`
          : product.imageUrl;
        if (product.productName && imageUrl && price > 0) {
          return {
            title: product.productName,
            imageUrl,
            price,
            affiliateUrl: typeof product.offerLink === "string" && isShopeeAffiliateInput(product.offerLink)
              ? product.offerLink
              : ""
          };
        }
      }
    } catch (error) {
      console.error("[ACTIONS][SHOPEE] Falha ao consultar API Oficial:", error);
    }
  }
  return null;
}

// ─── Leitura de metadados HTML (Shopee e fallback) ────────────────────────────

function extractShopeeTitleFromUrl(url: string): string {
  try {
    const pathname = decodeURIComponent(new URL(url).pathname);
    const match = pathname.match(/\/([^/]+?)-i\.\d+\.\d+\/?$/i);
    if (!match) return "";
    return match[1]
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return "";
  }
}

export async function readShopeeMetadata(resolvedUrl: string, htmlBody?: string): Promise<{
  title: string;
  imageUrl: string;
  price: number;
  shopId?: string;
  itemId?: string;
}> {
  const { shopId, itemId } = extractShopeeIds(resolvedUrl);

  // Se o HTML não foi passado, buscar com User-Agent de browser real
  let html = htmlBody;
  if (!html) {
    try {
      const resp = await fetch(resolvedUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "pt-BR,pt;q=0.9",
        },
        signal: AbortSignal.timeout(12_000),
      });
      html = await resp.text();
    } catch {
      html = "";
    }
  }

  let metadataHtml = html;

  // Links afiliados da Shopee frequentemente resolvem para /opaanlp, uma
  // página intermediária sem metadados do produto. Tentar a página canônica
  // pelos IDs preserva a identidade já confirmada sem aceitar dados fictícios.
  const isOpaanlp = /shopee\.com\.br\/opaanlp\/\d+\/\d+/i.test(resolvedUrl);
  if (isOpaanlp && (!metaTag(metadataHtml, "og:title") || !metaTag(metadataHtml, "og:image"))) {
    const directUrl = shopId && itemId
      ? `https://shopee.com.br/product/${shopId}/${itemId}`
      : "";
    if (directUrl) {
      try {
        const response = await fetch(directUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "pt-BR,pt;q=0.9",
          },
          signal: AbortSignal.timeout(12_000),
        });
        if (response.ok !== false) {
          const directHtml = await response.text();
          if (directHtml) metadataHtml = directHtml;
        }
      } catch {
        // A API/HTML original continua sendo usada como fonte disponível.
      }
    }
  }

  const ogTitle = metaTag(metadataHtml, "og:title") || metaTag(metadataHtml, "twitter:title");
  const imageUrl = metaTag(metadataHtml, "og:image") || metaTag(metadataHtml, "twitter:image") || metaTag(html, "og:image") || metaTag(html, "twitter:image");
  const rawPrice = metaTag(metadataHtml, "product:price:amount") || metaTag(metadataHtml, "og:price:amount") || metaTag(html, "product:price:amount") || metaTag(html, "og:price:amount");
  const normalizedPrice = rawPrice?.includes(",")
    ? rawPrice.replace(/\./g, "").replace(",", ".")
    : rawPrice;
  const price = normalizedPrice ? Number(normalizedPrice) : extractJsonLdPrice(html);

  // Verificar se o título é genérico da Shopee
  const isGeneric = /(?:shopee|great offer|save big|economize muito|não perca esta oferta)/i.test(ogTitle);
  const sheinRef = /shein/i.test(resolvedUrl) ? parseSheinOneLinkHtml(html) : null;
  const title = (isGeneric && sheinRef?.titleFromUrl) ? sheinRef.titleFromUrl : ogTitle;
  const finalTitle = title || extractShopeeTitleFromUrl(resolvedUrl);

  return { title: finalTitle, imageUrl, price: Number.isFinite(price) ? price : 0, shopId, itemId };
}

// ─── Leitura de metadados genérico para Shein ────────────────────────────────

export async function readSheinMetadata(resolvedUrl: string, htmlBody?: string): Promise<{
  title: string;
  imageUrl: string;
  price: number;
}> {
  let html = htmlBody;
  if (!html) {
    try {
      const resp = await fetch(resolvedUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "pt-BR,pt;q=0.9",
        },
        signal: AbortSignal.timeout(12_000),
      });
      html = await resp.text();
    } catch {
      html = "";
    }
  }

  const sheinRef = parseSheinOneLinkHtml(html);
  let productHtml = "";

  // OneLinks normalmente entregam uma landing page. Quando ela contém a URL
  // atribuída do produto, buscamos essa página para obter preço/imagem reais,
  // preservando o OneLink original como URL monetizada.
  if (sheinRef?.productUrl && sheinRef.productUrl !== resolvedUrl) {
    try {
      const productUrl = new URL(sheinRef.productUrl);
      const host = productUrl.hostname.toLowerCase();
      if (host === "shein.com" || host.endsWith(".shein.com")) {
        const productResponse = await fetch(sheinRef.productUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "pt-BR,pt;q=0.9",
          },
          signal: AbortSignal.timeout(12_000),
        });
        if (productResponse.ok) productHtml = await productResponse.text();
      }
    } catch { /* manter os metadados da landing page como fallback */ }
  }

  const sourceHtml = productHtml || html;
  const socialTitle = metaTag(sourceHtml, "og:title") || metaTag(sourceHtml, "twitter:title") || metaTag(html, "og:title") || metaTag(html, "twitter:title");
  const isGeneric = /(?:categoria|campanha|collection|great offer|economize muito|não perca)/i.test(socialTitle);
  let jsonLdName = "";
  let jsonLdImage = "";
  const jsonLdBlocks = sourceHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi) || [];
  for (const block of jsonLdBlocks) {
    try {
      const data = JSON.parse(block.replace(/<script[^>]*>|<\/script>/gi, "").trim());
      const entries = Array.isArray(data) ? data : [data];
      const product = entries.find((entry: any) => entry?.name || entry?.image);
      if (product) {
        jsonLdName = typeof product.name === "string" ? decodeHtml(product.name).trim() : "";
        jsonLdImage = Array.isArray(product.image) ? String(product.image[0] || "") : String(product.image || "");
        if (jsonLdName || jsonLdImage) break;
      }
    } catch { /* ignorar JSON-LD inválido */ }
  }
  const title = (isGeneric && sheinRef?.titleFromUrl) ? sheinRef.titleFromUrl : (socialTitle || jsonLdName);

  // Tentar extrair título do slug da URL para páginas de produto Shein br.shein.com
  let finalTitle = title;
  if (!finalTitle || finalTitle.length < 10) {
    try {
      const parsed = new URL(resolvedUrl);
      const slugMatch = parsed.pathname.match(/\/([^/]+)-p-\d+/i);
      if (slugMatch) {
        finalTitle = slugMatch[1].replace(/[-_]/g, " ").trim();
      }
    } catch { /* ignorar */ }
  }

  const imageUrl = metaTag(sourceHtml, "og:image") || metaTag(sourceHtml, "twitter:image") || jsonLdImage || metaTag(html, "og:image") || metaTag(html, "twitter:image");
  const rawPrice = metaTag(sourceHtml, "product:price:amount") || metaTag(sourceHtml, "og:price:amount") || metaTag(html, "product:price:amount") || metaTag(html, "og:price:amount");
  const normalizedPrice = rawPrice?.includes(",")
    ? rawPrice.replace(/\./g, "").replace(",", ".")
    : rawPrice;
  const price = normalizedPrice ? Number(normalizedPrice) : extractJsonLdPrice(sourceHtml);

  return {
    title: finalTitle,
    imageUrl,
    price: Number.isFinite(price) ? price : 0,
  };
}

// ─── Leitura de metadados genérico para Amazon ───────────────────────────────

export async function readAmazonMetadata(resolvedUrl: string, htmlBody?: string): Promise<{
  title: string;
  imageUrl: string;
  price: number;
}> {
  let html = htmlBody;
  if (!html) {
    try {
      const resp = await fetch(resolvedUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "pt-BR,pt;q=0.9",
        },
        signal: AbortSignal.timeout(12_000),
      });
      html = await resp.text();
    } catch {
      html = "";
    }
  }

  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  let titleText = titleMatch ? decodeHtml(titleMatch[1].trim()) : "";
  let title = titleText || metaTag(html, "og:title") || metaTag(html, "twitter:title");
  if (title && (title.includes("Amazon.com") || title.includes(" | Amazon"))) {
    title = title.replace(/\s*[|:-]\s*Amazon\.com.*/i, "").trim();
  }

  const imageUrl = metaTag(html, "og:image") || metaTag(html, "twitter:image") || html.match(/"hiRes":"([^"]+)"/)?.[1] || html.match(/"large":"([^"]+)"/)?.[1] || "";
  
  let price = 0;
  const offscreenMatch = html.match(/<span[^>]*class=["'][^"']*a-offscreen[^"']*["'][^>]*>\s*(?:R\$\s*)?([\d.,]+)\s*<\/span>/i);
  if (offscreenMatch) {
    price = Number(offscreenMatch[1].replace(/\./g, "").replace(",", "."));
  } else {
    const rawPrice = metaTag(html, "product:price:amount") || metaTag(html, "og:price:amount");
    const normalizedPrice = rawPrice?.includes(",") ? rawPrice.replace(/\./g, "").replace(",", ".") : rawPrice;
    price = normalizedPrice ? Number(normalizedPrice) : extractJsonLdPrice(html);
  }

  return {
    title,
    imageUrl,
    price: Number.isFinite(price) ? price : 0,
  };
}

// ─── Action Principal: Publicação Expressa ────────────────────────────────────

async function generateQuickPostActionInternal(
  affiliateUrl: string,
  channel: Channel | "omnichannel",
  requestId = crypto.randomUUID(),
  diagnostics?: { stage: string },
): Promise<QuickPostResult> {
  const inputUrl = affiliateUrl.trim();
  const operationId = requestId;
  const stage = (value: string) => { if (diagnostics) diagnostics.stage = value; };

  log("[Express Start]", { requestId: operationId, inputUrl: sanitizeUrlForLog(inputUrl) });

  // ── Autenticação ──────────────────────────────────────────────────────────
  const userId = await getCurrentUserId();
  const supabase = await createServerSupabaseClient();
  if (!userId || !supabase) {
    return { ok: false, status: "UNAUTHENTICATED", message: "Sessão expirada. Entre novamente no painel." };
  }

  // ── Validação básica de URL ───────────────────────────────────────────────
  if (!/^https?:\/\/\S+$/i.test(inputUrl)) {
    return { ok: false, status: "INVALID_URL", message: "Cole uma URL válida, começando com http:// ou https://." };
  }

  const detectedPlatform = detectPlatform(inputUrl);
  if (detectedPlatform === "Outro" || detectedPlatform === "Magalu") {
    return {
      ok: false,
      status: "UNSUPPORTED_MARKETPLACE",
      message: "Marketplace não reconhecido neste link. Suportamos Shopee, Mercado Livre, Shein e Amazon.",
    };
  }

  log("[Express Marketplace Detected]", { requestId: operationId, marketplace: detectedPlatform });

  // ─── Variáveis de resultado ───────────────────────────────────────────────
  let title = "";
  let imageUrl = "";
  let price = 0;
  let resolvedUrl = inputUrl;
  let canonicalUrl = inputUrl;
  let itemId: string | undefined;
  let shopId: string | undefined;
  let generatedAffiliateUrl = "";
  let originalItemId: string | null | undefined;
  let finalItemId: string | null | undefined;
  let identitySource: string | undefined;

  // ─── Mercado Livre ────────────────────────────────────────────────────────
  if (detectedPlatform === "Mercado Livre") {
    stage("mercado_livre_extraction");
    // PASSO 1: Resolver URL (seguir meli.la → mercadolivre.com.br)
    log("[Express Link Start]", { requestId: operationId, stage: "resolve_url", marketplace: "Mercado Livre" });
    const resolved = await resolveMarketplaceUrl(inputUrl, { maxRedirects: 10, timeoutMs: 15_000 });

    const resolutionOutcome = classifyResolution(resolved);

    if (resolutionOutcome.status === "rejected") {
      const msgMap: Record<string, string> = {
        SSRF_BLOCKED: "Este link aponta para um destino não permitido.",
        REDIRECT_LOOP: "Não conseguimos resolver o link do Mercado Livre — foi detectado um loop de redirecionamento.",
        REDIRECT_LIMIT_EXCEEDED: "O link do Mercado Livre redireciona muitas vezes e não pôde ser resolvido.",
        UNEXPECTED_REDIRECT_DOMAIN: "Esse link redirecionou para um domínio não reconhecido.",
        TIMEOUT_RESOLVING_URL: "O processamento desse link excedeu o tempo permitido.",
        EMPTY_RESPONSE: "Não conseguimos abrir o link do Mercado Livre.",
        PRODUCT_ID_MISMATCH: "Incompatibilidade de produto detectada durante o redirecionamento.",
        AFFILIATE_SHOWCASE_NOT_PRODUCT: "O link direciona para uma vitrine com vários produtos. Cole o link de um produto específico.",
      };
      log("[Express Link Error]", { requestId: operationId, errorCode: resolutionOutcome.code, stage: "url_resolution" });
      return { ok: false, status: resolutionOutcome.code, message: msgMap[resolutionOutcome.code] || "Erro ao resolver o link do Mercado Livre." };
    }

    if (resolutionOutcome.status === "confirmed_identity") {
      log("[Express Fallback]", { requestId: operationId, message: "Produto identificado pela URL original; validação continuada pela API.", originalItemId: resolved.originalItemId });
    }

    resolvedUrl = resolved.resolvedUrl;
    originalItemId = resolved.originalItemId;
    finalItemId = resolved.finalItemId;
    identitySource = resolved.identitySource;
    log("[Express Resolved]", { requestId: operationId, resolvedUrl: sanitizeUrlForLog(resolvedUrl), redirectCount: resolved.redirectChain.length });

    // PASSO 2: Usar o ID selecionado (original ou final)
    if (resolutionOutcome.status === "confirmed_identity") {
      itemId = resolutionOutcome.itemId;
    } else if (resolved.selectedItemId) {
      itemId = resolved.selectedItemId;
    }

    // PASSO 3: Buscar dados do produto via API ML (com OAuth token do usuário)
    // Se caiu no anti-bot mas temos o ID, podemos montar uma URL válida para a API (a API usa o ID)
    // Preserve the original catalog URL when anti-bot resolution already
    // confirmed the item. The catalog id is required by the official
    // /products/{catalog}/items fallback when /items returns 403.
    const urlForApi = chooseMLExtractionUrl(
      inputUrl,
      resolvedUrl,
      resolutionOutcome.status === "confirmed_identity",
      itemId,
    );
    
    log("[Express Parse Start]", { requestId: operationId, marketplace: "Mercado Livre", itemId, identitySource: resolved.identitySource });
    const mlResult = await fetchMLProductDetailsResult(urlForApi, userId);

    if (!mlResult.ok) {
      const failureMessages: Record<string, string> = {
        MARKETPLACE_AUTH_DENIED: "A integração do Mercado Livre precisa ser reconectada para confirmar este produto.",
        MARKETPLACE_PERMISSION_DENIED: "O Mercado Livre recusou o acesso a este produto para a aplicação. Verifique as permissões da integração.",
        MARKETPLACE_SOURCE_UNAVAILABLE: "O Mercado Livre não respondeu com dados do produto. Tente novamente em alguns minutos.",
        INVALID_PRODUCT_ID: "Não foi possível confirmar a identidade do produto do Mercado Livre.",
      };
      log("[Express Link Error]", { requestId: operationId, errorCode: mlResult.code, stage: "marketplace_provider" });
      return { ok: false, status: mlResult.code, message: failureMessages[mlResult.code] };
    }

    const mlData = mlResult.data;

    title = mlData.title;
    imageUrl = mlData.imageUrl || "";
    price = mlData.price ?? 0;
    canonicalUrl = mlData.finalUrl || urlForApi;
    if (!itemId) {
      const extractedId = extractMLId(canonicalUrl);
      if (extractedId) itemId = extractedId.id;
    }


    // PASSO 4: Gerar affiliate_url com MERCADO_LIVRE_AFFILIATE_ID
    const mlAffiliateId = process.env.MERCADO_LIVRE_AFFILIATE_ID || "";
    if (mlAffiliateId && canonicalUrl) {
      generatedAffiliateUrl = generateMLAffiliateLinkWithId(canonicalUrl, mlAffiliateId);
    }

    // PASSO 5: Validar monetização
    const monetization = validateAffiliateMonetization({
      marketplace: "Mercado Livre",
      affiliateUrl: generatedAffiliateUrl,
      originalUrl: inputUrl,
      resolvedUrl,
    });

    if (!monetization.monetized) {
      log("[Express Link Error]", { requestId: operationId, errorCode: "AFFILIATE_LINK_NOT_GENERATED", stage: "monetization" });
      return {
        ok: false,
        status: "AFFILIATE_LINK_NOT_GENERATED",
        message: "O link de afiliado do Mercado Livre não pôde ser gerado. Verifique as configurações de afiliado nas Integrações.",
      };
    }

    log("[Express Parse End]", { requestId: operationId, marketplace: "Mercado Livre", hasTitle: !!title, hasPrice: price > 0, hasImage: !!imageUrl });
  }

  // ─── Shopee ───────────────────────────────────────────────────────────────
  else if (detectedPlatform === "Shopee") {
    log("[Express Link Start]", { requestId: operationId, stage: "resolve_url", marketplace: "Shopee" });

    // Resolver short link s.shopee.com.br → shopee.com.br/product/...
    const resolved = await resolveMarketplaceUrl(inputUrl, { maxRedirects: 10, timeoutMs: 15_000 });

    if (resolved.errorCode && resolved.errorCode !== "ANTI_BOT_REDIRECT_WITH_ORIGINAL_ID") {
      const msgMap: Record<string, string> = {
        SSRF_BLOCKED: "Este link aponta para um destino não permitido.",
        REDIRECT_LOOP: "Não conseguimos abrir o link compartilhado da Shopee — loop de redirecionamento.",
        REDIRECT_LIMIT_EXCEEDED: "O link da Shopee redireciona muitas vezes e não pôde ser resolvido.",
        UNEXPECTED_REDIRECT_DOMAIN: "Esse link da Shopee redirecionou para um domínio não reconhecido.",
        TIMEOUT_RESOLVING_URL: "O processamento desse link da Shopee excedeu o tempo permitido.",
        EMPTY_RESPONSE: "Não conseguimos abrir o link compartilhado da Shopee.",
        PRODUCT_ID_MISMATCH: "Incompatibilidade de produto detectada durante o redirecionamento.",
        CAMPAIGN_PAGE_NOT_PRODUCT: "O link direciona para uma campanha da Shopee, não para um produto individual.",
        AFFILIATE_SHOWCASE_NOT_PRODUCT: "O link direciona para uma vitrine com vários produtos. Cole o link de um produto específico.",
        SHOPEE_PRODUCT_IDS_NOT_FOUND: "Não foi possível extrair a identidade do produto a partir da URL da campanha da Shopee."
      };
      log("[Express Link Error]", { requestId: operationId, errorCode: resolved.errorCode, stage: "url_resolution" });
      return { ok: false, status: resolved.errorCode, message: msgMap[resolved.errorCode] || "Erro ao resolver o link da Shopee." };
    }

    if (resolved.errorCode === "ANTI_BOT_REDIRECT_WITH_ORIGINAL_ID") {
      log("[Express Fallback]", { requestId: operationId, message: "Produto identificado pela URL original; validação continuada." });
    }

    resolvedUrl = resolved.resolvedUrl;
    canonicalUrl = resolvedUrl;
    originalItemId = resolved.originalItemId;
    finalItemId = resolved.finalItemId;
    identitySource = resolved.identitySource;
    log("[Express Resolved]", { requestId: operationId, resolvedUrl: sanitizeUrlForLog(resolvedUrl), redirectCount: resolved.redirectChain.length, identitySource: resolved.identitySource });

    // Usar o ID da URL se foi extraído de forma segura
    const extractedIds = extractShopeeIds(resolvedUrl);
    itemId = resolved.selectedItemId || extractedIds.itemId;
    shopId = extractedIds.shopId;
    
    log("[Express Parse Start]", { requestId: operationId, marketplace: "Shopee", hasShopId: !!shopId, hasItemId: !!itemId });
    
    // Se temos shopId e itemId (como no caso do opaanlp), tenta a API oficial primeiro
    let apiSuccess = false;
    let shopeeAffiliateUrl = "";
    if (shopId && itemId) {
      const apiData = await fetchShopeeOfficialProduct(shopId, itemId);
      if (apiData) {
        title = apiData.title;
        imageUrl = apiData.imageUrl;
        price = apiData.price;
        shopeeAffiliateUrl = apiData.affiliateUrl;
        apiSuccess = true;
      }
    }
    
    // Fallback: se a API oficial não retornar (ou não termos IDs), usa readShopeeMetadata (scraping)
    if (!apiSuccess) {
      const shopeeData = await readShopeeMetadata(resolvedUrl, resolved.htmlBody);
      title = shopeeData.title;
      imageUrl = shopeeData.imageUrl;
      price = shopeeData.price;
      shopId = shopId || shopeeData.shopId;
      itemId = itemId || shopeeData.itemId;
    }
    
    // Em caso de opaanlp e API não retornou dados (e scraping também costuma falhar), retornar erro customizado
    if (!apiSuccess && resolvedUrl.includes("shopee.com.br/opaanlp/") && !isShopeeAffiliateInput(inputUrl)) {
      log("[Express Link Error]", { requestId: operationId, errorCode: "SHOPEE_PRODUCT_NOT_CONFIRMED", stage: "url_resolution" });
      return { ok: false, status: "SHOPEE_PRODUCT_NOT_CONFIRMED", message: "O produto não pôde ser confirmado pela API da Shopee. A oferta pode ter expirado ou estar indisponível." };
    }
    
    // Shopee: preserva sempre o link afiliado (que pode ser o original s.shopee.com.br ou o resolvido com afiliação)
    generatedAffiliateUrl = isShopeeAffiliateInput(inputUrl) ? inputUrl : shopeeAffiliateUrl;

    if (!generatedAffiliateUrl) {
      log("[Express Link Error]", { requestId: operationId, errorCode: "SHOPEE_AFFILIATE_LINK_NOT_RETURNED", stage: "monetization" });
      return {
        ok: false,
        status: "SHOPEE_AFFILIATE_LINK_NOT_RETURNED",
        message: "A Shopee não retornou um link afiliado para este produto. Use o link da página de afiliados.",
      };
    }

    log("[Express Parse End]", { requestId: operationId, marketplace: "Shopee", hasTitle: !!title, hasPrice: price > 0, hasImage: !!imageUrl });
  }

  // ─── Shein ────────────────────────────────────────────────────────────────
  else if (detectedPlatform === "Shein") {
    log("[Express Link Start]", { requestId: operationId, stage: "resolve_url", marketplace: "Shein" });
    const resolved = await resolveMarketplaceUrl(inputUrl, { maxRedirects: 10, timeoutMs: 15_000 });

    if (resolved.errorCode) {
      const msgMap: Record<string, string> = {
        SSRF_BLOCKED: "Este link aponta para um destino não permitido.",
        REDIRECT_LOOP: "Não conseguimos resolver o link da Shein — foi detectado um loop de redirecionamento.",
        REDIRECT_LIMIT_EXCEEDED: "O link da Shein redireciona muitas vezes e não pôde ser resolvido.",
        UNEXPECTED_REDIRECT_DOMAIN: "Esse link redirecionou para um domínio não reconhecido.",
        TIMEOUT_RESOLVING_URL: "O processamento desse link excedeu o tempo permitido.",
        EMPTY_RESPONSE: "Não conseguimos abrir o link da Shein.",
      };
      log("[Express Link Error]", { requestId: operationId, errorCode: resolved.errorCode, stage: "url_resolution" });
      return { ok: false, status: resolved.errorCode, message: msgMap[resolved.errorCode] || "Erro ao resolver o link da Shein." };
    }

    resolvedUrl = resolved.resolvedUrl;
    canonicalUrl = resolvedUrl;
    originalItemId = resolved.originalItemId;
    finalItemId = resolved.finalItemId;
    identitySource = resolved.identitySource;
    itemId = resolved.selectedItemId || undefined;

    log("[Express Resolved]", { requestId: operationId, resolvedUrl: sanitizeUrlForLog(resolvedUrl), redirectCount: resolved.redirectChain.length, identitySource });

    log("[Express Parse Start]", { requestId: operationId, marketplace: "Shein" });
    const sheinData = await readSheinMetadata(resolvedUrl, resolved.htmlBody);
    title = sheinData.title;
    imageUrl = sheinData.imageUrl;
    price = sheinData.price;
    // OneLink já é monetizado; preserve-o como affiliate_url. Links diretos
    // continuam sendo tratados como URL canônica para o fluxo manual.
    generatedAffiliateUrl = /^https?:\/\/onelink\.shein\.com\//i.test(inputUrl)
      ? inputUrl
      : canonicalUrl;

    log("[Express Parse End]", { requestId: operationId, marketplace: "Shein", hasTitle: !!title, hasPrice: price > 0, hasImage: !!imageUrl });
  }

  // ─── Amazon ───────────────────────────────────────────────────────────────
  else if (detectedPlatform === "Amazon") {
    log("[Express Link Start]", { requestId: operationId, stage: "resolve_url", marketplace: "Amazon" });
    const resolved = await resolveMarketplaceUrl(inputUrl, { maxRedirects: 10, timeoutMs: 15_000 });

    if (resolved.errorCode) {
      const msgMap: Record<string, string> = {
        SSRF_BLOCKED: "Este link aponta para um destino não permitido.",
        REDIRECT_LOOP: "Não conseguimos resolver o link da Amazon — foi detectado um loop de redirecionamento.",
        REDIRECT_LIMIT_EXCEEDED: "O link da Amazon redireciona muitas vezes e não pôde ser resolvido.",
        UNEXPECTED_REDIRECT_DOMAIN: "Esse link redirecionou para um domínio não reconhecido.",
        TIMEOUT_RESOLVING_URL: "O processamento desse link excedeu o tempo permitido.",
        EMPTY_RESPONSE: "Não conseguimos abrir o link da Amazon.",
      };
      log("[Express Link Error]", { requestId: operationId, errorCode: resolved.errorCode, stage: "url_resolution" });
      return { ok: false, status: resolved.errorCode, message: msgMap[resolved.errorCode] || "Erro ao resolver o link da Amazon." };
    }

    resolvedUrl = resolved.resolvedUrl;
    canonicalUrl = resolvedUrl;
    originalItemId = resolved.originalItemId;
    finalItemId = resolved.finalItemId;
    identitySource = resolved.identitySource;
    itemId = resolved.selectedItemId || undefined;

    log("[Express Resolved]", { requestId: operationId, resolvedUrl: sanitizeUrlForLog(resolvedUrl), redirectCount: resolved.redirectChain.length, identitySource });

    log("[Express Parse Start]", { requestId: operationId, marketplace: "Amazon" });
    const amazonData = await readAmazonMetadata(resolvedUrl, resolved.htmlBody);
    title = amazonData.title;
    imageUrl = amazonData.imageUrl;
    price = amazonData.price;

    const amzPartnerTag = process.env.AMAZON_PARTNER_TAG || "";
    if (isAmazonAffiliateInput(inputUrl)) {
      generatedAffiliateUrl = inputUrl;
    } else if (amzPartnerTag && canonicalUrl) {
      try {
        const urlObj = new URL(canonicalUrl);
        urlObj.searchParams.set("tag", amzPartnerTag);
        generatedAffiliateUrl = urlObj.toString();
      } catch {
        generatedAffiliateUrl = canonicalUrl;
      }
    } else {
      generatedAffiliateUrl = canonicalUrl;
    }

    log("[Express Parse End]", { requestId: operationId, marketplace: "Amazon", hasTitle: !!title, hasPrice: price > 0, hasImage: !!imageUrl });
  }

  // ─── Validação Progressiva ────────────────────────────────────────────────
  const platform = detectedPlatform;
  log("[Express Validation]", { requestId: operationId, marketplace: platform, itemId, shopId });
  stage("validation");

  const validation = validateExpressProduct({
    title,
    marketplace: platform,
    imageUrl,
    price,
    resolvedUrl: canonicalUrl,
    itemId,
    shopId,
  });

  const titleQuality = validateProductTitle(title);

  if (!validation.approved || !titleQuality.valid) {
    const errorCode = validation.errorCode || (titleQuality.valid ? undefined : "PRODUCT_NAME_MISSING");
    const message = getExpressErrorMessage(errorCode, platform);
    log("[Express Link Error]", { requestId: operationId, errorCode, stage: validation.errorStage || "title_quality" });
    return { ok: false, status: errorCode || "INVALID_PRODUCT_LINK", message };
  }

  // ─── Persistência da Oferta ───────────────────────────────────────────────
  const candidateId = `manual-${operationId}`;
  const ingestionId = `quick-publication-${operationId}`;
  const correlationId = `quick-publication:${operationId}`;

  log("[Express Persist Start]", { requestId: operationId, marketplace: platform });
  stage("persist_offer");

  const { data: offer, error: offerError } = await supabase
    .from("offers")
    .insert({
      user_id: userId,
      platform,
      product_name: title,
      original_url: inputUrl,       // URL original fornecida pelo usuário
      image_url: imageUrl || null,
      current_price: price,
      status: "pending_manual_review",
      score: 0,
      explainability: {
        contract_version: "pmav5.candidate/v1",
        candidate_id: candidateId,
        ingestion_id: ingestionId,
        correlation_id: correlationId,
        discovery_evidence: {
          source: "quick-publication",
          resolved_url: resolvedUrl,        // URL após resolução de redirects
          canonical_url: canonicalUrl,      // URL canônica do produto
          affiliate_url: generatedAffiliateUrl, // URL com parâmetros de afiliado
          item_id: itemId,
          shop_id: shopId,
          original_item_id: originalItemId,
          final_item_id: finalItemId,
          selected_item_id: itemId,
          identity_source: identitySource,
          quality_gate: "VALID_PRODUCT",
        },
        marketplace_metrics: {
          extracted_at: new Date().toISOString(),
          comparison: "not_applicable",
        },
      },
    })
    .select("*")
    .single<Offer>();

  if (offerError || !offer) {
    log("[Express Link Error]", { requestId: operationId, errorCode: "OFFER_CREATE_FAILED" });
    return { ok: false, status: "OFFER_CREATE_FAILED", message: `Não foi possível salvar o link: ${offerError?.message || "oferta ausente"}` };
  }

  log("[Express Persist End]", { requestId: operationId, offerId: offer.id });

  // ─── Geração de Copy com IA ───────────────────────────────────────────────
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://caca-oferta-oficial.vercel.app";
  const { error: affiliateLinksError } = await supabase
    .from("affiliate_links")
    .upsert(
      buildExpressAffiliateLinks({ offerId: offer.id, userId, originalUrl: inputUrl, appUrl }),
      { onConflict: "offer_id,channel" }
    );

  if (affiliateLinksError) {
    log("[Express Link Error]", { requestId: operationId, errorCode: "AFFILIATE_LINKS_CREATE_FAILED" });
    return { ok: false, status: "AFFILIATE_LINKS_CREATE_FAILED", message: "Não foi possível preparar os links rastreáveis da oferta." };
  }

  stage("generate_ai_copy");

  const targetChannels: OfficialAIChannel[] = channel === "omnichannel"
    ? ["telegram", "instagram", "whatsapp"]
    : channel === "telegram" || channel === "instagram" || channel === "whatsapp"
      ? [channel]
      : ["telegram"];

  const commandId = `quick-publication:${offer.id}:v1`;
  const command: OfficialAICommand = {
    contractVersion: "pmav5.ai/v1",
    commandId,
    idempotencyKey: `ai:draft:${offer.id}:v2`,
    correlationId,
    causationId: null,
    offerId: offer.id,
    tenantId: userId,
    providerPreference: "groq",
    channels: targetChannels,
    requestedAt: new Date().toISOString(),
    actor: { type: "user", id: userId, service: "quick-publication" },
    origin: "publish.quick-publication",
    reason: { code: "GENERATE_OFFICIAL_CONTENT" },
  };

  // O Oracle/Inngest executa a Official AI com service role. Reutilizar o
  // cliente da sessão aqui quebra o mesmo contrato quando RLS bloqueia
  // leituras/gravações auxiliares (audit, idempotência, posts e drafts).
  const aiClient = createSupabaseAdminClient() || supabase;
  const result = await generateOfficialAI(command, createOfficialAIServiceDependencies(aiClient, userId));
  if (result.status === "rejected") {
    return { ok: false, status: result.code, message: result.message };
  }

  const { data: posts, error: postsError } = await supabase
    .from("posts")
    .select("content,channel,affiliate_links(tracked_url)")
    .eq("offer_id", offer.id)
    .eq("status", "draft");

  if (postsError || !posts?.length) {
    return { ok: false, status: "DRAFT_READ_FAILED", message: postsError?.message || "A IA respondeu, mas o rascunho não foi localizado." };
  }

  stage("read_generated_posts");

  const copies = Object.fromEntries(
    posts.map((post: any) => [post.channel, post.content])
  ) as QuickPostResult["copies"];

  const firstLink = (Array.isArray((posts[0] as any)?.affiliate_links)
    ? (posts[0] as any).affiliate_links[0]?.tracked_url
    : (posts[0] as any)?.affiliate_links?.tracked_url) || generatedAffiliateUrl || "";

  log("[Express Complete]", {
    requestId: operationId,
    marketplace: platform,
    offerId: offer.id,
    status: "success",
  });

  return {
    ok: true,
    status: result.status,
    message: "Link processado e copy gerada com sucesso.",
    offer,
    copies,
    copy: posts[0]?.content || "",
    trackedUrl: firstLink,
    affiliateUrl: generatedAffiliateUrl,
  };
}

export async function generateQuickPostAction(
  affiliateUrl: string,
  channel: Channel | "omnichannel",
): Promise<QuickPostResult> {
  const requestId = crypto.randomUUID();
  const diagnostics = { stage: "start" };
  try {
    return await generateQuickPostActionInternal(affiliateUrl, channel, requestId, diagnostics);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    log("[Express Unhandled Error]", {
      requestId,
      stage: diagnostics.stage,
      errorType: error instanceof Error ? error.name : typeof error,
      message: message.slice(0, 240),
    });
    return {
      ok: false,
      status: "EXPRESS_INTERNAL_ERROR",
      message: `Não foi possível concluir o processamento deste link. Etapa: ${diagnostics.stage}. Código de diagnóstico: ${requestId}`,
    };
  }
}

// ─── Ações de publicação (stubs — publicação via canais oficiais) ────────────

export async function publishToTelegramAction(text: string, imageUrl?: string) {
  void text;
  void imageUrl;
  return { ok: false, message: "A publicação direta continua sendo feita pela aba oficial do canal." };
}

export async function publishToInstagramAction(caption: string, imageUrl: string, offerId?: string) {
  void caption;
  void imageUrl;
  void offerId;
  return { ok: false, message: "A publicação direta continua sendo feita pela aba oficial do canal." };
}

export async function publishToWhatsAppAction(text: string, imageUrl?: string) {
  void text;
  void imageUrl;
  return { ok: false, message: "A publicação direta continua sendo feita pela aba oficial do canal." };
}
