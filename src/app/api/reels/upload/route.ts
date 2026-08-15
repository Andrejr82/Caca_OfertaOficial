import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { authorizedReelStartSchema, buildAuthorizedReelStoragePath } from "@/lib/videos/authorized-reel";

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const parsed = authorizedReelStartSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Dados do criativo inválidos." }, { status: 400 });

  const { data: offer } = await supabase
    .from("offers")
    .select("id")
    .eq("id", parsed.data.offerId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!offer) return NextResponse.json({ error: "Oferta não encontrada para este usuário." }, { status: 404 });

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Upload de vídeos indisponível." }, { status: 503 });

  const uploadId = randomUUID();
  const path = buildAuthorizedReelStoragePath(user.id, uploadId);
  const { data, error } = await admin.storage.from("videos").createSignedUploadUrl(path, { upsert: false });
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Não foi possível preparar o upload." }, { status: 502 });

  return NextResponse.json({ uploadId, path, token: data.token });
}
