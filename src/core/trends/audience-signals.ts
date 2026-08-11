export type AudienceChannel = "telegram" | "instagram" | "facebook" | "whatsapp";

export type AudienceMetric =
  | "member_count"
  | "followers_total"
  | "accounts_reached"
  | "views"
  | "interactions"
  | "reach"
  | "engagement"
  | "messages_sent"
  | "messages_delivered"
  | "conversations";

export interface AudienceCapability {
  sourceAuthority: string;
  collectorStatus: "available" | "unconfigured" | "operational_only";
  metrics: AudienceMetric[];
  notes: string;
}

export const AUDIENCE_SIGNAL_CAPABILITIES: Record<AudienceChannel, AudienceCapability> = {
  telegram: {
    sourceAuthority: "Telegram Bot API",
    collectorStatus: "available",
    metrics: ["member_count"],
    notes: "Contagem de membros do chat/canal; não prova efeito de produto específico.",
  },
  instagram: {
    sourceAuthority: "Meta Instagram Insights",
    collectorStatus: "unconfigured",
    metrics: ["followers_total", "accounts_reached", "views", "interactions"],
    notes: "Disponível para contas profissionais com permissões adequadas; métricas de alcance podem ser estimadas.",
  },
  facebook: {
    sourceAuthority: "Meta Page Insights",
    collectorStatus: "unconfigured",
    metrics: ["followers_total", "reach", "engagement"],
    notes: "Disponível via Insights quando a Página e as permissões suportam a métrica.",
  },
  whatsapp: {
    sourceAuthority: "Meta WhatsApp Cloud API",
    collectorStatus: "operational_only",
    metrics: ["messages_sent", "messages_delivered", "conversations"],
    notes: "Analytics operacionais; não existe aqui uma métrica equivalente de seguidores/membros.",
  },
};

export interface AudienceSnapshotInput {
  channel: AudienceChannel;
  metric: AudienceMetric;
  value: number;
  observedAt: string;
  source: string;
}

export interface AudienceSnapshot extends AudienceSnapshotInput {
  productAttribution: null;
  causalAttribution: false;
}

export function buildAudienceSnapshot(input: AudienceSnapshotInput): AudienceSnapshot {
  const capability = AUDIENCE_SIGNAL_CAPABILITIES[input.channel];
  if (!capability.metrics.includes(input.metric)) {
    throw new Error(`Métrica de audiência não suportada para ${input.channel}.`);
  }
  if (!Number.isFinite(input.value) || input.value < 0) {
    throw new Error("Valor de audiência inválido.");
  }
  const observedAt = new Date(input.observedAt);
  if (Number.isNaN(observedAt.getTime())) throw new Error("Data de audiência inválida.");
  if (!input.source.trim()) throw new Error("Fonte de audiência obrigatória.");

  return {
    ...input,
    observedAt: observedAt.toISOString(),
    source: input.source.trim(),
    productAttribution: null,
    causalAttribution: false,
  };
}
