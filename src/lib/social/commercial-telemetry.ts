export type SocialCommercialChannel = "whatsapp" | "telegram" | "instagram" | "facebook";

export type SocialCommercialFunnelStage = "unpublished" | "no_click" | "no_purchase" | "converted";

export interface SocialCommercialTelemetryInput {
  offerId: string;
  channel: SocialCommercialChannel;
  published: boolean;
  impressions?: number | null;
  clicks?: number | null;
  purchases?: number | null;
  affiliateEarningsBRL?: number | null;
}

export interface SocialCommercialTelemetrySnapshot {
  offerId: string;
  channel: SocialCommercialChannel;
  published: boolean;
  impressions: number | null;
  clicks: number;
  purchases: number;
  ctrPct: number | null;
  conversionRatePct: number | null;
  epcBRL: number | null;
  noConversionSignal: boolean;
  funnelStage: SocialCommercialFunnelStage;
}

function assertCount(name: string, value: number | null | undefined) {
  if (value == null) return null;
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new Error(`Social commercial telemetry requires ${name} to be a non-negative integer`);
  }
  return value;
}

function assertMoney(name: string, value: number | null | undefined) {
  if (value == null) return null;
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Social commercial telemetry requires ${name} to be a non-negative finite number`);
  }
  return value;
}

function round(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function funnelStage(published: boolean, clicks: number, purchases: number): SocialCommercialFunnelStage {
  if (!published) return "unpublished";
  if (clicks === 0) return "no_click";
  if (purchases === 0) return "no_purchase";
  return "converted";
}

/**
 * Task 7 — contrato puro de telemetria comercial por oferta x canal.
 *
 * Regras de honestidade analítica:
 * - CTR só existe quando impressões reais são conhecidas e > 0;
 * - taxa de conversão só existe quando houve ao menos um clique;
 * - EPC só existe quando há ganho afiliado real conhecido e houve clique;
 * - ausência de conversão é sinalizada apenas quando a oferta foi publicada,
 *   recebeu clique e ainda não registrou compra.
 *
 * Persistência e captura dos eventos reais serão conectadas apenas no fechamento
 * do programa Copy V4.
 */
export function buildSocialCommercialTelemetrySnapshot(
  input: SocialCommercialTelemetryInput,
): SocialCommercialTelemetrySnapshot {
  if (!input.offerId.trim()) throw new Error("Social commercial telemetry requires offerId");

  const impressions = assertCount("impressions", input.impressions);
  const clicks = assertCount("clicks", input.clicks) ?? 0;
  const purchases = assertCount("purchases", input.purchases) ?? 0;
  const affiliateEarningsBRL = assertMoney("affiliateEarningsBRL", input.affiliateEarningsBRL);

  if (!input.published && (clicks > 0 || purchases > 0 || (affiliateEarningsBRL ?? 0) > 0)) {
    throw new Error("Unpublished social telemetry cannot contain clicks, purchases or earnings");
  }
  if (purchases > clicks) {
    throw new Error("Social commercial telemetry cannot have more purchases than clicks");
  }

  const ctrPct = impressions && impressions > 0 ? round((clicks / impressions) * 100) : null;
  const conversionRatePct = clicks > 0 ? round((purchases / clicks) * 100) : null;
  const epcBRL = clicks > 0 && affiliateEarningsBRL != null ? round(affiliateEarningsBRL / clicks, 4) : null;
  const noConversionSignal = input.published && clicks > 0 && purchases === 0;

  return {
    offerId: input.offerId,
    channel: input.channel,
    published: input.published,
    impressions,
    clicks,
    purchases,
    ctrPct,
    conversionRatePct,
    epcBRL,
    noConversionSignal,
    funnelStage: funnelStage(input.published, clicks, purchases),
  };
}

export function buildSocialCommercialTelemetryBatch(inputs: readonly SocialCommercialTelemetryInput[]) {
  const seen = new Set<string>();
  return inputs.map((input) => {
    const key = `${input.offerId}|${input.channel}`;
    if (seen.has(key)) {
      throw new Error(`Duplicate social telemetry input for ${key}`);
    }
    seen.add(key);
    return buildSocialCommercialTelemetrySnapshot(input);
  });
}
