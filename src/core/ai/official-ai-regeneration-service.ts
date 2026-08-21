import type { OfficialAIRegenerationDependencies } from "./ports";
import { buildCopyV5PlannerPrompt } from "./copy-v5-planner";
import { renderCopyV5ChannelCopy } from "./copy-v5-renderer";
import type { CopyV5Facts, CopyV5Plan } from "./copy-v5-types";
import { validateCopyV5Plan } from "./copy-v5-validator";
import { OFFICIAL_AI_CHANNELS, type OfficialAIDraftForRegeneration, type OfficialAIRegenerationCommand, type OfficialAIRegenerationItem, type OfficialAIRegenerationResult } from "./types";

export const OFFICIAL_AI_REGENERATION_BATCH_LIMIT = 5;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function getOfficialAIRegenerationBatchLimit(value?: number) {
  if (!Number.isFinite(value) || !value || value < 1) return OFFICIAL_AI_REGENERATION_BATCH_LIMIT;
  return Math.min(Math.floor(value), OFFICIAL_AI_REGENERATION_BATCH_LIMIT);
}

export function isOfficialAIRegenerationCursor(value: unknown): value is { createdAt: string; postId: string } {
  if (!value || typeof value !== "object") return false;
  const cursor = value as { createdAt?: unknown; postId?: unknown };
  if (typeof cursor.createdAt !== "string" || typeof cursor.postId !== "string" || !UUID.test(cursor.postId)) return false;
  const parsed = new Date(cursor.createdAt);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === cursor.createdAt;
}

function factsFromDraft(draft: OfficialAIDraftForRegeneration): CopyV5Facts {
  return {
    productName: draft.productName,
    marketplace: draft.marketplace,
    category: draft.category,
    currentPrice: draft.currentPrice,
    originalPrice: draft.originalPrice,
    freeShipping: draft.shippingFree,
    evidence: {
      ...draft.evidence,
      ...(draft.coupon ? { coupon: draft.coupon } : {}),
      ...(draft.rating !== null ? { rating: draft.rating } : {}),
    },
  };
}

function parsePlanCandidate(content: unknown): Partial<CopyV5Plan> | null {
  if (content && typeof content === "object") return content as Partial<CopyV5Plan>;
  if (typeof content !== "string") return null;
  const jsonMatch = content.trim().match(/\{[\s\S]*\}/u);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]) as Partial<CopyV5Plan>;
  } catch {
    return null;
  }
}

function assertCommand(command: OfficialAIRegenerationCommand) {
  if (command.contractVersion !== "pmav5.ai-regeneration/v1" || !command.commandId || !command.correlationId || !command.tenantId) {
    throw new Error("INVALID_REGENERATION_COMMAND");
  }
  if (command.filters.channel && !OFFICIAL_AI_CHANNELS.includes(command.filters.channel)) {
    throw new Error("INVALID_REGENERATION_CHANNEL");
  }
  if (command.filters.after && !isOfficialAIRegenerationCursor(command.filters.after)) {
    throw new Error("INVALID_REGENERATION_CURSOR");
  }
}

export async function regenerateOfficialDrafts(
  command: OfficialAIRegenerationCommand,
  dependencies: OfficialAIRegenerationDependencies
): Promise<OfficialAIRegenerationResult> {
  assertCommand(command);
  const drafts = await dependencies.drafts.findDrafts(command.tenantId, command.filters);
  if (drafts.length === 0) return { commandId: command.commandId, matched: 0, updated: 0, failed: 0, nextCursor: null, items: [] };
  const provider = dependencies.providers.resolve(command.providerPreference);
  const cooldownCheckpoint = (error: unknown) => {
    if (!error || typeof error !== "object" || !("code" in error) || error.code !== "OFFICIAL_AI_PROVIDERS_COOLING_DOWN") return null;
    const retryAfterMs = "retryAfterMs" in error ? Number(error.retryAfterMs) : NaN;
    return Number.isFinite(retryAfterMs) && retryAfterMs >= 0 ? retryAfterMs : 0;
  };

  const regenerate = async (draft: OfficialAIDraftForRegeneration): Promise<OfficialAIRegenerationItem> => {
    const identity = {
      postId: draft.postId,
      offerId: draft.offerId,
      affiliateLinkId: draft.affiliateLinkId,
      channel: draft.channel,
      status: draft.status,
      createdAt: draft.createdAt,
      beforeContent: draft.currentContent
    };

    try {
      const facts = factsFromDraft(draft);
      const inference = await provider.generate({
        prompt: buildCopyV5PlannerPrompt(facts),
        correlationId: command.correlationId,
        timeoutMs: 30_000,
        temperature: 0.4,
        maxTokens: 500,
        metadata: { commandId: command.commandId, postId: draft.postId, channel: draft.channel, operation: "regenerate_draft_v5" }
      });
      const plan = validateCopyV5Plan(parsePlanCandidate(inference.content), facts);
      const afterContent = renderCopyV5ChannelCopy(plan, facts, draft.channel, draft.trackedUrl).feed;
      const updated = await dependencies.drafts.updateContent({
        tenantId: command.tenantId,
        postId: draft.postId,
        expectedContent: draft.currentContent,
        content: afterContent
      });
      if (!updated) throw new Error("DRAFT_CHANGED_OR_NOT_FOUND");
      return { ...identity, afterContent };
    } catch (error) {
      if (cooldownCheckpoint(error) !== null) throw error;
      return { ...identity, error: error instanceof Error ? error.message : "UNKNOWN_REGENERATION_ERROR" };
    }
  };

  const items: OfficialAIRegenerationItem[] = [];
  for (const draft of drafts) {
    try {
      items.push(await regenerate(draft));
    } catch (error) {
      const retryAfterMs = cooldownCheckpoint(error);
      if (retryAfterMs === null) throw error;
      const updated = items.filter((item) => item.afterContent !== undefined).length;
      const failed = items.filter((item) => item.error !== undefined).length;
      return {
        commandId: command.commandId, matched: drafts.length, updated, failed, nextCursor: null, items,
        paused: { postId: draft.postId, reason: "PROVIDERS_COOLDOWN", retryAfterMs }
      };
    }
  }

  const updated = items.filter((item) => item.afterContent !== undefined).length;
  const failed = drafts.length - updated;
  const limit = getOfficialAIRegenerationBatchLimit(command.filters.limit);
  const last = drafts.at(-1);
  const nextCursor = failed === 0 && drafts.length === limit && last
    ? { createdAt: new Date(last.createdAt).toISOString(), postId: last.postId }
    : null;
  return { commandId: command.commandId, matched: drafts.length, updated, failed, nextCursor, items };
}
