import { generateOfficialAI, type OfficialAICommand } from "@/core/ai";
import { createOfficialAIServiceDependencies } from "@/lib/ai/official/create-official-ai-service";
import { createRequiredSupabaseAdminClient } from "@/lib/supabase/admin";

export const TREND_SOCIAL_CHANNELS = ["telegram", "whatsapp", "facebook", "instagram"] as const;

export function buildTrendSocialDraftCommand(input: {
  userId: string;
  offerId: string;
  productId: string;
  requestedAt: string;
}): OfficialAICommand {
  const commandId = `trend-social-drafts:${input.productId}:${input.offerId}:v1`;
  return {
    contractVersion: "pmav5.ai/v1",
    commandId,
    idempotencyKey: commandId,
    correlationId: `trend-test:${input.productId}`,
    causationId: null,
    offerId: input.offerId,
    tenantId: input.userId,
    providerPreference: "groq",
    channels: [...TREND_SOCIAL_CHANNELS],
    requestedAt: input.requestedAt,
    actor: { type: "user", id: input.userId, service: "trends-selection-desk" },
    origin: "trends.approve-test",
    reason: { code: "PREPARE_TREND_SOCIAL_DRAFTS", detail: "Human-approved Trends IA experiment" },
    metadata: {
      trendRadar: true,
      radarProductId: input.productId,
      automaticPublication: false,
    },
  };
}

export async function prepareTrendSocialDrafts(input: {
  userId: string;
  offerId: string;
  productId: string;
}) {
  const aiClient = createRequiredSupabaseAdminClient();
  const command = buildTrendSocialDraftCommand({
    ...input,
    requestedAt: new Date().toISOString(),
  });
  const result = await generateOfficialAI(
    command,
    createOfficialAIServiceDependencies(aiClient, input.userId),
  );
  if (result.status === "rejected") {
    throw new Error(result.message);
  }
  return result;
}
