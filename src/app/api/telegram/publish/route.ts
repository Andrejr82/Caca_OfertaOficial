import { NextResponse } from "next/server";
import { generateTelegramMessage } from "@/lib/messages/generate";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { sendTelegramMessage } from "@/lib/telegram/client";
import { createSubId, createTrackedUrl } from "@/lib/tracking/sub-id";
import type { AffiliateLink, Offer } from "@/types/domain";

export async function POST(request: Request) {
  const { offerId } = (await request.json()) as { offerId?: string };
  if (!offerId) return NextResponse.json({ ok: false, message: "offerId obrigatório." }, { status: 400 });

  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ ok: false, message: "Supabase não configurado." }, { status: 503 });

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, message: "Não autenticado." }, { status: 401 });

  const { data: offer, error: offerError } = await supabase.from("offers").select("*").eq("id", offerId).single();
  if (offerError || !offer) return NextResponse.json({ ok: false, message: "Oferta não encontrada." }, { status: 404 });

  const typedOffer = offer as Offer;
  if (typedOffer.status !== "approved") {
    return NextResponse.json({ ok: false, message: "Apenas ofertas aprovadas podem ser publicadas." }, { status: 422 });
  }

  const subId = createSubId("telegram", typedOffer.product_name, typedOffer.id);
  const trackedUrl = createTrackedUrl(typedOffer.original_url, subId);
  const { data: linkData, error: linkError } = await supabase
    .from("affiliate_links")
    .upsert(
      {
        user_id: user.id,
        offer_id: typedOffer.id,
        channel: "telegram",
        original_url: typedOffer.original_url,
        tracked_url: trackedUrl,
        sub_id: subId
      },
      { onConflict: "offer_id,channel" }
    )
    .select("*")
    .single();

  if (linkError || !linkData) return NextResponse.json({ ok: false, message: "Falha ao criar link rastreado." }, { status: 500 });

  const typedLink = linkData as AffiliateLink;
  const content = generateTelegramMessage(typedOffer, typedLink);
  
  let telegramPost;
  try {
    telegramPost = await sendTelegramMessage(content);
  } catch (error: any) {
    console.error("Telegram API Error:", error);
    return NextResponse.json({ ok: false, message: `Erro ao enviar para o Telegram: ${error.message || 'Timeout/Conexão'}` }, { status: 502 });
  }

  const { error: postError } = await supabase.from("posts").insert({
    user_id: user.id,
    offer_id: typedOffer.id,
    affiliate_link_id: typedLink.id,
    channel: "telegram",
    content,
    external_id: String(telegramPost.message_id),
    status: "published",
    posted_at: new Date(telegramPost.date * 1000).toISOString()
  });

  if (postError) return NextResponse.json({ ok: false, message: postError.message }, { status: 500 });

  await supabase.from("offers").update({ status: "posted", updated_at: new Date().toISOString() }).eq("id", typedOffer.id);

  return NextResponse.json({ ok: true, messageId: telegramPost.message_id });
}
