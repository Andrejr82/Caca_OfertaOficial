export const OPEN_CAMPAIGN_STATUSES = ["draft", "ready", "active"] as const;
export const DEFAULT_CAMPAIGN_HOURS = 48;

export type OfferCampaignStatus = "draft" | "ready" | "active" | "completed" | "cancelled";
export type CampaignChannel = "instagram_reel" | "instagram_story" | "facebook_feed" | "facebook_group" | "whatsapp";
export type CampaignChannelState = "pending" | "ready" | "published" | "skipped";

export type CampaignChecklist = Record<CampaignChannel, { status: CampaignChannelState; published_at: string | null }>;

export type OfferCampaign = {
  id: string;
  user_id: string;
  offer_id: string;
  status: OfferCampaignStatus;
  started_at: string | null;
  ends_at: string | null;
  completed_at: string | null;
  channel_checklist: CampaignChecklist;
  official_links: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export const CAMPAIGN_CHANNELS: readonly CampaignChannel[] = [
  "instagram_reel",
  "instagram_story",
  "facebook_feed",
  "facebook_group",
  "whatsapp",
] as const;

export const CAMPAIGN_CHANNEL_STATES: readonly CampaignChannelState[] = ["pending", "ready", "published", "skipped"] as const;

export function buildInitialCampaignChecklist(): CampaignChecklist {
  return {
    instagram_reel: { status: "pending", published_at: null },
    instagram_story: { status: "pending", published_at: null },
    facebook_feed: { status: "pending", published_at: null },
    facebook_group: { status: "pending", published_at: null },
    whatsapp: { status: "pending", published_at: null },
  };
}

export function buildCampaignWindow(startedAt: Date, hours = DEFAULT_CAMPAIGN_HOURS) {
  if (!Number.isFinite(hours) || hours <= 0) throw new Error("Janela da campanha inválida.");
  return {
    startedAt: startedAt.toISOString(),
    endsAt: new Date(startedAt.getTime() + hours * 60 * 60 * 1000).toISOString(),
  };
}

export function nextCampaignAction(checklist: CampaignChecklist) {
  const order: Array<[CampaignChannel, string]> = [
    ["instagram_reel", "Publicar Reel no Instagram"],
    ["instagram_story", "Publicar Stories no Instagram"],
    ["facebook_feed", "Publicar no Facebook Feed"],
    ["facebook_group", "Publicar em grupo compatível do Facebook"],
    ["whatsapp", "Enviar no WhatsApp"],
  ];

  for (const [channel, label] of order) {
    const state = checklist[channel]?.status ?? "pending";
    if (state !== "published" && state !== "skipped") return { channel, label, state };
  }

  return { channel: null, label: "Aguardar dados e revisar campanha", state: null };
}

type SupabaseLike = {
  from(table: string): any;
};

export async function getOpenCampaignForOffer(
  supabase: SupabaseLike,
  userId: string,
  offerId: string,
): Promise<OfferCampaign | null> {
  const { data, error } = await supabase
    .from("offer_campaigns")
    .select("*")
    .eq("user_id", userId)
    .eq("offer_id", offerId)
    .in("status", [...OPEN_CAMPAIGN_STATUSES])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Falha ao buscar campanha ativa: ${error.message}`);
  return (data ?? null) as OfferCampaign | null;
}

export async function startOfferCampaign(
  supabase: SupabaseLike,
  userId: string,
  offerId: string,
  options: { now?: Date; hours?: number } = {},
): Promise<{ campaign: OfferCampaign; created: boolean }> {
  if (!userId) throw new Error("Usuário não autenticado.");
  if (!offerId) throw new Error("Oferta inválida.");

  const existing = await getOpenCampaignForOffer(supabase, userId, offerId);
  if (existing) return { campaign: existing, created: false };

  const { startedAt, endsAt } = buildCampaignWindow(options.now ?? new Date(), options.hours ?? DEFAULT_CAMPAIGN_HOURS);
  const payload = {
    user_id: userId,
    offer_id: offerId,
    status: "active" as const,
    started_at: startedAt,
    ends_at: endsAt,
    completed_at: null,
    channel_checklist: buildInitialCampaignChecklist(),
    official_links: {},
  };

  const { data, error } = await supabase
    .from("offer_campaigns")
    .insert(payload)
    .select("*")
    .single();

  if (!error && data) return { campaign: data as OfferCampaign, created: true };

  if (error?.code === "23505") {
    const concurrent = await getOpenCampaignForOffer(supabase, userId, offerId);
    if (concurrent) return { campaign: concurrent, created: false };
  }

  throw new Error(`Falha ao iniciar campanha: ${error?.message ?? "erro desconhecido"}`);
}

export async function updateCampaignChannelState(
  supabase: SupabaseLike,
  userId: string,
  campaignId: string,
  channel: CampaignChannel,
  status: CampaignChannelState,
  now = new Date(),
): Promise<OfferCampaign> {
  if (!CAMPAIGN_CHANNELS.includes(channel)) throw new Error("Canal de campanha inválido.");
  if (!CAMPAIGN_CHANNEL_STATES.includes(status)) throw new Error("Status de canal inválido.");

  const { data: current, error: readError } = await supabase
    .from("offer_campaigns")
    .select("*")
    .eq("id", campaignId)
    .eq("user_id", userId)
    .maybeSingle();

  if (readError) throw new Error(`Falha ao carregar campanha: ${readError.message}`);
  if (!current) throw new Error("Campanha não encontrada.");
  if (!OPEN_CAMPAIGN_STATUSES.includes(current.status)) throw new Error("Campanha encerrada não pode ser alterada.");

  const checklist = { ...(current.channel_checklist ?? buildInitialCampaignChecklist()) } as CampaignChecklist;
  checklist[channel] = {
    status,
    published_at: status === "published" ? now.toISOString() : null,
  };

  const { data, error } = await supabase
    .from("offer_campaigns")
    .update({ channel_checklist: checklist })
    .eq("id", campaignId)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error || !data) throw new Error(`Falha ao atualizar checklist: ${error?.message ?? "erro desconhecido"}`);
  return data as OfferCampaign;
}
