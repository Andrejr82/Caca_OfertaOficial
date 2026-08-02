import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { logAuditAction } from "@/lib/security/audit";

export async function GET() {
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

    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("user_id", user.id)
      .eq("key", "general_settings")
      .maybeSingle();

    if (error) {
      console.error("Erro ao buscar configurações gerais:", error);
      return NextResponse.json({ ok: false, message: "Erro ao carregar configurações." }, { status: 500 });
    }

    const defaultSettings = {
      cron_scraping_enabled: false,
      notifications_enabled: false,
      telegram_automation_enabled: false
    };

    return NextResponse.json({
      ok: true,
      settings: data?.value || defaultSettings
    });
  } catch (error) {
    console.error("Erro interno no endpoint de configurações gerais (GET):", error);
    return NextResponse.json({ ok: false, message: "Erro interno no servidor." }, { status: 500 });
  }
}

export async function POST(request: Request) {
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

    const body = await request.json();
    const { cron_scraping_enabled, notifications_enabled, telegram_automation_enabled } = body;

    if (typeof cron_scraping_enabled !== "boolean" || typeof notifications_enabled !== "boolean" || typeof telegram_automation_enabled !== "boolean") {
      return NextResponse.json({ ok: false, message: "Parâmetros inválidos." }, { status: 400 });
    }

    const configValue = {
      cron_scraping_enabled,
      notifications_enabled,
      telegram_automation_enabled
    };

    // Usar upsert para inserir ou atualizar a configuração baseada em (user_id, key)
    const { error } = await supabase
      .from("app_settings")
      .upsert(
        {
          user_id: user.id,
          key: "general_settings",
          value: configValue,
          updated_at: new Date().toISOString()
        },
        {
          onConflict: "user_id,key"
        }
      );

    if (error) {
      console.error("Erro ao salvar configurações gerais no banco:", error);
      return NextResponse.json({ ok: false, message: `Erro ao salvar configurações: ${error.message}` }, { status: 500 });
    }

    // Registrar log de auditoria
    await logAuditAction(
      "update_general_settings",
      `Cron de Scraping: ${cron_scraping_enabled ? "Ativo" : "Inativo"} | Notificações Realtime: ${notifications_enabled ? "Ativo" : "Inativo"} | Automação Telegram: ${telegram_automation_enabled ? "Ativo" : "Inativo"}`
    );

    return NextResponse.json({
      ok: true,
      message: "Configurações gerais salvas com sucesso.",
      settings: configValue
    });
  } catch (error) {
    console.error("Erro interno no endpoint de configurações gerais (POST):", error);
    return NextResponse.json({ ok: false, message: "Erro interno no servidor." }, { status: 500 });
  }
}
