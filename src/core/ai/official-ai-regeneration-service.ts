import { isCopyV2TextSafe, validateOfficialAIContent } from "./content-schema";
import type { OfficialAIRegenerationDependencies } from "./ports";
import { buildCopyV2ChannelCopy, buildOfficialRegenerationPrompt } from "./prompt";
import { OFFICIAL_AI_CHANNELS, type OfficialAIDraftForRegeneration, type OfficialAIRegenerationCommand, type OfficialAIRegenerationItem, type OfficialAIRegenerationResult } from "./types";

const FORBIDDEN_OPENING = /^\s*(?:[^\p{L}\p{N}]{0,4}\s*)?(?:Olá|Temos um novo|Você vai amar|Confira|Conheça|Não perca)(?=\s|[!,:;.-]|$)/iu;
const URL = /(?:[a-z][a-z0-9+.-]*:)?\/\/\S+|\bwww\.\S+/iu;
const INSTALLMENTS = /\b\d+\s*x\b|parcelad[oa]|sem juros/iu;
const STOCK = /\bestoque\b|últimas unidades|últimas peças/iu;
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

function parseBRL(raw: string) {
  if (raw.includes(",")) return Number(raw.replace(/\./g, "").replace(",", "."));
  return Number(raw);
}

function validateCopy(copy: string, draft: OfficialAIDraftForRegeneration) {
  if (!isCopyV2TextSafe(copy)) throw new Error("FORBIDDEN_FINAL_COPY");
  if (FORBIDDEN_OPENING.test(copy)) throw new Error("FORBIDDEN_GENERIC_OPENING");
  if (URL.test(copy)) throw new Error("UNEXPECTED_URL");
  if (INSTALLMENTS.test(copy)) throw new Error("UNSUPPORTED_INSTALLMENTS");
  if (STOCK.test(copy)) throw new Error("UNSUPPORTED_STOCK_CLAIM");
  if (/frete\s+grátis/iu.test(copy) && draft.shippingFree !== true) throw new Error("UNSUPPORTED_FREE_SHIPPING");
  if (/\bcupom\b/iu.test(copy) && (!draft.coupon || !copy.toLocaleLowerCase("pt-BR").includes(draft.coupon.toLocaleLowerCase("pt-BR")))) {
    throw new Error("UNSUPPORTED_COUPON");
  }
  for (const match of copy.matchAll(/(\d(?:[.,]\d)?)[ \t]*(?:estrela|⭐)/giu)) {
    if (draft.rating === null || Math.abs(Number(match[1].replace(",", ".")) - draft.rating) >= 0.05) throw new Error("UNSUPPORTED_RATING");
  }

  const allowedPrices = [draft.currentPrice, draft.originalPrice].filter((value): value is number => value !== null);
  for (const match of copy.matchAll(/R\$\s*(\d+\.\d{1,2}|\d+(?:\.\d{3})*(?:,\d{1,2})?)/giu)) {
    const value = parseBRL(match[1]);
    if (!allowedPrices.some((allowed) => Math.abs(allowed - value) < 0.01)) throw new Error("UNSUPPORTED_PRICE");
  }

  const discount = draft.originalPrice && draft.originalPrice > draft.currentPrice
    ? Math.round((1 - draft.currentPrice / draft.originalPrice) * 100)
    : null;
  for (const match of copy.matchAll(/(\d{1,3})\s*%/gu)) {
    const stated = Number(match[1]);
    const presentInTitle = new RegExp(`(?:^|\\D)${stated}\\s*%`, "u").test(draft.productName);
    if (!presentInTitle && (discount === null || stated !== discount)) throw new Error("UNSUPPORTED_DISCOUNT");
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
      const inference = await provider.generate({
        prompt: buildOfficialRegenerationPrompt(draft),
        correlationId: command.correlationId,
        timeoutMs: 30_000,
        temperature: 0.1,
        maxTokens: 1_200,
        metadata: { commandId: command.commandId, postId: draft.postId, channel: draft.channel, operation: "regenerate_draft" }
      });
      const content = validateOfficialAIContent(inference.content, [draft.channel]);
      if (!content?.channelCopies[draft.channel]) throw new Error("INVALID_PROVIDER_OUTPUT");
      const copy = buildCopyV2ChannelCopy(draft, draft.channel);
      validateCopy(copy, draft);
      const afterContent = `${copy}\n\n${draft.trackedUrl}`;
      const updated = await dependencies.drafts.updateContent({
        tenantId: command.tenantId,
        postId: draft.postId,
        expectedContent: draft.currentContent,
        content: afterContent
      });
      if (!updated) throw new Error("DRAFT_CHANGED_OR_NOT_FOUND");
      return { ...identity, afterContent };
    } catch (error) {
      return { ...identity, error: error instanceof Error ? error.message : "UNKNOWN_REGENERATION_ERROR" };
    }
  };

  const items: OfficialAIRegenerationItem[] = [];
  const concurrency = 1;
  for (let index = 0; index < drafts.length; index += concurrency) {
    items.push(...await Promise.all(drafts.slice(index, index + concurrency).map(regenerate)));
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
