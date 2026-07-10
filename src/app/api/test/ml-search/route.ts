import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/test/ml-search?q=QUERY
 * Testa a busca oficial de produtos no Mercado Livre via API REST.
 * Remove esta rota após validação.
 */
export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q") ?? "smartphone";
  const limit = req.nextUrl.searchParams.get("limit") ?? "2";

  const accessToken =
    process.env.MERCADO_LIVRE_ACCESS_TOKEN ??
    "APP_USR-4737683937591844-071006-bc36646b2024b785803a89afcd515921-707437677";

  try {
    const searchUrl = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(query)}&limit=${limit}`;

    console.log("[ML Test] Buscando:", searchUrl);

    const response = await fetch(searchUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: "ML API error", status: response.status, detail: data },
        { status: response.status }
      );
    }

    // Retorna apenas os campos relevantes dos 2 primeiros produtos
    const products = (data.results ?? []).slice(0, Number(limit)).map((item: Record<string, unknown>) => ({
      id: item.id,
      title: item.title,
      price: item.price,
      currency: item.currency_id,
      available_quantity: item.available_quantity,
      condition: item.condition,
      thumbnail: item.thumbnail,
      permalink: item.permalink,
      seller: (item.seller as Record<string, unknown>)?.nickname ?? null,
      shipping_free: (item.shipping as Record<string, unknown>)?.free_shipping ?? false,
    }));

    return NextResponse.json({
      query,
      total_results: data.paging?.total ?? 0,
      source: "Mercado Livre API Oficial",
      products,
    });
  } catch (err) {
    console.error("[ML Test] Erro:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
