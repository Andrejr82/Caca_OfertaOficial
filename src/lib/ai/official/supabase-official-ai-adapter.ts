import type { SupabaseClient } from "@supabase/supabase-js";
import type { OfficialAIContentPort, OfficialAITelemetryPort } from "@/core/ai";
import type { OfficialAIServiceDependencies } from "@/core/ai/ports";
import type { StateServiceDependencies } from "@/core/state";
import { assertOfficialCopy } from "@/core/ai/official-copy-policy";
import {
  DEFAULT_BATCH_SIZE,
  STALE_PENDING_AFTER_MS,
  getOfficialAIBatchSize,
  OfficialAIApprovalAdapter,
  SupabaseOfficialAIAdapter as LegacySupabaseOfficialAIAdapter,
  SupabaseOfficialAIRegenerationAdapter,
} from "./supabase-official-ai-adapter-legacy";

export {
  DEFAULT_BATCH_SIZE,
  STALE_PENDING_AFTER_MS,
  getOfficialAIBatchSize,
  OfficialAIApprovalAdapter,
  SupabaseOfficialAIRegenerationAdapter,
};

/**
 * Materialização canônica Copy V4.
 * Facebook mantém a URL fora do corpo: o transporte oficial publica o tracked
 * URL no primeiro comentário. Instagram nunca recebe URL direta na legenda.
 */
export function materializeDraftContent(
  channel: string,
  rawContent: string,
  trackedUrl: string,
  options?: { repairInvalidUrl?: boolean },
) {
  const copy = rawContent.trimEnd();
  const urls = copy.match(/https?:\/\/\S+/g) ?? [];

  if (channel === "instagram" || channel === "facebook") {
    if (urls.length > 0) throw new Error(`${channel} copy cannot contain a direct URL`);
    return copy;
  }

  if (urls.length > 0) {
    if (urls.length === 1 && urls[0] === trackedUrl) return copy;
    if (options?.repairInvalidUrl) {
      let firstUrl = true;
      return copy.replace(/https?:\/\/\S+/g, () => {
        if (firstUrl) {
          firstUrl = false;
          return trackedUrl;
        }
        return "";
      }).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trimEnd();
    }
    throw new Error(`Copy contains an invalid or duplicate URL for ${channel}`);
  }

  return copy.endsWith("👉") ? `${copy} ${trackedUrl}` : `${copy}\n\n👉 ${trackedUrl}`;
}

/**
 * Wrapper do adapter persistente existente. Todo I/O e toda a lógica de estado
 * continuam no adapter legado; a única correção pós-persistência é retirar do
 * draft do Facebook a URL que o materializador V3 inseria no corpo.
 *
 * transitionOfficialOfferState continua pertencendo ao OfficialAIApprovalAdapter
 * preservado no adapter legado; este wrapper não cria novo writer de estado.
 */
export class SupabaseOfficialAIAdapter extends LegacySupabaseOfficialAIAdapter {
  constructor(
    private readonly v4Client: SupabaseClient,
    private readonly v4TenantId: string,
    telemetry?: OfficialAITelemetryPort,
  ) {
    super(v4Client, v4TenantId, telemetry);
  }

  override async persistDrafts(input: Parameters<OfficialAIContentPort["persistDrafts"]>[0]) {
    const drafts = await super.persistDrafts(input);
    if (!input.channels.includes("facebook")) return drafts;

    const facebookContent = assertOfficialCopy(input.content.channelCopies.facebook || "", "facebook");
    if (/https?:\/\//u.test(facebookContent)) {
      throw new Error("Facebook Copy V4 body cannot contain a direct URL");
    }

    const { error } = await this.v4Client
      .from("posts")
      .update({ content: facebookContent })
      .eq("user_id", this.v4TenantId)
      .eq("offer_id", input.offer.id)
      .eq("channel", "facebook")
      .eq("status", "draft");
    if (error) throw new Error(`Official AI Facebook V4 materialization failed: ${error.message}`);

    return drafts;
  }
}

export function withSupabaseOfficialAIAdapters(
  client: SupabaseClient,
  tenantId: string,
  stateDependencies: StateServiceDependencies,
  remaining: Pick<OfficialAIServiceDependencies, "providers" | "clock" | "telemetry">,
): OfficialAIServiceDependencies {
  const adapter = new SupabaseOfficialAIAdapter(client, tenantId, remaining.telemetry);
  return {
    ...remaining,
    offers: adapter,
    content: adapter,
    idempotency: adapter,
    audit: adapter,
    approval: new OfficialAIApprovalAdapter(stateDependencies),
  };
}
