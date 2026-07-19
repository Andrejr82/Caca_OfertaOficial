import { NextResponse } from "next/server";
import { fetchMarketplaceCoupons, type ScrapedCoupon } from "@/lib/affiliates/coupon-scraper";

const SUPPORTED_MARKETPLACES = new Set(["shopee", "mercado livre", "amazon"]);

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({}));
    const sources = Array.isArray(payload?.sources) ? payload.sources : [];
    const limit = Math.min(Math.max(Number(payload?.limit) || 5, 1), 50);
    const marketplaces = sources
      .map((source: unknown) => String(source).trim())
      .filter((source: string) => SUPPORTED_MARKETPLACES.has(source.toLowerCase()));

    if (marketplaces.length === 0) {
      return NextResponse.json({ ok: false, message: "Selecione Shopee, Mercado Livre ou Amazon." }, { status: 400 });
    }

    const groups = await Promise.all(marketplaces.map(async (marketplace: string) => {
      try {
        return { marketplace, offers: await fetchMarketplaceCoupons(marketplace, limit), error: null };
      } catch (error) {
        console.error(`[COUPON-API] Falha em ${marketplace}:`, error);
        return { marketplace, offers: [], error: "Fonte indisponível" };
      }
    }));
    const offers = groups.flatMap((group) => group.offers.map((offer: ScrapedCoupon) => ({
      ...offer,
      title: offer.rules,
      productName: offer.rules,
      url: offer.link,
      marketplace: offer.marketplace
    })));

    const marketplaceResults = groups.map((group) => ({
      marketplace: group.marketplace,
      count: group.offers.length,
      status: group.error ? "error" : group.offers.length > 0 ? "found" : "empty",
      message: group.error || (group.offers.length > 0 ? `${group.offers.length} encontrado(s)` : "Nenhum ativo encontrado")
    }));

    return NextResponse.json({
      ok: true,
      offers,
      marketplaceResults,
      message: marketplaceResults.map((item) => `${item.marketplace}: ${item.message}`).join(" • ")
    });
  } catch (error) {
    console.error("[COUPON-API] Falha na busca somente leitura:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível consultar as fontes oficiais de cupons." }, { status: 502 });
  }
}
