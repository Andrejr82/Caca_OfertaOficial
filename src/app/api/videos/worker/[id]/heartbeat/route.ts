import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const heartbeatSchema = z.object({ workerId: z.string().trim().min(1).max(120), stage: z.string().trim().min(1).max(80) });

function authorized(request: Request) {
  const token = process.env.VIDEO_WORKER_TOKEN;
  return Boolean(token && request.headers.get("authorization") === `Bearer ${token}`);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!authorized(request)) return NextResponse.json({ error: "Worker não autorizado." }, { status: 401 });
  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "Supabase admin não configurado." }, { status: 503 });
  const parsed = heartbeatSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Heartbeat inválido." }, { status: 400 });
  const { id } = await params;

  const { data, error } = await supabase
    .from("video_jobs")
    .update({ heartbeat_at: new Date().toISOString(), stage: parsed.data.stage })
    .eq("id", id)
    .eq("status", "processing")
    .eq("worker_id", parsed.data.workerId)
    .select("id, stage")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Job cancelado, expirado ou assumido por outro worker." }, { status: 409 });
  return NextResponse.json({ job: data });
}
