import { NextResponse } from "next/server";
import { discoverAndIngestTrendingOffers } from "@/lib/affiliates/scraper";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { rankOffersBatch } from "@/lib/offers/curation-engine";

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

    // Lê limite de itens e fontes opcionais do corpo da requisição
    let limit = 5;
    let sources = ["Mercado Livre"];
    let category = "Geral";
    try {
      const body = await request.json();
      if (body) {
        if (typeof body.limit === "number") {
          limit = body.limit;
        }
        if (Array.isArray(body.sources)) {
          sources = body.sources;
        }
        if (typeof body.category === "string") {
          category = body.category;
        }
      }
    } catch {
      // Ignora erro se não houver corpo na requisição
    }

    // Executa o robô de descoberta
    const offers = await discoverAndIngestTrendingOffers(limit, sources, undefined, category);

    // Filtra e ordena comercialmente usando o Curation V2 (Cold Ranking + Quality Gate >= 5.0)
    const rankedOffers = await rankOffersBatch(offers);

    // Sem limite de 3: processamos todas as ofertas retornadas e aprovadas no rank
    const offersToProcess = rankedOffers;

    // Se houver chave da API de IA configurada, geramos as copys automaticamente
    if (process.env.GROQ_API_KEY && offersToProcess.length > 0) {
      const baseUrl = new URL(request.url).origin;
      for (const offer of offersToProcess) {
        try {
          await fetch(`${baseUrl}/api/ai/generate`, {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "Cookie": request.headers.get("Cookie") || "" // mantém sessão
            },
            body: JSON.stringify({ offerId: offer.id })
          });
        } catch (generateError) {
          console.error(`Falha ao gerar criativos por IA para oferta ${offer.id}:`, generateError);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      message: `Robô concluído. ${offers.length} novas ofertas de tendências foram importadas.`,
      count: offers.length,
      offers
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Erro interno ao executar o robô.";
    console.error("Erro no endpoint do robô de tendências:", error);
    return NextResponse.json({
      ok: false,
      message: errorMessage
    }, { status: 500 });
  }
}
