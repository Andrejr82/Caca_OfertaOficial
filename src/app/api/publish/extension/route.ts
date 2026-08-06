import { NextResponse } from "next/server";
import { generateOfficialAI, type OfficialAIChannel, type OfficialAICommand } from "@/core/ai";
import { createOfficialAIServiceDependencies } from "@/lib/ai/official/create-official-ai-service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { randomUUID } from "crypto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Command-Id, X-Correlation-Id"
};

interface ExtensionAIRequest {
  title: string;
  price: number;
  imageUrl: string;
  finalUrl: string;
  channels: OfficialAIChannel[];
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as ExtensionAIRequest;
    
    if (!body.title || typeof body.price !== "number" || body.price <= 0 || !body.finalUrl) {
      return NextResponse.json({
        ok: false,
        code: "INVALID_EXTENSION_PAYLOAD",
        message: "Dados do produto incompletos ou preço inválido (R$ 0,00). Atualize a página do produto e tente novamente."
      }, { status: 400, headers: corsHeaders });
    }

    const adminClient = createSupabaseAdminClient();
    if (!adminClient) {
      return NextResponse.json({ ok: false, code: "DEPENDENCY_UNAVAILABLE", message: "Admin client indisponível" }, { status: 503, headers: corsHeaders });
    }

    // Buscar o primeiro usuário admin para atribuir a oferta a ele
    const { data: adminProfiles, error: profileError } = await adminClient
      .from("profiles")
      .select("id")
      .eq("role", "admin")
      .limit(1);

    if (profileError || !adminProfiles || adminProfiles.length === 0) {
       return NextResponse.json({ ok: false, code: "NO_ADMIN_FOUND", message: "Nenhum administrador encontrado para associar a oferta" }, { status: 500, headers: corsHeaders });
    }
    const adminId = adminProfiles[0].id;

    // Criar a oferta
    let platform = "Outro";
    const lowerUrl = body.finalUrl.toLowerCase();
    if (lowerUrl.includes("magalu") || lowerUrl.includes("magazine") || lowerUrl.includes("magazineluiza") || lowerUrl.includes("magazinevoce")) platform = "Magalu";
    else if (lowerUrl.includes("amzn") || lowerUrl.includes("amazon")) platform = "Amazon";
    else if (lowerUrl.includes("shopee")) platform = "Shopee";
    else if (lowerUrl.includes("shein")) platform = "Shein";
    else if (lowerUrl.includes("mercadolivre") || lowerUrl.includes("ml")) platform = "Mercado Livre";

    let valid = false;
    if (platform === "Magalu") {
      valid = lowerUrl.includes("magazinevoce") || lowerUrl.includes("parceiromagalu");
    } else if (platform === "Shein") {
      valid = lowerUrl.includes("affiliateid") || lowerUrl.includes("adp");
    } else if (platform === "Amazon") {
      valid = lowerUrl.includes("tag=");
    } else if (platform === "Shopee") {
      valid = lowerUrl.includes("shope.ee") || lowerUrl.includes("affiliates") || lowerUrl.includes("ext_camp");
    } else if (platform === "Mercado Livre") {
      valid = lowerUrl.includes("partner_id=");
    } else {
      valid = true;
    }

    if (!valid) {
      return NextResponse.json({
        ok: false,
        code: "URL_NOT_MONETIZED",
        message: `URL comum rejeitada. O link fornecido para ${platform} não possui parâmetros de afiliado ou não é suportado.`
      }, { status: 400, headers: corsHeaders });
    }

    const newOfferId = randomUUID();
    const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://caca-oferta-oficial.vercel.app";
    const trackedUrl = `${APP_URL}/go/tg_${newOfferId}`;

    const { error: insertError } = await adminClient.from("offers").insert({
      id: newOfferId,
      product_name: body.title,
      current_price: body.price,
      original_url: body.finalUrl,
      image_url: body.imageUrl,
      platform,
      status: "pending_manual_review", // Must be pending_manual_review for draft generation
      user_id: adminId,
      score: 0,
      explainability: {
        contract_version: "pmav5.candidate/v1",
        candidate_id: "ext-" + Date.now(),
        ingestion_id: "ext-ingestion",
        correlation_id: request.headers.get("x-correlation-id") || "ext-correlation",
        discovery_evidence: { source: "chrome-extension" },
        marketplace_metrics: { extracted_at: new Date().toISOString() },
        affiliate_url: body.finalUrl,
        tracked_url: trackedUrl
      }
    });

    if (insertError) {
       return NextResponse.json({ ok: false, code: "INSERT_OFFER_FAILED", message: insertError.message || "Falha ao salvar oferta" }, { status: 500, headers: corsHeaders });
    }

    const { error: linkError } = await adminClient.from("affiliate_links").upsert({
      offer_id: newOfferId,
      user_id: adminId,
      original_url: body.finalUrl,
      channel: "telegram",
      sub_id: `tg_${newOfferId}`,
      tracked_url: trackedUrl
    });

    if (linkError) {
      console.error("Falha ao salvar link de afiliado:", linkError);
    }

    const newOffer = { id: newOfferId };

    // Se o usuário selecionou canais, chama a IA para gerar os rascunhos
    if (body.channels && body.channels.length > 0) {
      const commandId = request.headers.get("x-command-id") || `extension-ai:${newOffer.id}:v1`;
      const command: OfficialAICommand = {
        contractVersion: "pmav5.ai/v1",
        commandId,
        idempotencyKey: `ai:draft:${newOffer.id}:v2`,
        correlationId: request.headers.get("x-correlation-id") || commandId,
        causationId: null,
        offerId: newOffer.id,
        tenantId: adminId,
        providerPreference: "groq", // default
        channels: body.channels,
        requestedAt: request.headers.get("x-requested-at") || new Date().toISOString(),
        actor: { type: "user", id: adminId, service: "chrome-extension" },
        origin: "extension.official-ai-client",
        reason: { code: "GENERATE_OFFICIAL_CONTENT" }
      };

      // Chama o caso de uso oficial, repassando o cliente admin
      const result = await generateOfficialAI(command, createOfficialAIServiceDependencies(adminClient, adminId));
      
      if (result.status === "rejected") {
        return NextResponse.json({
          ok: false,
          code: "AI_REJECTED",
          message: `Falha ao gerar rascunhos: ${'message' in result ? result.message : 'Erro desconhecido'}`
        }, { status: 500, headers: corsHeaders });
      }

      return NextResponse.json({ 
        ok: true, 
        offerId: newOffer.id, 
        aiStatus: result.status,
        message: "Oferta salva e rascunhos gerados com sucesso."
      }, { status: 200, headers: corsHeaders });
    }

    return NextResponse.json({ 
        ok: true, 
        offerId: newOffer.id,
        message: "Oferta salva com sucesso, sem geração de IA (nenhum canal)."
    }, { status: 200, headers: corsHeaders });

  } catch (error) {
    return NextResponse.json({
      ok: false,
      code: "OFFICIAL_AI_FAILURE",
      message: error instanceof Error ? error.message : "Erro desconhecido"
    }, { status: 500, headers: corsHeaders });
  }
}
