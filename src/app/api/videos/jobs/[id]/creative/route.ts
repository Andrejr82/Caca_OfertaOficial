import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  CREATIVE_RIGHTS_STATUSES,
  certifyCreativeCandidate,
} from "@/lib/videos/creative-candidate";

const requestSchema = z.object({
  rightsStatus: z.enum(CREATIVE_RIGHTS_STATUSES),
  productVisible: z.boolean(),
  demonstratesUse: z.boolean(),
  strongHook: z.boolean(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Informe origem autorizada e sinais do criativo." }, { status: 400 });

  const { id } = await params;
  const { data: job, error: readError } = await supabase
    .from("video_jobs")
    .select("id,status,metadata")
    .eq("id", id)
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!job) return NextResponse.json({ error: "Vídeo não encontrado." }, { status: 404 });
  if (!['ready', 'approved'].includes(job.status)) {
    return NextResponse.json({ error: "O vídeo precisa estar pronto para certificar o criativo." }, { status: 409 });
  }

  const metadata = (job.metadata ?? {}) as Record<string, any>;
  const validation = (metadata.validation ?? {}) as Record<string, any>;
  const durationSeconds = Number(validation.durationSeconds);
  const width = Number(validation.width);
  const height = Number(validation.height);

  const creativeCandidate = certifyCreativeCandidate({
    rightsStatus: parsed.data.rightsStatus,
    width: Number.isFinite(width) && width > 0 ? width : null,
    height: Number.isFinite(height) && height > 0 ? height : null,
    durationSeconds: Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : null,
    productVisible: parsed.data.productVisible,
    demonstratesUse: parsed.data.demonstratesUse,
    strongHook: parsed.data.strongHook,
  });

  const { error: updateError } = await supabase
    .from("video_jobs")
    .update({ metadata: { ...metadata, creativeCandidate } })
    .eq("id", id)
    .eq("user_id", userData.user.id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json({ creativeCandidate });
}
