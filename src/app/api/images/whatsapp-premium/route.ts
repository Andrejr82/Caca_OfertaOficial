import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { generateOfferWhatsAppPreview } from "@/lib/images/og-preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

function formatHttpDate(value: string | null | undefined) {
  const date = value ? new Date(value) : new Date(0);
  if (Number.isNaN(date.getTime())) return new Date(0).toUTCString();
  return date.toUTCString();
}

function buildExpires(value: string | null | undefined) {
  const date = value ? new Date(value) : new Date(0);
  const base = Number.isNaN(date.getTime()) ? new Date(0) : date;
  base.setFullYear(base.getFullYear() + 1);
  return base.toUTCString();
}

async function handleWhatsAppPremiumRequest(request: Request, includeBody: boolean) {
  const { searchParams } = new URL(request.url);
  const offerId = searchParams.get("offerId");

  if (!offerId) {
    return NextResponse.json({ ok: false, message: "offerId é obrigatório." }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, message: "Supabase não configurado." }, { status: 503 });
  }

  const { data: offer, error } = await supabase
    .from("offers")
    .select("id, product_name, platform, image_url, coupon, current_price, old_price, updated_at, created_at")
    .eq("id", offerId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }

  if (!offer) {
    return NextResponse.json({ ok: false, message: "Oferta não encontrada." }, { status: 404 });
  }

  try {
    const result = await generateOfferWhatsAppPreview(offer);
    const etag = `"${createHash("sha256").update(result.buffer).digest("hex").slice(0, 24)}"`;
    const lastModifiedSource = offer.updated_at || offer.created_at;

    return new NextResponse(includeBody ? new Uint8Array(result.buffer) : null, {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "Content-Length": String(result.bytes),
        "Cache-Control": "public, max-age=31536000, immutable",
        "ETag": etag,
        "Last-Modified": formatHttpDate(lastModifiedSource),
        "Expires": buildExpires(lastModifiedSource),
        "X-WhatsApp-Premium-Width": String(result.width),
        "X-WhatsApp-Premium-Height": String(result.height),
        "X-WhatsApp-Premium-Bytes": String(result.bytes),
        "X-WhatsApp-Premium-Source": result.source,
        "X-WhatsApp-Premium-Fallback-Reason": result.fallbackReason || "",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao gerar imagem premium do WhatsApp.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handleWhatsAppPremiumRequest(request, true);
}

export async function HEAD(request: Request) {
  return handleWhatsAppPremiumRequest(request, false);
}
