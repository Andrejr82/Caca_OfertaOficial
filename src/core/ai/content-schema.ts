import { z } from "zod";
import type { OfficialAIChannel, OfficialAIContent } from "./types";

const contentSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  shortCopy: z.string().trim().min(1),
  longCopy: z.string().trim().min(1),
  hashtags: z.array(z.string().trim().min(1)),
  callToAction: z.string().trim().min(1),
  highlights: z.array(z.string().trim().min(1)).min(1),
  explanation: z.string().trim().min(1),
  channelCopies: z.object({
    telegram: z.string().trim().min(1).optional(),
    instagram: z.string().trim().min(1).optional(),
    whatsapp: z.string().trim().min(1).optional()
  }).strict()
}).strict();

const forbiddenOpening = /^\s*(?:[^\p{L}\p{N}]{0,4}\s*)?(?:Olá|Temos um novo|Você vai amar|Confira|Conheça|Não perca)(?=\s|[!,:;.-]|$)/iu;
const forbiddenLink = /\[\s*link\s*\]|(?:[a-z][a-z0-9+.-]*:)?\/\/\S+|\bwww\.\S+/iu;

export function isCopyV2TextSafe(copy: string) {
  return !forbiddenOpening.test(copy) && !forbiddenLink.test(copy);
}

export function validateOfficialAIHook(value: unknown): string | null {
  const hook = typeof value === "string"
    ? value
    : value && typeof value === "object" && typeof (value as { hook?: unknown }).hook === "string"
      ? (value as { hook: string }).hook
      : null;
  if (!hook) return null;
  const normalized = hook.replace(/\s+/gu, " ").trim();
  if (normalized.length < 3 || normalized.length > 40 || /[\n\r]|https?:\/\/|www\./iu.test(normalized)) return null;
  if (/\b(?:Olá|Confira|Conheça|Não perca)\b/iu.test(normalized)) return null;
  return normalized;
}

export function validateOfficialAIContent(value: unknown, channels: readonly OfficialAIChannel[]): OfficialAIContent | null {
  const parsed = contentSchema.safeParse(value);
  if (!parsed.success) return null;
  if (channels.some((channel) => !parsed.data.channelCopies[channel])) return null;
  if (channels.includes("instagram") && parsed.data.hashtags.length === 0) return null;
  if (channels.some((channel) => {
    const copy = parsed.data.channelCopies[channel] ?? "";
    return !isCopyV2TextSafe(copy);
  })) return null;
  return parsed.data as OfficialAIContent;
}
