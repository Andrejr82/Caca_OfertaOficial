import { NextResponse } from "next/server";
import { discoverAndIngestTrendingOffers } from "@/lib/affiliates/scraper";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { rankOffersBatch } from "@/lib/offers/curation-engine";

export const maxDuration = 300; // Limite de 5 minutos para Vercel Pro (Evita o Timeout 504 no scraping pesado)

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

    // Aplicando o corte final (slicing) para garantir que entregaremos a quantidade exata pedida
    // Mesmo que o over-fetching tenha aprovado mais produtos, cortamos no limit.
    const offersToProcess = rankedOffers.slice(0, limit);

    // Se houver chave da API de IA configurada, geramos as copys automaticamente
    if (process.env.GROQ_API_KEY && offersToProcess.length > 0) {
      const baseUrl = new URL(request.url).origin;
      const generatePromises = offersToProcess.map(offer => {
        return fetch(`${baseUrl}/api/ai/generate`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Cookie": request.headers.get("Cookie") || "" // mantém sessão
          },
          body: JSON.stringify({ offerId: offer.id })
        }).catch(generateError => {
          console.error(`Falha ao gerar criativos por IA para oferta ${offer.id}:`, generateError);
        });
      });
      // Executa as gerações em paralelo para poupar tempo precioso da Vercel (Hobby limite = 60s)
      await Promise.all(generatePromises);
    }

    if (offers.length === 0) {
      const hasFirecrawl = !!process.env.FIRECRAWL_API_KEY;
      const hasML = !!process.env.MERCADO_LIVRE_CLIENT_SECRET;
      const hasSupa = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
      const debugInfo = `[RAIO-X VERCEL] Firecrawl=${hasFirecrawl ? 'OK' : 'FALTA'} | ML=${hasML ? 'OK' : 'FALTA'} | Supabase=${hasSupa ? 'OK' : 'FALTA'} | URL=${process.env.NEXT_PUBLIC_SITE_URL ? 'OK' : 'FALTA'}`;
      console.log(debugInfo);
    }

    return NextResponse.json({
      ok: true,
      message: `Robô concluído. ${offersToProcess.length} ofertas de alta conversão foram importadas (de ${offers.length} raspadas).`,
      count: offersToProcess.length,
      offers: offersToProcess
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
