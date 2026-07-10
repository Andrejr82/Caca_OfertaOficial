import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q") ?? "smartphone";

  const APP_ID = process.env.MERCADO_LIVRE_APP_ID ?? "4737683937591844";
  const CLIENT_SECRET = process.env.MERCADO_LIVRE_CLIENT_SECRET ?? "ghjolsSndOR1Mp591UskpOepNZ8hvyrw";
  const USER_TOKEN = process.env.MERCADO_LIVRE_ACCESS_TOKEN ??
    "APP_USR-4737683937591844-071006-bc36646b2024b785803a89afcd515921-707437677";

  // Tenta obter app-level token (client_credentials)
  let appToken: string | null = null;
  try {
    const tokenRes = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: APP_ID,
        client_secret: CLIENT_SECRET,
      }).toString(),
      cache: "no-store",
    });
    const tokenData = await tokenRes.json();
    appToken = tokenData.access_token ?? null;
  } catch {
    appToken = null;
  }

  const call = async (label: string, url: string, token?: string | null) => {
    try {
      const headers: Record<string, string> = {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; CacaOferta/1.0)",
      };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(url, { headers, cache: "no-store" });
      const data = await res.json();
      return { label, status: res.status, ok: res.ok, data };
    } catch (e) {
      return { label, status: 0, ok: false, data: { error: String(e) } };
    }
  };

  const searchUrl = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(query)}&limit=2`;

  const results = await Promise.all([
    call("1_search_user_token",  searchUrl, USER_TOKEN),
    call("2_search_app_token",   searchUrl, appToken),
    call("3_search_sem_token",   searchUrl),
    call("4_app_token_status",   `https://api.mercadolibre.com/users/me`, appToken),
  ]);

  const summary = results.map(r => ({
    label: r.label,
    status: r.status,
    ok: r.ok,
    produtos: r.ok && Array.isArray((r.data as Record<string,unknown>).results)
      ? ((r.data as Record<string,unknown>).results as Record<string,unknown>[]).slice(0,2).map(p => ({
          id: p.id,
          title: p.title,
          price: p.price,
          permalink: p.permalink,
        }))
      : null,
    erro: !r.ok ? (r.data as Record<string,unknown>).message ?? (r.data as Record<string,unknown>).error : null,
  }));

  return NextResponse.json({
    query,
    app_token_obtained: !!appToken,
    app_token_prefix: appToken ? appToken.substring(0, 30) + "..." : null,
    summary,
  });
}
