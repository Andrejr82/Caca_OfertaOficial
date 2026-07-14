import { z } from "zod";
import type { OfficialAIChannel, OfficialAIContent } from "./types";

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
  const parsed = contentSchema.safeParse(value);
  if (!parsed.success) return null;
  if (channels.some((channel) => !parsed.data.channelCopies[channel])) return null;
  return parsed.data as OfficialAIContent;
}
