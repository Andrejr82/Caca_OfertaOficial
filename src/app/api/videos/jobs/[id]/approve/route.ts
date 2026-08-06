import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildCopyV2ChannelCopy } from "@/core/ai/prompt";
import { createSubId, createTrackedUrl } from "@/lib/tracking/sub-id";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await params;

  const { data: current, error: readError } = await supabase
    .from("video_jobs")
    .select("*, offers(id,product_name,platform,category,current_price,old_price,original_url,image_url,shipping_free,explainability,marketplace_metrics)")
    .eq("id", id)
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!current || !["ready", "approved"].includes(current.status)) return NextResponse.json({ error: "O vídeo precisa estar pronto para aprovação." }, { status: 409 });

  const { data, error } = await supabase
    .from("video_jobs")
    .update(current.status === "approved" ? {} : { status: "approved", approved_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userData.user.id)
    .in("status", ["ready", "approved"])
    .select("*")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const job = { ...current, ...(data ?? {}) };
  let syncedDraftIds: Record<string, string> = {};
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Não foi possível sincronizar os drafts: SUPABASE_SERVICE_ROLE_KEY ausente na Vercel." }, { status: 503 });
  const offer = Array.isArray(job.offers) ? job.offers[0] : job.offers;
  if (admin && offer) {
    const metadata = (job.metadata ?? {}) as Record<string, any>;
    const draftIds: Record<string, string> = { ...(metadata.draftIds ?? {}) };
    syncedDraftIds = draftIds;
    const channelCopies: Record<string, string> = { ...(metadata.channelCopies ?? {}) };
    const facts = {
      productName: offer.product_name, marketplace: offer.platform, category: offer.category ?? null,
      currentPrice: Number(offer.current_price), originalPrice: offer.old_price == null ? null : Number(offer.old_price),
      freeShipping: offer.shipping_free ?? null, evidence: { ...(offer.explainability ?? {}), ...(offer.marketplace_metrics ?? {}) }
    };
    for (const channel of ["facebook", "instagram"] as const) {
      const subId = createSubId(channel, offer.product_name, offer.id);
      const trackedUrl = createTrackedUrl(offer.original_url, subId);
      const { data: link, error: linkError } = await admin.from("affiliate_links").upsert(
        { user_id: userData.user.id, offer_id: offer.id, channel, original_url: offer.original_url, tracked_url: trackedUrl, sub_id: subId },
        { onConflict: "offer_id,channel" }
      ).select("id").single();
      if (linkError || !link) return NextResponse.json({ error: `Falha ao preparar o link do canal ${channel}: ${linkError?.message ?? "registro ausente"}` }, { status: 502 });
      const content = buildCopyV2ChannelCopy(facts, channel);
      channelCopies[channel] = content;
      const { data: draft } = await admin.from("posts").select("id").eq("user_id", userData.user.id).eq("offer_id", offer.id).eq("channel", channel).eq("status", "draft").maybeSingle();
      if (draft) {
        // Atualiza o draft existente com a nova copy
        await admin.from("posts").update({ content }).eq("id", draft.id);
        draftIds[channel] = draft.id;
      } else {
        const { data: published } = await admin.from("posts").select("id").eq("user_id", userData.user.id).eq("offer_id", offer.id).eq("channel", channel).eq("status", "published").limit(1).maybeSingle();
        if (!published) {
          const { data: created } = await admin.from("posts").insert({ user_id: userData.user.id, offer_id: offer.id, affiliate_link_id: link.id, channel, content, status: "draft" }).select("id").single();
          if (!created) return NextResponse.json({ error: `Falha ao criar o draft do canal ${channel}.` }, { status: 502 });
          draftIds[channel] = created.id;
        } else delete draftIds[channel];
      }
    }
    const { error: metadataError } = await admin.from("video_jobs").update({ metadata: { ...metadata, draftIds, channelCopies } }).eq("id", job.id).eq("user_id", userData.user.id);
    if (metadataError) return NextResponse.json({ error: `Falha ao vincular os drafts ao vídeo: ${metadataError.message}` }, { status: 502 });
  }
  return NextResponse.json({ job, drafts: syncedDraftIds });
}
