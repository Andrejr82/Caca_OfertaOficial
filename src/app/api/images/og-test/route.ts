import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { generateOfferOgPreview } from "@/lib/images/og-preview";

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

export async function GET(request: Request) {
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
    const result = await generateOfferOgPreview(offer);
    const etag = `"${createHash("sha256").update(result.buffer).digest("hex").slice(0, 24)}"`;
    const lastModifiedSource = offer.updated_at || offer.created_at;

    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "Content-Length": String(result.bytes),
        "Cache-Control": "public, max-age=31536000, immutable",
        "ETag": etag,
        "Last-Modified": formatHttpDate(lastModifiedSource),
        "Expires": buildExpires(lastModifiedSource),
        "X-OG-Test-Width": String(result.width),
        "X-OG-Test-Height": String(result.height),
        "X-OG-Test-Bytes": String(result.bytes),
        "X-OG-Test-Source": result.source,
        "X-OG-Test-Fallback-Reason": result.fallbackReason || "",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao gerar preview OG.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
