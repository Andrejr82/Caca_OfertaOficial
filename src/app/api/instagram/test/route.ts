import { NextResponse } from "next/server";
import { testInstagramConnection } from "@/lib/instagram/client";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ ok: false, message: "Supabase não configurado." }, { status: 503 });
    }

    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, message: "Não autenticado." }, { status: 401 });
    }

    // Executa o teste de diagnóstico
    const result = await testInstagramConnection();

    return NextResponse.json(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Erro de servidor ao testar conexão.";
    console.error("Erro ao testar conexão do Instagram:", error);
    return NextResponse.json({ 
      ok: false, 
      message: errorMessage 
    }, { status: 500 });
  }
}
