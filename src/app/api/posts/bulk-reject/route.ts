import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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

    const { postIds } = await req.json();

    if (!postIds || !Array.isArray(postIds) || postIds.length === 0) {
      return NextResponse.json({ ok: false, message: "Post IDs não fornecidos." }, { status: 400 });
    }

    const { error: postsError } = await supabase
      .from("posts")
      .update({
        status: "deleted",
        deleted_at: new Date().toISOString(),
        deleted_by: user.id
      })
      .in("id", postIds);

    if (postsError) {
      console.error("[POST BULK REJECT] Erro ao deletar posts:", postsError);
      return NextResponse.json({ ok: false, message: "Erro ao excluir publicações em lote." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: "Publicações excluídas com sucesso." });
  } catch (error) {
    console.error("[POST BULK REJECT] Erro na rota:", error);
    return NextResponse.json({ ok: false, message: "Erro interno ao excluir publicações." }, { status: 500 });
  }
}
