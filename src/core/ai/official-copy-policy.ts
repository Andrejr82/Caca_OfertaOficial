const LEGACY_COPY_PATTERNS = [
  /Uma opção por/iu,
  /Achado na Shopee/iu,
  /Preço atual:/iu,
] as const;

export function findLegacyOfficialCopyPattern(content: string): string | null {
  const pattern = LEGACY_COPY_PATTERNS.find((candidate) => candidate.test(content));
  return pattern?.source ?? null;
}

export function assertOfficialCopy(content: string, channel: string): string {
  const normalized = String(content || "").trim();
  if (!normalized) throw new Error(`Official AI copy is empty for ${channel}`);
  if (findLegacyOfficialCopyPattern(normalized)) {
    throw new Error(`Legacy copy pattern rejected for ${channel}`);
  }
  return normalized;
}

export { LEGACY_COPY_PATTERNS };
