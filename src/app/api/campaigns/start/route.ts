import { NextResponse } from "next/server";

import { startOfferCampaign } from "@/lib/campaigns/offer-campaigns";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Supabase indisponível." }, { status: 500 });

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });

  let body: { videoJobId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const videoJobId = String(body.videoJobId ?? "").trim();
  if (!videoJobId) return NextResponse.json({ error: "Vídeo inválido." }, { status: 400 });

  const { data: job, error: jobError } = await supabase
    .from("video_jobs")
    .select("id,offer_id,status,user_id")
    .eq("id", videoJobId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (jobError) return NextResponse.json({ error: jobError.message }, { status: 500 });
  if (!job) return NextResponse.json({ error: "Vídeo não encontrado." }, { status: 404 });
  if (job.status !== "approved") {
    return NextResponse.json({ error: "A campanha só pode ser iniciada após a aprovação do vídeo." }, { status: 409 });
  }

  try {
    const result = await startOfferCampaign(supabase, user.id, job.offer_id);
    return NextResponse.json({
      ok: true,
      created: result.created,
      campaign: {
        id: result.campaign.id,
        offerId: result.campaign.offer_id,
        status: result.campaign.status,
        startedAt: result.campaign.started_at,
        endsAt: result.campaign.ends_at,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível iniciar a campanha." },
      { status: 500 },
    );
  }
}
