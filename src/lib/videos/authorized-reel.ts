import { z } from "zod";

import { CREATIVE_RIGHTS_STATUSES } from "@/lib/videos/creative-candidate";

export const MAX_AUTHORIZED_REEL_BYTES = 100 * 1024 * 1024;

const httpUrlSchema = z.string().trim().max(2048).refine((value) => {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}, "Use uma URL http(s) válida.");

const authorizedReelBaseSchema = z.object({
  offerId: z.string().uuid(),
  fileName: z.string().trim().min(1).max(180).refine((name) => name.toLowerCase().endsWith(".mp4"), "Use um arquivo MP4."),
  fileSize: z.number().int().positive().max(MAX_AUTHORIZED_REEL_BYTES),
  mimeType: z.literal("video/mp4"),
  rightsStatus: z.enum(CREATIVE_RIGHTS_STATUSES),
  sourceUrl: httpUrlSchema.optional().default(""),
  sourceNote: z.string().trim().max(500).optional().default(""),
  width: z.number().int().positive().max(10000),
  height: z.number().int().positive().max(10000),
  durationSeconds: z.number().positive().max(600),
});

function requireAuthorizationEvidence(data: z.infer<typeof authorizedReelBaseSchema>, ctx: z.RefinementCtx) {
  if (data.rightsStatus !== "owned" && !data.sourceUrl && !data.sourceNote) {
    ctx.addIssue({
      code: "custom",
      path: ["sourceNote"],
      message: "Informe a origem ou uma observação da autorização.",
    });
  }
}

export const authorizedReelStartSchema = authorizedReelBaseSchema.superRefine(requireAuthorizationEvidence);

export const authorizedReelFinalizeSchema = authorizedReelBaseSchema.extend({
  uploadId: z.string().uuid(),
}).superRefine(requireAuthorizationEvidence);

export const authorizedReelVerificationSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    workerId: z.string().trim().min(1).max(120),
    width: z.number().int().positive().max(10000),
    height: z.number().int().positive().max(10000),
    durationSeconds: z.number().positive().max(600),
    formatName: z.string().trim().min(1).max(120),
    videoCodec: z.string().trim().min(1).max(120),
    hasAudio: z.boolean(),
  }),
  z.object({
    ok: z.literal(false),
    workerId: z.string().trim().min(1).max(120),
    error: z.string().trim().min(1).max(500),
  }),
]);

export type AuthorizedReelStartInput = z.infer<typeof authorizedReelStartSchema>;

export function buildAuthorizedReelStoragePath(userId: string, uploadId: string) {
  return `${userId}/reels/${uploadId}.mp4`;
}
