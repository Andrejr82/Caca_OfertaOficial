import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { matchTrendSignalsForUser } from "@/lib/trends/matching";
import { discoverMarketplaceCandidates } from "@/lib/trends/targeted-marketplace-discovery";
import { searchShopeeOfficialV1 } from "@/lib/trends/shopee-search-adapter";
import { searchMercadoLivreForTrendQueries, type ExistingMercadoLivreProduct } from "@/lib/trends/mercado-livre-search-adapter";
import { getAppMLAccessToken, getValidMLAccessToken } from "@/lib/platforms/mercadolivre";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const client = await createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: false, message: "Supabase não configurado." }, { status: 503 });
    const { data: { user } } = await client.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, message: "Não autenticado." }, { status: 401 });
    const accessToken = await getValidMLAccessToken(user.id) || process.env.MERCADO_LIVRE_ACCESS_TOKEN || await getAppMLAccessToken();
    // The maintained official intent service remains the ML client boundary.
    const mercadoLivre = require("../../../../../scripts/mercadolivre-official-intents-v5.cjs") as {
      runMercadoLivreOfficialIntentCoverage(input: { keywords: string[]; accessToken: string; maxPerIntent: number; delayMs: number }): Promise<{ products?: ExistingMercadoLivreProduct[] }>;
    };
    const summary = await matchTrendSignalsForUser(client, user.id, async (classification) => {
      const term = classification.normalizedProductTerm ?? "";
      const [shopee, mercadoLivreResult] = await Promise.all([
        discoverMarketplaceCandidates({ marketplace: "Shopee", normalizedProductTerm: term, productIdentity: term, searchShopee: searchShopeeOfficialV1 }),
        accessToken
          ? discoverMarketplaceCandidates({ marketplace: "Mercado Livre", normalizedProductTerm: term, productIdentity: term, searchMercadoLivre: (query) => searchMercadoLivreForTrendQueries(mercadoLivre, [query], accessToken) })
          : Promise.resolve(null)
      ]);
      return [...shopee.candidates, ...(mercadoLivreResult?.candidates ?? [])];
    });
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    console.error("[TREND-MATCHING] Falha ao fazer matching:", error);
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Não foi possível fazer matching." }, { status: 502 });
  }
}
