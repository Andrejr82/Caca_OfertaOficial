import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const CHANNELS = new Set(["facebook", "instagram", "telegram", "whatsapp"]);

export async function POST(request: Request) {
  try {
    const body = await request.json() as { postId?: string; channel?: string; content?: string };
    const postId = String(body.postId || "").trim();
    const channel = String(body.channel || "").trim().toLowerCase();
    const content = String(body.content || "").trim();
    if (!postId || !CHANNELS.has(channel) || !content) {
      return NextResponse.json({ ok: false, message: "postId, canal e conteúdo são obrigatórios." }, { status: 400 });
    }
    if (content.length > 10000) {
      return NextResponse.json({ ok: false, message: "A mensagem excede o limite permitido." }, { status: 400 });
    }

    const client = await createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: false, message: "Supabase não configurado." }, { status: 503 });
    const { data: { user } } = await client.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, message: "Não autenticado." }, { status: 401 });

    const { data, error } = await client
      .from("posts")
      .update({ content })
      .eq("id", postId)
      .eq("user_id", user.id)
      .eq("channel", channel)
      .eq("status", "draft")
      .select("id")
      .maybeSingle();
    if (error) return NextResponse.json({ ok: false, message: "Não foi possível salvar a mensagem." }, { status: 502 });
    if (!data) return NextResponse.json({ ok: false, message: "Rascunho não encontrado ou já publicado." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[POSTS] Falha ao salvar conteúdo editado:", error);
    return NextResponse.json({ ok: false, message: "Falha ao salvar a mensagem." }, { status: 500 });
  }
}
