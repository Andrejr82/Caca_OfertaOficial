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

  // Find the affiliate link by sub_id
  const { data: link, error } = await supabase
    .from("affiliate_links")
    .select("*")
    .eq("sub_id", subId)
    .single();

  if (error || !link) {
    console.error("Link não encontrado para o subId:", subId, error);
    // Para debug do erro 404 relatado: retornar um erro 404 com body descritivo para podermos ler a resposta.
    return NextResponse.json({ error: "Link não encontrado ou bloqueado por RLS", subId, supabaseError: error }, { status: 404 });
  }

  // Increment clicks. Using an RPC would be better to avoid race conditions,
  // but a simple update is acceptable for the MVP.
  await supabase
    .from("affiliate_links")
    .update({ clicks: (link.clicks || 0) + 1 })
    .eq("id", link.id);

  // Redirect cleanly to the original affiliate URL.
  // Validate URL format before redirecting to avoid Next.js 404 errors on relative paths
  try {
    const originalUrl = link.original_url.startsWith('http') 
      ? link.original_url 
      : `https://${link.original_url}`;
    
    return NextResponse.redirect(originalUrl);
  } catch (err) {
    console.error("URL original inválida:", link.original_url);
    return NextResponse.json({ error: "URL de redirecionamento inválida" }, { status: 400 });
  }
}
