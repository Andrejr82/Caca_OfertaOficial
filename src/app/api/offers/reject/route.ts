import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ ok: false, message: "Não autorizado" }, { status: 401 });
    }

    const { offerId } = await req.json();

    if (!offerId) {
      return NextResponse.json({ ok: false, message: "Offer ID não fornecido." }, { status: 400 });
    }

    // Primeiro tentamos deletar o offer. O banco pode estar configurado com CASCADE.
    // Caso não esteja com CASCADE, vamos deletar os posts primeiro por segurança.
    const { error: postsError } = await supabase
      .from("posts")
      .delete()
      .eq("offer_id", offerId);

    if (postsError) {
      console.error("[OFFER REJECT] Erro ao deletar posts:", postsError);
      return NextResponse.json({ ok: false, message: "Erro ao deletar posts associados." }, { status: 500 });
    }

    const { error: offerError } = await supabase
      .from("offers")
      .delete()
      .eq("id", offerId);

    if (offerError) {
      console.error("[OFFER REJECT] Erro ao deletar offer:", offerError);
      return NextResponse.json({ ok: false, message: "Erro ao deletar oferta." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: "Sugestão excluída com sucesso em todas as redes." });
  } catch (error) {
    console.error("[OFFER REJECT] Erro na rota:", error);
    return NextResponse.json({ ok: false, message: "Erro interno ao rejeitar sugestão." }, { status: 500 });
  }
}
