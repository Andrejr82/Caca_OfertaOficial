import { NextResponse, NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { inngest } from "@/lib/inngest/client";
import { PRODUCT_IMAGE_RENDER_VERSION } from "@/lib/images/render-version";
import { logger } from "@/lib/utils/logger";
import {
  isNonHumanTraffic,
  isPreviewCrawler,
  resolveTrackedOfferDestination,
  resolveTrackingSource,
} from "@/lib/tracking/go-request";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildDeterministicImageVersion(offer: any) {
  return createHash("sha1")
    .update([
      String(offer?.id || ""),
      String(offer?.image_url || ""),
      String(offer?.updated_at || ""),
    ].join("|"))
    .digest("hex")
    .slice(0, 12);
}

function buildOgDescription(offer: any) {
  const platform = String(offer?.platform || "").trim();
  const price = Number(offer?.current_price || 0);
  const coupon = String(offer?.coupon || "").trim();

  if (coupon) {
    return `Cupom ${coupon} disponível${platform ? ` em ${platform}` : ""}. Abra para conferir antes que acabe.`;
  }

  if (Number.isFinite(price) && price > 0) {
    return `Oferta${platform ? ` ${platform}` : ""} por ${price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}. Confira antes que acabe.`;
  }

  return "Aproveite esta oferta imperdível antes que acabe.";
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ subId: string[] }> | { subId: string[] } }) {
  const resolvedParams = await params;
  const subIdString = Array.isArray(resolvedParams.subId) ? resolvedParams.subId[0] : resolvedParams.subId;
  const subId = decodeURIComponent(subIdString);

  if (!subId) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    logger.error("Configuração ausente para /go", undefined, { event: "go.config.missing" });
    return NextResponse.json({ error: "Configuração do Supabase ausente" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data: links, error } = await supabase
    .from("affiliate_links")
    .select(`
      id,
      original_url,
      channel,
      offers (
        id,
        product_name,
        platform,
        image_url,
        coupon,
        current_price,
        updated_at,
        explainability
      )
    `)
    .ilike("sub_id", `${subId}%`)
    .limit(1);

  const link = links && links.length > 0 ? (links[0] as any) : null;

  if (error || !link) {
    logger.warn("Link de afiliado não encontrado", {
      event: "go.link.not_found",
      dbCode: error?.code || "not_found",
    });
    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Oferta Não Encontrada</title>
</head>
<body style="display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif; text-align:center; padding:20px; background:#f9fafb; margin:0;">
    <div>
        <h2 style="color:#ef4444; margin-bottom:10px;">⚠️ Oferta Indisponível</h2>
        <p style="color:#4b5563; font-size:16px;">Infelizmente este link expirou ou a oferta foi encerrada.</p>
    </div>
</body>
</html>`;
    return new NextResponse(html, {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const affiliateUrl = resolveTrackedOfferDestination({
    platform: link.offers?.platform,
    originalUrl: link.original_url,
    affiliateUrl: link.offers?.explainability?.affiliate_url,
  });

  if (!affiliateUrl) {
    const isMercadoLivre = String(link.offers?.platform || "").trim().toLowerCase() === "mercado livre";
    logger.warn("Destino afiliado rejeitado", {
      event: "go.redirect.rejected",
      affiliateLinkId: link.id,
      channel: link.channel || "unknown",
      reason: isMercadoLivre ? "ml_monetization_required" : "unsafe_destination",
    });
    return NextResponse.json(
      { error: isMercadoLivre ? "Oferta Mercado Livre sem monetização válida" : "URL de redirecionamento inválida" },
      { status: isMercadoLivre ? 409 : 400 },
    );
  }

  const userAgent = request.headers.get("user-agent") || "";
  const referer = request.headers.get("referer") || "";
  const previewCrawler = isPreviewCrawler(userAgent);
  const nonHumanTraffic = isNonHumanTraffic(userAgent);

  let deviceType = "desktop";
  if (/mobile|android|iphone|ipod/i.test(userAgent)) deviceType = "mobile";
  else if (/ipad|tablet/i.test(userAgent)) deviceType = "tablet";

  // Nunca persiste ou registra a URL completa de origem: somente hostname ou canal.
  const source = resolveTrackingSource(referer, link.channel || "direct");

  if (!nonHumanTraffic) {
    inngest.send({
      name: "tracking/click.registered",
      data: {
        affiliateLinkId: link.id,
        source,
        deviceType,
      },
    }).then(() => {
      logger.info("Clique humano enfileirado", {
        event: "go.click.enqueued",
        affiliateLinkId: link.id,
        channel: link.channel || "unknown",
        source,
        deviceType,
      });
    }).catch(() => {
      logger.error("Falha ao enfileirar clique", undefined, {
        event: "go.click.enqueue_failed",
        affiliateLinkId: link.id,
        channel: link.channel || "unknown",
      });
    });
  }

  try {
    const title = link.offers?.product_name || "Oferta Especial";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://caca-oferta-oficial.vercel.app";
    const canonicalUrl = new URL(`/go/${encodeURIComponent(subId)}`, appUrl).toString();
    const imageVersion = link.offers?.id ? buildDeterministicImageVersion(link.offers) : null;
    const image = link.offers?.id
      ? new URL(`/api/images/og-test?offerId=${encodeURIComponent(link.offers.id)}&v=${PRODUCT_IMAGE_RENDER_VERSION}-${encodeURIComponent(imageVersion || "fallback")}`, appUrl).toString()
      : new URL("/og-image.jpg", appUrl).toString();
    const favicon = new URL("/icons/whatsapp.svg", appUrl).toString();
    const escapedTitle = escapeHtml(title);
    const escapedOgTitle = escapeHtml(`🔥 ${title}`);
    const escapedDescription = escapeHtml(buildOgDescription(link.offers));
    const escapedImage = escapeHtml(image);
    const escapedCanonicalUrl = escapeHtml(canonicalUrl);
    const escapedAffiliateUrl = escapeHtml(affiliateUrl);
    const redirectScriptUrl = JSON.stringify(affiliateUrl);

    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapedTitle}</title>
    <link rel="canonical" href="${escapedCanonicalUrl}">
    <link rel="icon" href="${escapeHtml(favicon)}" type="image/svg+xml">

    <meta name="referrer" content="no-referrer">

    <!-- Open Graph / WhatsApp / Facebook -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="${escapedCanonicalUrl}">
    <meta property="og:title" content="${escapedOgTitle}">
    <meta property="og:description" content="${escapedDescription}">
    <meta property="og:image" content="${escapedImage}">
    <meta property="og:image:secure_url" content="${escapedImage}">
    <meta property="og:image:type" content="image/jpeg">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">

    <!-- Twitter / X -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapedOgTitle}">
    <meta name="twitter:description" content="${escapedDescription}">
    <meta name="twitter:image" content="${escapedImage}">

    ${previewCrawler
      ? "<!-- Preview crawler detectado: sem redirect automático para preservar a leitura do Open Graph -->"
      : `<meta http-equiv="refresh" content="0; url=${escapedAffiliateUrl}">\n    <script>window.location.href = ${redirectScriptUrl};</script>`}
</head>
<body>
    <p>Redirecionando para a oferta... <a href="${escapedAffiliateUrl}">Clique aqui se não for redirecionado.</a></p>
</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
        "Pragma": "no-cache",
        "Expires": "0",
        "Surrogate-Control": "no-store",
      },
    });
  } catch {
    logger.error("Falha ao renderizar redirect /go", undefined, {
      event: "go.render.failed",
      affiliateLinkId: link.id,
      channel: link.channel || "unknown",
    });
    return NextResponse.json({ error: "URL de redirecionamento inválida" }, { status: 400 });
  }
}