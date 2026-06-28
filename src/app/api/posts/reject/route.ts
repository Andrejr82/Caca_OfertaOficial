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

    const { postId } = await req.json();

    if (!postId) {
      return NextResponse.json({ ok: false, message: "Post ID não fornecido." }, { status: 400 });
    }

    const { error: postsError } = await supabase
      .from("posts")
      .update({
        status: "deleted",
        deleted_at: new Date().toISOString(),
        deleted_by: user.id
      })
      .eq("id", postId);

    if (postsError) {
      console.error("[POST REJECT] Erro ao deletar post:", postsError);
      return NextResponse.json({ ok: false, message: "Erro ao excluir publicação." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: "Publicação excluída com sucesso." });
  } catch (error) {
    console.error("[POST REJECT] Erro na rota:", error);
    return NextResponse.json({ ok: false, message: "Erro interno ao excluir publicação." }, { status: 500 });
  }
}
