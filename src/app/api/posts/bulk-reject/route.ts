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

    const { postIds, channel } = await req.json() as { postIds?: unknown; channel?: unknown };
    if (!Array.isArray(postIds) || postIds.length === 0 || postIds.some((id) => typeof id !== "string" || id.trim().length === 0)) {
      return NextResponse.json({ ok: false, message: "Post IDs não fornecidos." }, { status: 400 });
    }
    if (typeof channel !== "string" || !discardableChannels.has(channel)) {
      return NextResponse.json({ ok: false, message: "Canal inválido." }, { status: 400 });
    }

    const uniquePostIds = [...new Set(postIds as string[])];
    const deletedAt = new Date().toISOString();
    const results: Array<{ postId: string; ok: boolean; message?: string }> = [];

    for (const postId of uniquePostIds) {
      try {
        const { data, error } = await supabase
          .from("posts")
          .update({ status: "deleted", deleted_at: deletedAt, deleted_by: user.id })
          .eq("id", postId)
          .eq("user_id", user.id)
          .eq("channel", channel)
          .eq("status", "draft")
          .select("id")
          .maybeSingle();

        if (error) {
          results.push({ postId, ok: false, message: error.message });
        } else if (!data) {
          results.push({ postId, ok: false, message: "Draft não encontrado para este tenant e canal." });
        } else {
          results.push({ postId, ok: true });
        }
      } catch (error) {
        results.push({
          postId,
          ok: false,
          message: error instanceof Error ? error.message : "Erro inesperado ao excluir publicação."
        });
      }
    }

    const successCount = results.filter((result) => result.ok).length;
    const failureCount = results.length - successCount;
    const message = `${successCount} publicação(ões) excluída(s); ${failureCount} falha(s).`;

    return NextResponse.json({
      ok: failureCount === 0,
      message,
      successCount,
      failureCount,
      results
    }, { status: failureCount === 0 ? 200 : 207 });
  } catch (error) {
    console.error("[POST BULK REJECT] Erro na rota:", error);
    return NextResponse.json({ ok: false, message: "Erro interno ao excluir publicações." }, { status: 500 });
  }
}
