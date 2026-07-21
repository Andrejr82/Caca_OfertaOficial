import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSubId, createTrackedUrl } from "@/lib/tracking/sub-id";
import { buildCouponSocialMessage } from "@/lib/coupons/presentation";

const DRAFT_CHANNELS = ["instagram", "telegram", "whatsapp"] as const;

export type CouponDraftInput = {
  marketplace: string;
  code?: string | null;
  discount?: string | null;
  rules?: string | null;
  link: string;
  image_url?: string | null;
};

export type CouponDraftPersistenceResult = {
  status: "persisted" | "unauthenticated" | "error";
  offers: number;
  drafts: number;
  skipped: number;
  message: string;
};

export function buildCouponDraftContent(coupon: CouponDraftInput, trackedUrl: string) {
  return buildCouponSocialMessage({
    platform: coupon.marketplace,
    product_name: `[CUPOM] ${coupon.discount || "Cupom disponível"}`,
    coupon: coupon.code && coupon.code !== "RESGATE DIRETO" ? coupon.code : null,
    notes: coupon.rules
  }, trackedUrl);
}

function couponTitle(coupon: CouponDraftInput) {
  const benefit = coupon.discount || "Cupom disponível";
  const product = coupon.rules?.match(/Produto:\s*(.+?)(?:\s*\|\s*|$)/i)?.[1]?.trim();
  return `[CUPOM] ${benefit}${product ? ` - ${product}` : ""}`.slice(0, 240);
}

function couponNotes(coupon: CouponDraftInput) {
  return `Importado automaticamente via Robô de Cupons (${coupon.marketplace}). Benefício: ${coupon.discount || "Cupom disponível"}. Regras: ${coupon.rules || "Verifique as condições no marketplace."}`.slice(0, 1000);
}

export async function persistCouponDrafts(coupons: CouponDraftInput[]): Promise<CouponDraftPersistenceResult> {
  if (coupons.length === 0) {
    return { status: "persisted", offers: 0, drafts: 0, skipped: 0, message: "Nenhum cupom para preparar." };
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { status: "unauthenticated", offers: 0, drafts: 0, skipped: coupons.length, message: "Faça login para preparar cupons para postagem." };
  }

  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;
  if (!userId) {
    return { status: "unauthenticated", offers: 0, drafts: 0, skipped: coupons.length, message: "Faça login para preparar cupons para postagem." };
  }

  let offers = 0;
  let drafts = 0;
  let skipped = 0;

  for (const coupon of coupons) {
    try {
      const { data: existingOffer, error: existingError } = await supabase
        .from("offers")
        .select("id,image_url")
        .eq("user_id", userId)
        .eq("original_url", coupon.link)
        .limit(1)
        .maybeSingle();
      if (existingError) throw existingError;

      let offerId = existingOffer?.id as string | undefined;
      if (offerId && !existingOffer?.image_url && coupon.image_url) {
        const { error: imageError } = await supabase
          .from("offers")
          .update({ image_url: coupon.image_url })
          .eq("id", offerId)
          .eq("user_id", userId);
        if (imageError) throw imageError;
      }
      if (!offerId) {
        const { data: insertedOffer, error: offerError } = await supabase
          .from("offers")
          .insert({
            user_id: userId,
            platform: coupon.marketplace,
            product_name: couponTitle(coupon),
            category: "Cupons",
            original_url: coupon.link,
            image_url: coupon.image_url || null,
            current_price: 0,
            old_price: null,
            coupon: coupon.code === "RESGATE DIRETO" ? null : coupon.code || null,
            score: 0,
            status: "pending_manual_review",
            notes: couponNotes(coupon)
          })
          .select("id")
          .single();
        if (offerError || !insertedOffer) throw offerError || new Error("Oferta de cupom não criada.");
        offerId = insertedOffer.id;
        offers += 1;
      }

      if (!offerId) throw new Error("Oferta de cupom sem identificador.");
      const persistedOfferId = offerId;

      for (const channel of DRAFT_CHANNELS) {
        const subId = createSubId(channel, couponTitle(coupon), persistedOfferId);
        const trackedUrl = createTrackedUrl(coupon.link, subId);
        const { data: affiliateLink, error: linkError } = await supabase
          .from("affiliate_links")
          .upsert({
            user_id: userId,
            offer_id: persistedOfferId,
            channel,
            original_url: coupon.link,
            tracked_url: trackedUrl,
            sub_id: subId
          }, { onConflict: "offer_id,channel" })
          .select("id")
          .single();
        if (linkError || !affiliateLink) throw linkError || new Error("Link afiliado não criado.");

        const { data: existingDraft, error: draftReadError } = await supabase
          .from("posts")
          .select("id")
          .eq("user_id", userId)
          .eq("offer_id", persistedOfferId)
          .eq("channel", channel)
          .eq("status", "draft")
          .limit(1)
          .maybeSingle();
        if (draftReadError) throw draftReadError;

        if (!existingDraft) {
          const { error: draftError } = await supabase.from("posts").insert({
            user_id: userId,
            offer_id: persistedOfferId,
            affiliate_link_id: affiliateLink.id,
            channel,
            content: buildCouponDraftContent(coupon, trackedUrl),
            status: "draft"
          });
          if (draftError) throw draftError;
          drafts += 1;
        }
      }
    } catch (error) {
      skipped += 1;
      console.error("[COUPON-DRAFTS] Falha ao preparar cupom:", error);
    }
  }

  return {
    status: skipped > 0 && offers === 0 && drafts === 0 ? "error" : "persisted",
    offers,
    drafts,
    skipped,
    message: `${drafts} rascunho(s) preparado(s) para Instagram, Telegram e WhatsApp.`
  };
}
