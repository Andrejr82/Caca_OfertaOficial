import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const discardableChannels = new Set(["whatsapp", "telegram", "instagram"]);

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ ok: false, message: "Não autorizado" }, { status: 401 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, message: "Usuário não autenticado" }, { status: 401 });
    }

    const { postId, channel } = await req.json() as { postId?: unknown; channel?: unknown };
    if (typeof postId !== "string" || postId.trim().length === 0) {
      return NextResponse.json({ ok: false, message: "Post ID não fornecido." }, { status: 400 });
    }
    if (typeof channel !== "string" || !discardableChannels.has(channel)) {
      return NextResponse.json({ ok: false, message: "Canal inválido." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("posts")
      .update({
        status: "deleted",
        deleted_at: new Date().toISOString(),
        deleted_by: user.id
      })
      .eq("id", postId)
      .eq("user_id", user.id)
      .eq("channel", channel)
      .eq("status", "draft")
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("[POST REJECT] Erro ao excluir post:", error);
      return NextResponse.json({
        ok: false,
        message: "Erro ao excluir publicação.",
        successCount: 0,
        failureCount: 1
      }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({
        ok: false,
        message: "Draft não encontrado para este tenant e canal.",
        successCount: 0,
        failureCount: 1
      }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      message: "Publicação excluída com sucesso.",
      successCount: 1,
      failureCount: 0
    });
  } catch (error) {
    console.error("[POST REJECT] Erro na rota:", error);
    return NextResponse.json({ ok: false, message: "Erro interno ao excluir publicação." }, { status: 500 });
  }
}
