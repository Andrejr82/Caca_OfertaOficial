import { NextResponse } from "next/server";

import {
  CAMPAIGN_CHANNELS,
  CAMPAIGN_CHANNEL_STATES,
  type CampaignChannel,
  type CampaignChannelState,
  updateCampaignChannelState,
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

  let body: { channel?: string; status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const channel = String(body.channel ?? "") as CampaignChannel;
  const status = String(body.status ?? "") as CampaignChannelState;
  if (!CAMPAIGN_CHANNELS.includes(channel)) return NextResponse.json({ error: "Canal inválido." }, { status: 400 });
  if (!CAMPAIGN_CHANNEL_STATES.includes(status)) return NextResponse.json({ error: "Status inválido." }, { status: 400 });

  try {
    const campaign = await updateCampaignChannelState(supabase, user.id, campaignId, channel, status);
    return NextResponse.json({ ok: true, channelChecklist: campaign.channel_checklist });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível atualizar o checklist.";
    const httpStatus = /não encontrada/i.test(message) ? 404 : /encerrada/i.test(message) ? 409 : 500;
    return NextResponse.json({ error: message }, { status: httpStatus });
  }
}
