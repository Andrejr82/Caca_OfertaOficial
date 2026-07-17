import { z } from "zod";
import type { OfficialAIChannel, OfficialAIContent, ProviderValidationRule } from "./types";

const contentSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  shortCopy: z.string().trim().min(1),
  longCopy: z.string().trim().min(1),
  hashtags: z.array(z.string().trim().min(1)).min(1),
  callToAction: z.string().trim().min(1),
  highlights: z.array(z.string().trim().min(1)).min(1),
  explanation: z.string().trim().min(1),
  channelCopies: z.object({
    telegram: z.string().trim().min(1).optional(),
    instagram: z.string().trim().min(1).optional(),
    whatsapp: z.string().trim().min(1).optional()
  }).strict()
}).strict();

export function validateOfficialAIContent(value: unknown, channels: readonly OfficialAIChannel[]): OfficialAIContent | null {
  return validateOfficialAIContentWithDiagnostics(value, channels).content;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function textRule(value: unknown, missing: ProviderValidationRule): ProviderValidationRule | null {
  if (value === undefined || value === null || (typeof value === "string" && value.trim().length === 0)) return missing;
  return typeof value === "string" ? null : "INVALID_FIELD_TYPE";
}

function collectionRule(value: unknown, invalid: ProviderValidationRule, empty: ProviderValidationRule): ProviderValidationRule | null {
  if (!Array.isArray(value)) return invalid;
  if (value.length === 0) return empty;
  return value.every((item) => typeof item === "string" && item.trim().length > 0) ? null : invalid;
}

function validationRule(value: unknown, channels: readonly OfficialAIChannel[]): ProviderValidationRule {
  if (!isRecord(value)) return "INVALID_FIELD_TYPE";
  const fields: Array<[keyof OfficialAIContent, ProviderValidationRule]> = [
    ["title", "MISSING_TITLE"], ["description", "MISSING_DESCRIPTION"], ["shortCopy", "MISSING_SHORT_COPY"],
    ["longCopy", "MISSING_LONG_COPY"], ["callToAction", "MISSING_CALL_TO_ACTION"], ["explanation", "MISSING_EXPLANATION"]
  ];
  for (const [field, missing] of fields) {
    const rule = textRule(value[field], missing);
    if (rule) return rule;
  }
  const hashtagsRule = collectionRule(value.hashtags, "INVALID_HASHTAGS", "EMPTY_HASHTAGS");
  if (hashtagsRule) return hashtagsRule;
  const highlightsRule = collectionRule(value.highlights, "INVALID_HIGHLIGHTS", "EMPTY_HIGHLIGHTS");
  if (highlightsRule) return highlightsRule;
  if (!isRecord(value.channelCopies)) return "INVALID_CHANNEL_COPIES";
  const allowedChannels = new Set<OfficialAIChannel>(["telegram", "instagram", "whatsapp"]);
  if (Object.keys(value.channelCopies).some((channel) => !allowedChannels.has(channel as OfficialAIChannel))) return "UNRECOGNIZED_CHANNEL_FIELD";
  for (const channel of channels) {
    const copy = value.channelCopies[channel];
    if (copy === undefined || copy === null) return "REQUESTED_CHANNEL_COPY_MISSING";
    if (typeof copy !== "string") return "INVALID_FIELD_TYPE";
    if (copy.trim().length === 0) return "REQUESTED_CHANNEL_COPY_EMPTY";
  }
  return "UNKNOWN_SCHEMA_ERROR";
}

export function validateOfficialAIContentWithDiagnostics(value: unknown, channels: readonly OfficialAIChannel[]): {
  content: OfficialAIContent | null;
  validationRule?: ProviderValidationRule;
} {
  const parsed = contentSchema.safeParse(value);
  if (!parsed.success) return { content: null, validationRule: validationRule(value, channels) };
  if (channels.some((channel) => !parsed.data.channelCopies[channel])) {
    return { content: null, validationRule: validationRule(value, channels) };
  }
  return { content: parsed.data as OfficialAIContent };
}
