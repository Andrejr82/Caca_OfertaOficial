import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q") ?? "smartphone";
  const accessToken =
    process.env.MERCADO_LIVRE_ACCESS_TOKEN ??
    "APP_USR-4737683937591844-071006-bc36646b2024b785803a89afcd515921-707437677";

  const call = async (label: string, url: string, withToken = false) => {
    try {
      const headers: Record<string, string> = { Accept: "application/json" };
      if (withToken) headers["Authorization"] = `Bearer ${accessToken}`;
      const res = await fetch(url, { headers, cache: "no-store" });
      const data = await res.json();
      return { label, status: res.status, ok: res.ok, data };
    } catch (e) {
      return { label, status: 0, ok: false, error: String(e) };
    }
  };

  const results = await Promise.all([
    call("1_search_sem_token", `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(query)}&limit=2`),
    call("2_search_com_token", `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(query)}&limit=2`, true),
    call("3_users_me",         `https://api.mercadolibre.com/users/me`, true),
    call("4_sites_MLB",        `https://api.mercadolibre.com/sites/MLB`),
    call("5_categorias",       `https://api.mercadolibre.com/sites/MLB/categories`),
    call("6_item_direto",      `https://api.mercadolibre.com/items/MLB3604966831`, true),
    call("7_trends",           `https://api.mercadolibre.com/trends/MLB`),
  ]);

  // Resumo legível
  const summary = results.map(r => ({
    label: r.label,
    status: r.status,
    ok: r.ok,
    info: r.ok
      ? (r.label === "3_users_me"
          ? `nickname=${(r.data as Record<string,unknown>).nickname}`
          : r.label === "6_item_direto"
            ? `title=${(r.data as Record<string,unknown>).title}`
            : `paging.total=${((r.data as Record<string,unknown>).paging as Record<string,unknown>)?.total ?? "N/A"}`)
      : `ERRO: ${(r.data as Record<string,unknown>)?.message ?? (r as Record<string,unknown>).error}`
  }));

  return NextResponse.json({
    query,
    token_valid: results[2].ok,
    summary,
    detail: results
  });
}
