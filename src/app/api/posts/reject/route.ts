import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ ok: false, message: "Não autorizado" }, { status: 401 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, message: "Usuário não autenticado" }, { status: 401 });
    }

    return NextResponse.json({
      ok: false,
      message: "Rejeição de post desconectada: a máquina oficial permite somente draft → published."
    }, { status: 409 });
  } catch (error) {
    console.error("[POST REJECT] Erro na rota:", error);
    return NextResponse.json({ ok: false, message: "Erro interno ao excluir publicação." }, { status: 500 });
  }
}
