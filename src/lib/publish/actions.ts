"use server";

import { generateOfficialAI, type OfficialAIChannel, type OfficialAICommand } from "@/core/ai";
import { createOfficialAIServiceDependencies } from "@/lib/ai/official/create-official-ai-service";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUserId } from "@/lib/offers/queries";
import type { Channel, Offer, Platform } from "@/types/domain";
import { validateProductTitle } from "@/core/quality/product-title-quality";
import { parseSheinOneLinkHtml } from "@/lib/publish/shein-link";
import { fetchMLProductDetails, generateMLAffiliateLinkWithId, validateAffiliateMonetization } from "@/lib/platforms/mercadolivre";
import { resolveMarketplaceUrl } from "@/lib/publish/express-url-resolver";
import { validateExpressProduct, getExpressErrorMessage } from "@/lib/publish/express-product-validator";
import { extractMLId } from "@/lib/platforms/mercadolivre";

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

    // Parâmetros de query
    const shopId = parsed.searchParams.get("shop_id") || undefined;
    const itemId = parsed.searchParams.get("item_id") || undefined;
    if (shopId || itemId) return { shopId, itemId };
  } catch { /* ignorar */ }
  return {};
}

// ─── Leitura de metadados HTML (Shopee e fallback) ────────────────────────────

async function readShopeeMetadata(resolvedUrl: string, htmlBody?: string): Promise<{
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

  const ogTitle = metaTag(html, "og:title") || metaTag(html, "twitter:title");
  const imageUrl = metaTag(html, "og:image") || metaTag(html, "twitter:image");
  const rawPrice = metaTag(html, "product:price:amount") || metaTag(html, "og:price:amount");
  const normalizedPrice = rawPrice?.includes(",")
    ? rawPrice.replace(/\./g, "").replace(",", ".")
    : rawPrice;
  const price = normalizedPrice ? Number(normalizedPrice) : extractJsonLdPrice(html);

  // Verificar se o título é genérico da Shopee
  const isGeneric = /(?:shopee|great offer|save big|economize muito|não perca esta oferta)/i.test(ogTitle);
  const sheinRef = /shein/i.test(resolvedUrl) ? parseSheinOneLinkHtml(html) : null;
  const title = (isGeneric && sheinRef?.titleFromUrl) ? sheinRef.titleFromUrl : ogTitle;

  return { title, imageUrl, price: Number.isFinite(price) ? price : 0, shopId, itemId };
}

// ─── Leitura de metadados genérico para Shein ────────────────────────────────

async function readSheinMetadata(url: string): Promise<{
  title: string;
  imageUrl: string;
  price: number;
  finalUrl: string;
}> {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return { title: "", imageUrl: "", price: 0, finalUrl: url };
    const html = await response.text();

    const socialTitle = metaTag(html, "og:title") || metaTag(html, "twitter:title");
    const isGeneric = /(?:categoria|campanha|collection|great offer|economize muito|não perca)/i.test(socialTitle);
    const sheinRef = parseSheinOneLinkHtml(html);
    const title = (isGeneric && sheinRef?.titleFromUrl) ? sheinRef.titleFromUrl : socialTitle;

    // Tentar extrair título do slug da URL para páginas de produto Shein br.shein.com
    let finalTitle = title;
    if (!finalTitle || finalTitle.length < 10) {
      try {
        const parsed = new URL(url);
        const slugMatch = parsed.pathname.match(/\/([^/]+)-p-\d+/i);
        if (slugMatch) {
          finalTitle = slugMatch[1].replace(/[-_]/g, " ").trim();
        }
      } catch { /* ignorar */ }
    }

    const imageUrl = metaTag(html, "og:image") || metaTag(html, "twitter:image");
    const rawPrice = metaTag(html, "product:price:amount") || metaTag(html, "og:price:amount");
    const normalizedPrice = rawPrice?.includes(",")
      ? rawPrice.replace(/\./g, "").replace(",", ".")
      : rawPrice;
    const price = normalizedPrice ? Number(normalizedPrice) : extractJsonLdPrice(html);

    return {
      title: finalTitle,
      imageUrl,
      price: Number.isFinite(price) ? price : 0,
      finalUrl: response.url || url,
    };
  } catch {
    return { title: "", imageUrl: "", price: 0, finalUrl: url };
  }
}

// ─── Action Principal: Publicação Expressa ────────────────────────────────────

export async function generateQuickPostAction(
  affiliateUrl: string,
  channel: Channel | "omnichannel"
): Promise<QuickPostResult> {
  const inputUrl = affiliateUrl.trim();
  const operationId = crypto.randomUUID();

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
  if (detectedPlatform === "Outro" || detectedPlatform === "Amazon" || detectedPlatform === "Magalu") {
    return {
      ok: false,
      status: "UNSUPPORTED_MARKETPLACE",
      message: "Marketplace não reconhecido neste link. Suportamos Shopee, Mercado Livre e Shein.",
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

  // ─── Mercado Livre ────────────────────────────────────────────────────────
  if (detectedPlatform === "Mercado Livre") {
    // PASSO 1: Resolver URL (seguir meli.la → mercadolivre.com.br)
    log("[Express Link Start]", { requestId: operationId, stage: "resolve_url", marketplace: "Mercado Livre" });
    const resolved = await resolveMarketplaceUrl(inputUrl, { maxRedirects: 10, timeoutMs: 15_000 });

    if (resolved.errorCode) {
      const msgMap: Record<string, string> = {
        SSRF_BLOCKED: "Este link aponta para um destino não permitido.",
        REDIRECT_LOOP: "Não conseguimos resolver o link do Mercado Livre — foi detectado um loop de redirecionamento.",
        REDIRECT_LIMIT_EXCEEDED: "O link do Mercado Livre redireciona muitas vezes e não pôde ser resolvido.",
        UNEXPECTED_REDIRECT_DOMAIN: "Esse link redirecionou para um domínio não reconhecido.",
        TIMEOUT_RESOLVING_URL: "O processamento desse link excedeu o tempo permitido.",
        EMPTY_RESPONSE: "Não conseguimos abrir o link do Mercado Livre.",
      };
      log("[Express Link Error]", { requestId: operationId, errorCode: resolved.errorCode, stage: "url_resolution" });
      return { ok: false, status: resolved.errorCode, message: msgMap[resolved.errorCode] || "Erro ao resolver o link do Mercado Livre." };
    }

    resolvedUrl = resolved.resolvedUrl;
    log("[Express Resolved]", { requestId: operationId, resolvedUrl: sanitizeUrlForLog(resolvedUrl), redirectCount: resolved.redirectChain.length });

    // PASSO 2: Extrair item ID da URL RESOLVIDA
    const mlIdInfo = extractMLId(resolvedUrl);
    if (mlIdInfo) {
      itemId = mlIdInfo.id;
    }

    // PASSO 3: Buscar dados do produto via API ML (com OAuth token do usuário)
    log("[Express Parse Start]", { requestId: operationId, marketplace: "Mercado Livre", itemId });
    const mlData = await fetchMLProductDetails(resolvedUrl, userId);

    if (mlData) {
      title = mlData.title;
      imageUrl = mlData.imageUrl || "";
      price = mlData.price ?? 0;
      canonicalUrl = mlData.finalUrl || resolvedUrl;
      if (!itemId) {
        // Tentar extrair da URL final da API
        const extractedId = extractMLId(canonicalUrl);
        if (extractedId) itemId = extractedId.id;
      }
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

    if (resolved.errorCode) {
      const msgMap: Record<string, string> = {
        SSRF_BLOCKED: "Este link aponta para um destino não permitido.",
        REDIRECT_LOOP: "Não conseguimos abrir o link compartilhado da Shopee — loop de redirecionamento.",
        REDIRECT_LIMIT_EXCEEDED: "O link da Shopee redireciona muitas vezes e não pôde ser resolvido.",
        UNEXPECTED_REDIRECT_DOMAIN: "Esse link da Shopee redirecionou para um domínio não reconhecido.",
        TIMEOUT_RESOLVING_URL: "O processamento desse link da Shopee excedeu o tempo permitido.",
        EMPTY_RESPONSE: "Não conseguimos abrir o link compartilhado da Shopee.",
      };
      log("[Express Link Error]", { requestId: operationId, errorCode: resolved.errorCode, stage: "url_resolution" });
      return { ok: false, status: resolved.errorCode, message: msgMap[resolved.errorCode] || "Erro ao resolver o link da Shopee." };
    }

    resolvedUrl = resolved.resolvedUrl;
    canonicalUrl = resolvedUrl;
    log("[Express Resolved]", { requestId: operationId, resolvedUrl: sanitizeUrlForLog(resolvedUrl), redirectCount: resolved.redirectChain.length });

    // Extrair metadados da página resolvida (HTML já capturado pelo resolver)
    log("[Express Parse Start]", { requestId: operationId, marketplace: "Shopee" });
    const shopeeData = await readShopeeMetadata(resolvedUrl, resolved.htmlBody);
    title = shopeeData.title;
    imageUrl = shopeeData.imageUrl;
    price = shopeeData.price;
    shopId = shopeeData.shopId;
    itemId = shopeeData.itemId;
    generatedAffiliateUrl = resolvedUrl; // Shopee: usa o link resolvido como affiliate (app Shopee gerencia comissão)

    log("[Express Parse End]", { requestId: operationId, marketplace: "Shopee", hasTitle: !!title, hasPrice: price > 0, hasImage: !!imageUrl });
  }

  // ─── Shein ────────────────────────────────────────────────────────────────
  else if (detectedPlatform === "Shein") {
    log("[Express Parse Start]", { requestId: operationId, marketplace: "Shein" });
    const sheinData = await readSheinMetadata(inputUrl);
    title = sheinData.title;
    imageUrl = sheinData.imageUrl;
    price = sheinData.price;
    resolvedUrl = sheinData.finalUrl;
    canonicalUrl = sheinData.finalUrl;

    // Extrair product ID da URL Shein
    try {
      const parsed = new URL(canonicalUrl);
      const pidMatch = parsed.pathname.match(/-p-(\d+)/i);
      if (pidMatch) itemId = pidMatch[1];
    } catch { /* ignorar */ }

    generatedAffiliateUrl = canonicalUrl; // Shein: link direto (usuário gera afiliado via app)

    log("[Express Parse End]", { requestId: operationId, marketplace: "Shein", hasTitle: !!title, hasPrice: price > 0, hasImage: !!imageUrl });
  }

  // ─── Validação Progressiva ────────────────────────────────────────────────
  const platform = detectedPlatform;
  log("[Express Validation]", { requestId: operationId, marketplace: platform, itemId, shopId });

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

  const result = await generateOfficialAI(command, createOfficialAIServiceDependencies(supabase, userId));
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
