import { NextResponse } from "next/server";

import {
  CAMPAIGN_CHANNELS,
  OPEN_CAMPAIGN_STATUSES,
  buildCampaignTrackingKey,
  normalizeCampaignMarketplace,
  trackingTypeForMarketplace,
  validateOfficialMarketplaceUrl,
  type CampaignChannel,
  type CampaignOfficialLinks,
} from "@/lib/campaigns/offer-campaigns";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> | { id: string } },
) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Supabase indisponível." }, { status: 500 });

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });

  const params = await context.params;
  const campaignId = String(params.id ?? "").trim();
  if (!campaignId) return NextResponse.json({ error: "Campanha inválida." }, { status: 400 });

  let body: { channel?: string; officialUrl?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const channel = String(body.channel ?? "") as CampaignChannel;
  if (!CAMPAIGN_CHANNELS.includes(channel)) return NextResponse.json({ error: "Canal inválido." }, { status: 400 });

  const { data: campaign, error: readError } = await supabase
    .from("offer_campaigns")
    .select("id,status,official_links,offers(platform)")
    .eq("id", campaignId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!campaign) return NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 });
  if (!OPEN_CAMPAIGN_STATUSES.includes(campaign.status)) {
    return NextResponse.json({ error: "Campanha encerrada não pode ser alterada." }, { status: 409 });
  }

  try {
    const offer = Array.isArray(campaign.offers) ? campaign.offers[0] : campaign.offers;
    const marketplace = normalizeCampaignMarketplace(String(offer?.platform ?? ""));
    const officialUrl = validateOfficialMarketplaceUrl(marketplace, String(body.officialUrl ?? ""));
    const officialLinks = { ...(campaign.official_links ?? {}) } as CampaignOfficialLinks;
    officialLinks[channel] = {
      marketplace,
      tracking_type: trackingTypeForMarketplace(marketplace),
      tracking_key: buildCampaignTrackingKey(campaignId, channel),
      official_url: officialUrl,
      saved_at: new Date().toISOString(),
      source: "manual_assisted",
    };

    const { data, error } = await supabase
      .from("offer_campaigns")
      .update({ official_links: officialLinks })
      .eq("id", campaignId)
      .eq("user_id", user.id)
      .select("official_links")
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Não foi possível salvar o link oficial." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, officialLinks: data.official_links });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível salvar o link oficial." },
      { status: 400 },
    );
  }
}
