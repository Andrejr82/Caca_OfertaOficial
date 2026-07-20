import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const failureSchema = z.object({ error: z.string().trim().min(1).max(1000) });

function authorized(request: Request) {
  const token = process.env.VIDEO_WORKER_TOKEN;
  return Boolean(token && request.headers.get("authorization") === `Bearer ${token}`);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!authorized(request)) return NextResponse.json({ error: "Worker não autorizado." }, { status: 401 });
  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "Supabase admin não configurado." }, { status: 503 });
  const parsed = failureSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Informe o erro do worker." }, { status: 400 });
  const { id } = await params;

  const { data, error } = await supabase
    .from("video_jobs")
    .update({ status: "failed", error_message: parsed.data.error })
    .eq("id", id)
    .eq("status", "processing")
    .select("*")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Job não encontrado ou não está em processamento." }, { status: 409 });
  return NextResponse.json({ job: data });
}
