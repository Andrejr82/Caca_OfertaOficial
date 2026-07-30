export const INSTAGRAM_MIN_INTERVAL_MS = 30 * 60 * 1000;
export const INSTAGRAM_MAX_POSTS_24H = 6;

export function normalizeInstagramCaption(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

export function validateInstagramCaption(caption: string): string | null {
  const normalized = caption.trim();
  if (!normalized) return "Legenda do Instagram está vazia.";
  if (normalized.length > 2200) return "Legenda do Instagram excede 2.200 caracteres.";
  if (/https?:\/\//i.test(normalized)) return "Legenda do Instagram não deve conter URL direta; use o link da bio.";
  return null;
}

export function evaluateInstagramSafety(input: {
  caption: string;
  publishedAt: readonly string[];
  recentCaptions: readonly string[];
  now?: number;
}): { ok: true } | { ok: false; code: string; message: string } {
  const captionError = validateInstagramCaption(input.caption);
  if (captionError) return { ok: false, code: "INSTAGRAM_CAPTION_INVALID", message: captionError };

  const now = input.now ?? Date.now();
  const timestamps = input.publishedAt
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value));
  const recent24h = timestamps.filter((value) => now - value < 24 * 60 * 60 * 1000);
  if (recent24h.length >= INSTAGRAM_MAX_POSTS_24H) {
    return { ok: false, code: "INSTAGRAM_DAILY_LIMIT", message: "Limite seguro de publicações do Instagram atingido (6 em 24 horas)." };
  }
  const latest = Math.max(...recent24h, 0);
  if (latest > 0 && now - latest < INSTAGRAM_MIN_INTERVAL_MS) {
    const minutes = Math.ceil((INSTAGRAM_MIN_INTERVAL_MS - (now - latest)) / 60000);
    return { ok: false, code: "INSTAGRAM_COOLDOWN", message: `Aguarde aproximadamente ${minutes} minuto(s) antes de publicar outra oferta no Instagram.` };
  }
  const normalized = normalizeInstagramCaption(input.caption);
  if (input.recentCaptions.some((caption) => normalizeInstagramCaption(caption) === normalized)) {
    return { ok: false, code: "INSTAGRAM_DUPLICATE_CAPTION", message: "Legenda idêntica a uma publicação recente; altere o conteúdo antes de publicar." };
  }
  return { ok: true };
}
