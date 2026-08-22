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

  // Corrida entre duas requisições: o índice parcial do banco é a última proteção.
  if (error?.code === "23505") {
    const concurrent = await getOpenCampaignForOffer(supabase, userId, offerId);
    if (concurrent) return { campaign: concurrent, created: false };
  }

  throw new Error(`Falha ao iniciar campanha: ${error?.message ?? "erro desconhecido"}`);
}
