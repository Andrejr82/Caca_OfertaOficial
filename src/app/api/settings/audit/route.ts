import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ ok: false, message: "Supabase não configurado." }, { status: 503 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, message: "Não autorizado." }, { status: 401 });
    }

    // Apenas Admins podem ler todos os logs de auditoria
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role !== "admin") {
      return NextResponse.json({ ok: false, message: "Apenas administradores podem ler os logs de auditoria." }, { status: 403 });
    }

    // Busca os logs mais recentes
    const { data: logs, error } = await supabase
      .from("audit_logs")
      .select(`
        id,
        action,
        details,
        created_at,
        profiles:user_id (
          full_name,
          role
        )
      `)
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) {
      // Retorna array vazio em caso de erro (ex: tabela ainda não criada) para tratamento tolerante
      return NextResponse.json({ ok: true, logs: [], warning: "Tabela audit_logs não encontrada no banco." });
    }

    // Formata o retorno para exibição amigável
    const formattedLogs = logs.map((log: any) => ({
      id: log.id,
      action: log.action,
      details: log.details,
      created_at: new Date(log.created_at).toLocaleString("pt-BR"),
      user_name: log.profiles?.full_name || "Sistema"
    }));

    return NextResponse.json({ ok: true, logs: formattedLogs });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro interno.";
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}
