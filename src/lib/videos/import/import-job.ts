import { createHash } from "node:crypto";
import { validateSourceUrl, type SourcePolicyErrorCode } from "./source-policy";

export const IMPORT_CHANNELS = ["instagram", "facebook"] as const;
export type ImportChannel = (typeof IMPORT_CHANNELS)[number];

export type ImportRequest = {
  offerId?: unknown;
  sourceUrl?: unknown;
  channels?: unknown;
  rightsConfirmed?: unknown;
};

export type ImportValidation = { ok: true } | { ok: false; code: string };

export function normalizeSourceUrl(value: string) {
  const url = new URL(value.trim());
  url.hostname = url.hostname.toLowerCase();
  if (url.port === "443") url.port = "";
  return url.toString();
}

export function buildImportIdempotencyKey(userId: string, offerId: string, sourceUrl: string) {
  const normalized = normalizeSourceUrl(sourceUrl);
  const digest = createHash("sha256").update(`${userId}\n${offerId}\n${normalized}`).digest("hex");
  return `imported-video:${digest}`;
}

export function validateImportRequest(input: ImportRequest): ImportValidation {
  if (typeof input.offerId !== "string" || !input.offerId.trim()) return { ok: false, code: "OFFER_REQUIRED" };
  if (typeof input.sourceUrl !== "string" || !input.sourceUrl.trim()) return { ok: false, code: "SOURCE_URL_REQUIRED" };
  if (input.rightsConfirmed !== true) return { ok: false, code: "RIGHTS_CONFIRMATION_REQUIRED" };
  if (!Array.isArray(input.channels) || input.channels.length === 0) return { ok: false, code: "CHANNEL_REQUIRED" };
  if (new Set(input.channels).size !== input.channels.length || input.channels.some((channel) => !IMPORT_CHANNELS.includes(channel as ImportChannel))) {
    return { ok: false, code: "CHANNEL_NOT_ALLOWED" };
  }
  const sourcePolicy = validateSourceUrl(input.sourceUrl);
  if (!sourcePolicy.ok) return { ok: false, code: sourcePolicy.code as SourcePolicyErrorCode };
  return { ok: true };
}
