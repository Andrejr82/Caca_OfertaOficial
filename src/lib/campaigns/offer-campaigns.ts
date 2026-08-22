export const OPEN_CAMPAIGN_STATUSES = ["draft", "ready", "active"] as const;
export const DEFAULT_CAMPAIGN_HOURS = 48;

export type OfferCampaignStatus = "draft" | "ready" | "active" | "completed" | "cancelled";
export type CampaignChannel = "instagram_reel" | "instagram_story" | "facebook_feed" | "facebook_group" | "whatsapp";
export type CampaignChannelState = "pending" | "ready" | "published" | "skipped";
export type CampaignMarketplace = "Shopee" | "Mercado Livre";
export type CampaignTrackingType = "sub_id" | "etiqueta";

export type CampaignChecklist = Record<CampaignChannel, { status: CampaignChannelState; published_at: string | null }>;

export type CampaignOfficialLink = {
  marketplace: CampaignMarketplace;
  tracking_type: CampaignTrackingType;
  tracking_key: string;
  official_url: string;
  saved_at: string;
  source: "manual_assisted";
};

export type CampaignOfficialLinks = Partial<Record<CampaignChannel, CampaignOfficialLink>>;

export type OfferCampaign = {
  id: string;
  user_id: string;
  offer_id: string;
  status: OfferCampaignStatus;
  started_at: string | null;
  ends_at: string | null;
  completed_at: string | null;
  channel_checklist: CampaignChecklist;
  official_links: CampaignOfficialLinks;
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

const CHANNEL_TRACKING_CODES: Record<CampaignChannel, string> = {
  instagram_reel: "ig_reel",
  instagram_story: "ig_story",
  facebook_feed: "fb_feed",
  facebook_group: "fb_group",
  whatsapp: "whatsapp",
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

export function normalizeCampaignMarketplace(value: string): CampaignMarketplace {
  const normalized = value.trim().toLowerCase().replace(/[._-]/g, " ");
  if (normalized === "shopee") return "Shopee";
  if (normalized === "mercado livre" || normalized === "mercadolivre" || normalized === "mercadolibre") return "Mercado Livre";
  throw new Error("Marketplace sem suporte a link oficial nesta campanha.");
}

export function trackingTypeForMarketplace(marketplace: CampaignMarketplace): CampaignTrackingType {
  return marketplace === "Shopee" ? "sub_id" : "etiqueta";
}

export function buildCampaignTrackingKey(campaignId: string, channel: CampaignChannel) {
  if (!CAMPAIGN_CHANNELS.includes(channel)) throw new Error("Canal de campanha inválido.");
  const token = campaignId.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
  if (!token) throw new Error("Campanha inválida para tracking.");
  return `co_${token}_${CHANNEL_TRACKING_CODES[channel]}`;
}

export function validateOfficialMarketplaceUrl(marketplace: CampaignMarketplace, rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new Error("Link oficial inválido.");
  }
  if (url.protocol !== "https:") throw new Error("O link oficial precisa usar HTTPS.");

  const host = url.hostname.toLowerCase();
  const matches = (domain: string) => host === domain || host.endsWith(`.${domain}`);
  const valid = marketplace === "Shopee"
    ? matches("shopee.com.br")
    : matches("mercadolivre.com.br") || matches("mercadolivre.com") || matches("meli.la");

  if (!valid) throw new Error(`O link informado não pertence ao ${marketplace}.`);
  return url.toString();
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
