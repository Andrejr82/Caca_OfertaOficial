import { NextResponse } from "next/server";
import { discoverAndIngestTrendingOffers } from "@/lib/affiliates/scraper";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { rankOffersBatch } from "@/lib/offers/curation-engine";
import path from "path";

// Força execução no runtime Node.js e impede cache estático do bundler
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // Limite de 5 minutos para Vercel Pro (Evita o Timeout 504 no scraping pesado)

// Carregamento runtime-only: o bundler (Turbopack/Webpack) não consegue rastrear
// eval('require') estaticamente, evitando que crawlee/esbuild/tsx sejam bundlados.
function loadOracleScraper() {
  const scraperPath = path.join(process.cwd(), "scripts", "oracle-scraper.cjs");
  // eslint-disable-next-line no-eval
  return (eval("require") as NodeRequire)(scraperPath);
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

    // SPRINT 09.7 & 09.8: Intercepta fluxo da Shopee para usar a nova arquitetura (Candidate Queue)
    // O oracle-scraper é carregado via eval('require') para evitar rastreamento estático do bundler.
    if (sources.includes("Shopee")) {
      const oracle = loadOracleScraper();
      const { presentMarketplaceCandidate } = await import("@/lib/presenters/marketplace-candidate");

      const pipelineResult = await oracle.runShopeeOfficialPipeline(category, limit);

      // SPRINT 09.8: Camada de Apresentação (adapta Candidate para formato do Frontend)
      const presentedOffers = pipelineResult.candidates.map((c: any) => presentMarketplaceCandidate(c));

      console.log(`[API][TRENDS] Shopee Candidate Queue acionada. Retornando ${presentedOffers.length} candidates.`);

      return NextResponse.json({
        ok: true,
        message: `Busca de Tendências Shopee concluída (Candidate Queue). ${presentedOffers.length} ofertas prontas para curadoria.`,
        count: presentedOffers.length,
        offers: presentedOffers, // Retorna os Candidates adaptados para o Frontend
        telemetry: pipelineResult.telemetry
      });
    }

    // Executa o robô de descoberta original para as demais fontes
    const offers = await discoverAndIngestTrendingOffers(limit, sources, undefined, category);

    // Filtra e ordena comercialmente usando o Curation V2 (Cold Ranking + Quality Gate >= 5.0)
    const rankedOffers = await rankOffersBatch(offers);

    // Aplicando o corte final (slicing) para garantir que entregaremos a quantidade exata pedida
    // Mesmo que o over-fetching tenha aprovado mais produtos, cortamos no limit.
    const offersToProcess = rankedOffers.slice(0, limit);

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
          // Delay de 2s (30 RPM na Groq) é suficiente e evita que a requisição do usuário expire no Vercel
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (generateError) {
          console.error(`Falha ao gerar criativos por IA para oferta ${offer.id}:`, generateError);
        }
      }
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
