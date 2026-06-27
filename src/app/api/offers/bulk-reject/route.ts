import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ ok: false, message: "Não autorizado" }, { status: 401 });
    }

    const { offerIds } = await req.json();

    if (!offerIds || !Array.isArray(offerIds) || offerIds.length === 0) {
      return NextResponse.json({ ok: false, message: "Lista de IDs de oferta não fornecida ou vazia." }, { status: 400 });
    }

    // Deletar os posts vinculados às ofertas primeiro por segurança (caso não haja CASCADE)
    const { error: postsError } = await supabase
      .from("posts")
      .delete()
      .in("offer_id", offerIds);

    if (postsError) {
      console.error("[OFFER BULK REJECT] Erro ao deletar posts:", postsError);
      return NextResponse.json({ ok: false, message: "Erro ao deletar posts associados." }, { status: 500 });
    }

    // Deletar as ofertas
    const { error: offerError } = await supabase
      .from("offers")
      .delete()
      .in("id", offerIds);

    if (offerError) {
      console.error("[OFFER BULK REJECT] Erro ao deletar ofertas:", offerError);
      return NextResponse.json({ ok: false, message: "Erro ao deletar ofertas em lote." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: `${offerIds.length} ofertas excluídas com sucesso em todas as redes.` });
  } catch (error) {
    console.error("[OFFER BULK REJECT] Erro na rota:", error);
    return NextResponse.json({ ok: false, message: "Erro interno ao processar exclusão em lote." }, { status: 500 });
  }
}
