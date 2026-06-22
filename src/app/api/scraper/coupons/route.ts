import { NextResponse } from "next/server";
import { discoverAndIngestCoupons } from "@/lib/affiliates/scraper";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const maxDuration = 300; 

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

    let limit = 5;
    let sources = ["Mercado Livre"];
    try {
      const body = await request.json();
      if (body) {
        if (typeof body.limit === "number") {
          limit = body.limit;
        }
        if (Array.isArray(body.sources)) {
          sources = body.sources;
        }
      }
    } catch {
      // Ignora erro se não houver corpo
    }

    const offers = await discoverAndIngestCoupons(limit, sources);

    // Gera os posts automaticamente (Bypass rápido no Groq já implementado para Cupons)
    if (offers.length > 0) {
      const baseUrl = new URL(request.url).origin;
      for (const offer of offers) {
        try {
          await fetch(`${baseUrl}/api/ai/generate`, {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "Cookie": request.headers.get("Cookie") || ""
            },
            body: JSON.stringify({ offerId: offer.id })
          });
        } catch (err) {
          console.error(`Falha ao gerar post para o cupom ${offer.id}:`, err);
        }
      }
    }
    
    return NextResponse.json({
      ok: true,
      message: `Buscador de Cupons concluído. ${offers.length} cupons encontrados e listados.`,
      count: offers.length,
      offers: offers
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Erro interno ao buscar cupons.";
    console.error("Erro no endpoint do buscador de cupons:", error);
    return NextResponse.json({
      ok: false,
      message: errorMessage
    }, { status: 500 });
  }
}
