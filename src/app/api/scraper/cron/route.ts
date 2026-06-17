import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { discoverAndIngestTrendingOffers } from "@/lib/affiliates/scraper";
import { createSubId, createTrackedUrl } from "@/lib/tracking/sub-id";
import { generateOfferAnalysis } from "@/lib/ai/groq";
import { calculateFinalRankScore } from "@/lib/offers/score-v2";

export async function GET(request: Request) {
  return handleCron(request);
}

export async function POST(request: Request) {
  return handleCron(request);
}

async function handleCron(request: Request) {
  try {
    // 1. Validar autorização do Cron
    const authHeader = request.headers.get("authorization");
    const { searchParams } = new URL(request.url);
    const tokenParam = searchParams.get("token");

    const expectedSecret = process.env.CRON_SECRET;
    const isProduction = process.env.NODE_ENV === "production";

    if (isProduction && !expectedSecret) {
      console.error("[CRON] CRON_SECRET não configurado no ambiente de produção!");
      return NextResponse.json({ ok: false, message: "Erro de configuração do servidor." }, { status: 500 });
    }

    const secretToUse = expectedSecret || "desenvolvimento-local-caca-oferta";
    const token = authHeader ? authHeader.replace("Bearer ", "") : tokenParam;

    if (token !== secretToUse) {
      return NextResponse.json({ ok: false, message: "Não autorizado." }, { status: 401 });
    }

    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return NextResponse.json({ ok: false, message: "Cliente Supabase Admin não configurado." }, { status: 503 });
    }

    // 2. Buscar usuários que ativaram o Cron de Scraping
    const { data: settings, error: settingsError } = await supabase
      .from("app_settings")
      .select("user_id, value")
      .eq("key", "general_settings");

    if (settingsError) {
      console.error("Erro ao carregar configurações gerais no cron:", settingsError);
      return NextResponse.json({ ok: false, message: "Erro ao carregar configurações no banco." }, { status: 500 });
    }

    const activeUsers = settings
      ?.filter((s: any) => s.value && s.value.cron_scraping_enabled === true)
      .map((s: any) => s.user_id) || [];

    if (activeUsers.length === 0) {
      return NextResponse.json({ ok: true, message: "Nenhum usuário com cron de scraping ativado." });
    }

    // 3. Agendar processamento em background via Inngest para cada usuário ativo
    const { inngest } = await import("@/lib/inngest/client");

    const events = activeUsers.map((userId: string) => ({
      name: "cron/run-scraping",
      data: { userId }
    }));

    if (events.length > 0) {
      await inngest.send(events);
      console.log(`[CRON] Enfileirados eventos cron/run-scraping para ${events.length} usuários.`);
    }

    return NextResponse.json({
      ok: true,
      message: `Scraping agendado via Inngest com sucesso para ${activeUsers.length} usuários ativos.`,
      activeUsersCount: activeUsers.length
    });

  } catch (error) {
    console.error("Erro interno no cron:", error);
    return NextResponse.json({ ok: false, message: "Erro interno no servidor." }, { status: 500 });
  }
}
