import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request, { params }: { params: Promise<{ subId: string }> | { subId: string } }) {
  // Await params to avoid the Next.js 15+ synchronous dynamic API warning
  const { subId } = await params;

  if (!subId) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing Supabase credentials for redirect");
    return NextResponse.json({ error: "Configuração do Supabase ausente" }, { status: 500 });
  }

  // Create admin client to bypass RLS for public link redirection
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Find the affiliate link by sub_id and join the offer to grab metadata (image & title)
  const { data: links, error } = await supabase
    .from("affiliate_links")
    .select(`
      *,
      offers (
        product_name,
        image_url
      )
    `)
    .ilike("sub_id", `${subId}%`)
    .limit(1);

  const link = links && links.length > 0 ? (links[0] as any) : null;

  if (error || !link) {
    console.error("Link não encontrado para o subId:", subId, error);
    return NextResponse.json({ error: "Link não encontrado ou bloqueado por RLS", subId, supabaseError: error }, { status: 404 });
  }

  // Increment clicks. Using an RPC would be better to avoid race conditions,
  // but a simple update is acceptable for the MVP.
  await supabase
    .from("affiliate_links")
    .update({ clicks: (link.clicks || 0) + 1 })
    .eq("id", link.id);

  // Redirect cleanly to the original affiliate URL.
  try {
    const originalUrl = link.original_url.startsWith('http') 
      ? link.original_url 
      : `https://${link.original_url}`;
    
    // Instead of a 302 redirect, return an HTML page with Open Graph tags and an instant redirect.
    // This allows WhatsApp and Telegram to scrape the metadata and generate HIGH-QUALITY Link Previews!
    const title = link.offers?.product_name || "Oferta Especial";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://caca-oferta-oficial.vercel.app";
    const rawImage = link.offers?.image_url || `${appUrl}/og-image.jpg`;
    const image = rawImage.includes('http2.mlstatic.com') 
      ? `${appUrl}/api/images/proxy?url=${encodeURIComponent(rawImage)}`
      : rawImage;

    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    
    <!-- Open Graph / WhatsApp / Facebook -->
    <meta property="og:type" content="website">
    <meta property="og:title" content="🔥 ${title}">
    <meta property="og:description" content="Aproveite esta oferta imperdível!">
    <meta property="og:image" content="${image}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    
    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="🔥 ${title}">
    <meta name="twitter:description" content="Aproveite esta oferta imperdível!">
    <meta name="twitter:image" content="${image}">

    <!-- Redirecionamentos Automáticos -->
    <meta http-equiv="refresh" content="0; url=${originalUrl}">
    <script>
        window.location.href = "${originalUrl}";
    </script>
</head>
<body>
    <p>Redirecionando para a oferta... <a href="${originalUrl}">Clique aqui se não for redirecionado.</a></p>
</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (err) {
    console.error("URL original inválida:", link.original_url);
    return NextResponse.json({ error: "URL de redirecionamento inválida" }, { status: 400 });
  }
}
