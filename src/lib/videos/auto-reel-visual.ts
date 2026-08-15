export function buildAutoReelVisualConcept(input: {
  factualSnapshot: { productName: string; imageUrl: string; currentPrice?: number; platform?: string };
  style: "demonstrative-reel";
}) {
  return { ...input.factualSnapshot, style: input.style };
}

export function buildAutoReelVisualPrompt(concept: { productName: string; imageUrl: string; style: string }) {
  return `Use the real product image ${concept.imageUrl}. Show ${concept.productName} as produto protagonista in a demonstrative vertical 9:16 reel lasting 8-15 segundos. Preserve the exact product shape, color and proportions. No invented claims, no text, no watermark.`;
}

export async function generateAutoReelVisual(input: {
  factualSnapshot: { productName: string; imageUrl: string };
  prompt: string;
  provider: { generate: (request: { imageUrl: string; prompt: string; aspectRatio: "9:16" }) => Promise<unknown> };
}) {
  return input.provider.generate({ imageUrl: input.factualSnapshot.imageUrl, prompt: input.prompt, aspectRatio: "9:16" });
}

export async function processAutoReelVisual(input: {
  factualSnapshot: { offerId: string; imageUrl: string };
  provider: { generate: (request: { imageUrl: string; prompt: string; aspectRatio: "9:16" }) => Promise<{ mediaUrl?: string; durationSeconds?: number; width?: number; height?: number }> };
  persistMedia?: (media: unknown) => Promise<{ storagePath: string }>;
  attempt?: number;
}) {
  try {
    const media = await input.provider.generate({ imageUrl: input.factualSnapshot.imageUrl, prompt: "demonstrative vertical reel", aspectRatio: "9:16" });
    if (!media.mediaUrl) return { status: "failed" as const };
    const stored = input.persistMedia ? await input.persistMedia(media) : undefined;
    return { status: "analyzing" as const, attempt: input.attempt ?? 1, ...(stored ? { storagePath: stored.storagePath } : {}) };
  } catch {
    return { status: "failed" as const };
  }
}

export function regenerateAutoReelVisual<T extends { id: string; offerId: string; attempt: number }>(previous: T) {
  return { ...previous, id: `${previous.id}-attempt-${previous.attempt + 1}`, attempt: previous.attempt + 1, status: "queued" as const };
}
