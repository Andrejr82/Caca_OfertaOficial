import { NextResponse } from "next/server";
import { scrapeProductDetails } from "@/lib/affiliates/scraper";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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

    const { url } = (await request.json()) as { url?: string };
    if (!url) {
      return NextResponse.json({ ok: false, message: "A URL é obrigatória." }, { status: 400 });
    }

    const isMercadoLivre = url.includes("mercadolivre.com.br") || url.includes("mercadolivre.com");
    const isShein = url.includes("shein.com") || url.includes("shein.top");
    const isMagalu = url.includes("magazineluiza.com.br") || url.includes("magazinevoce.com.br") || url.includes("magazineluiza.onelink.me");

    if (!isMercadoLivre && !isShein && !isMagalu) {
      return NextResponse.json({ 
        ok: false, 
        message: "O robô atualmente suporta apenas links do Mercado Livre, SHEIN e Magalu." 
      }, { status: 400 });
    }

    const scraped = await scrapeProductDetails(url);
    if (!scraped) {
      return NextResponse.json({ 
        ok: false, 
        message: "Não foi possível extrair os dados desta URL. Verifique se o link está correto e se o site está acessível." 
      }, { status: 422 });
    }

    return NextResponse.json({ ok: true, product: scraped });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Erro interno ao tentar raspar o produto.";
    console.error("Erro ao importar produto do Mercado Livre:", error);
    return NextResponse.json({ 
      ok: false, 
      message: errorMessage 
    }, { status: 500 });
  }
}
