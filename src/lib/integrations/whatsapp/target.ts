export type WhatsAppTargetKind = "group" | "newsletter" | "unknown";

const TARGET_SUFFIX_KIND: Array<{ suffix: string; kind: WhatsAppTargetKind }> = [
  { suffix: "@g.us", kind: "group" },
  { suffix: "@newsletter", kind: "newsletter" },
];

export function sanitizeWhatsAppTargetId(value?: string | null) {
  if (!value) return null;
  const sanitized = String(value).replace(/['"]/g, "").replace(/\s+/g, "").trim();
  return sanitized || null;
}

export function detectWhatsAppTargetKind(targetId?: string | null): WhatsAppTargetKind {
  const sanitized = sanitizeWhatsAppTargetId(targetId);
  if (!sanitized) return "unknown";

  const match = TARGET_SUFFIX_KIND.find(({ suffix }) => sanitized.endsWith(suffix));
  return match?.kind || "unknown";
}

export function resolveConfiguredWhatsAppTargetId() {
  return (
    sanitizeWhatsAppTargetId(process.env.WHATSAPP_TARGET_ID) ||
    sanitizeWhatsAppTargetId(process.env.WHATSAPP_CHANNEL_ID) ||
    sanitizeWhatsAppTargetId(process.env.WHATSAPP_DEFAULT_CHANNEL_ID)
  );
}
