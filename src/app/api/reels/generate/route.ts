import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  AUTO_REEL_PIPELINE_STATES,
  AUTO_REEL_SOURCE,
  AUTO_REEL_STYLE,
  buildFactualSnapshotFromOffer,
} from "@/lib/videos/auto-reel";

const requestSchema = z.object({
  offerId: z.string().min(1),
  style: z.literal(AUTO_REEL_STYLE),
});

const jobSelect = "id,user_id,offer_id,status,stage,video_url,template_id,metadata,created_at";

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  let parsed;
  try {
    parsed = requestSchema.safeParse(await request.json());
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }
  if (!parsed.success) return NextResponse.json({ error: "Informe somente offerId e style válidos." }, { status: 400 });

  const { data: offer, error: offerError } = await supabase
    .from("offers")
    .select("id,product_name,platform,current_price,image_url")
    .eq("id", parsed.data.offerId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (offerError) return NextResponse.json({ error: "Não foi possível carregar a oferta." }, { status: 502 });
  if (!offer) return NextResponse.json({ error: "Oferta não encontrada para este usuário." }, { status: 404 });

  let factualSnapshot;
  try {
    factualSnapshot = buildFactualSnapshotFromOffer(offer);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Oferta sem dados obrigatórios." }, { status: 422 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Persistência de vídeo indisponível." }, { status: 503 });

  const { data: existingJob, error: existingError } = await admin
    .from("video_jobs")
    .select(jobSelect)
    .eq("user_id", user.id)
    .eq("offer_id", parsed.data.offerId)
    .eq("template_id", "auto-reel-v1")
    .in("stage", [...AUTO_REEL_PIPELINE_STATES])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) return NextResponse.json({ error: "Não foi possível verificar geração existente." }, { status: 502 });
  if (existingJob) return NextResponse.json({ job: existingJob }, { status: 200 });

  const metadata = {
    source: AUTO_REEL_SOURCE,
    style: AUTO_REEL_STYLE,
    attempt: 1,
    factualSnapshot,
  };
  const { data: job, error: insertError } = await admin
    .from("video_jobs")
    .insert({
      user_id: user.id,
      offer_id: parsed.data.offerId,
      status: "processing",
      stage: "planning",
      script: "Reel demonstrativo aguardando pipeline visual.",
      video_url: null,
      template_id: "auto-reel-v1",
      metadata,
    })
    .select(jobSelect)
    .single();

  if (insertError || !job) return NextResponse.json({ error: insertError?.message ?? "Não foi possível criar o Reel." }, { status: 500 });
  return NextResponse.json({ job }, { status: 201 });
}

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const jobId = new URL(request.url).searchParams.get("jobId");
  if (!jobId) return NextResponse.json({ error: "jobId ausente." }, { status: 400 });

  const { data: job, error } = await supabase
    .from("video_jobs")
    .select(jobSelect)
    .eq("id", jobId)
    .eq("user_id", user.id)
    .eq("template_id", "auto-reel-v1")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Não foi possível consultar o Reel." }, { status: 502 });
  if (!job) return NextResponse.json({ error: "Reel não encontrado." }, { status: 404 });
  return NextResponse.json({ job });
}
