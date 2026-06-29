import { NextResponse, NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { inngest } from "@/lib/inngest/client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest, { params }: { params: Promise<{ subId: string[] }> | { subId: string[] } }) {
  // Await params to avoid the Next.js 15+ synchronous dynamic API warning
  const resolvedParams = await params;
  
  // Extrai o primeiro elemento do array de parâmetros da rota catch-all
  const subIdString = Array.isArray(resolvedParams.subId) ? resolvedParams.subId[0] : resolvedParams.subId;
  const subId = decodeURIComponent(subIdString);

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
    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Oferta Não Encontrada</title>
</head>
<body style="display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif; text-align:center; padding:20px; background:#f9fafb; margin:0;">
    <div>
        <h2 style="color:#ef4444; margin-bottom:10px;">⚠️ Oferta Indisponível</h2>
        <p style="color:#4b5563; font-size:16px;">Infelizmente este link expirou ou a oferta foi encerrada.</p>
    </div>
</body>
</html>`;
    return new NextResponse(html, {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // Extrair metadados para analytics (anonimizados)
  const userAgent = request.headers.get("user-agent") || "";
  const referer = request.headers.get("referer") || "";
  
  let deviceType = "desktop";
  if (/mobile|android|iphone|ipod/i.test(userAgent)) deviceType = "mobile";
  else if (/ipad|tablet/i.test(userAgent)) deviceType = "tablet";
  
  const source = referer || link.channel || "direct";

  // Dispara o tracking assíncrono para Inngest (Fire and forget)
  // Isso insere no click_events e atualiza o affiliate_links paralelamente sem bloquear o redirect
  inngest.send({
    name: "tracking/click.registered",
    data: {
      affiliateLinkId: link.id,
      source: source,
      deviceType: deviceType
    }
  }).catch(err => console.error("Erro ao enfileirar tracking:", err));

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
    
    <!-- Redirecionamentos Automáticos -->
    ${userAgent.includes('WhatsApp') || userAgent.includes('facebookexternalhit') 
      ? '<!-- Crawler detectado: Meta refresh bloqueado para evitar agrupamento de cache no destino -->' 
      : '<meta http-equiv="refresh" content="0; url=' + originalUrl + '">'}
    
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
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Surrogate-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error("URL original inválida:", link.original_url);
    return NextResponse.json({ error: "URL de redirecionamento inválida" }, { status: 400 });
  }
}
