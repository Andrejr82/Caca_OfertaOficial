import { describe, expect, it, vi } from "vitest";

const factualSnapshot = {
  offerId: "offer-visual-1",
  productName: "Tênis Masculino Calce Fácil",
  currentPrice: 29.9,
  platform: "Shopee",
  imageUrl: "https://cdn.example.test/product.png",
};

const loadVisualPipeline = () => import("@/lib/videos/auto-reel-visual");

describe("Auto Reel visual generation contract", () => {
  it("builds the visual concept only from the factual snapshot", async () => {
    const { buildAutoReelVisualConcept } = await loadVisualPipeline();
    const concept = buildAutoReelVisualConcept({
      factualSnapshot,
      style: "demonstrative-reel",
    });

    expect(concept.productName).toBe(factualSnapshot.productName);
    expect(concept.imageUrl).toBe(factualSnapshot.imageUrl);
    expect(concept.style).toBe("demonstrative-reel");
  });

  it("builds a factual prompt with the real product image", async () => {
    const { buildAutoReelVisualConcept, buildAutoReelVisualPrompt } =
      await loadVisualPipeline();
    const concept = buildAutoReelVisualConcept({
      factualSnapshot,
      style: "demonstrative-reel",
    });
    const prompt = buildAutoReelVisualPrompt(concept);

    expect(prompt).toContain(factualSnapshot.productName);
    expect(prompt).toContain(factualSnapshot.imageUrl);
    expect(prompt).toMatch(/9:16/);
    expect(prompt).toMatch(/8.?15\s*segundos/i);
    expect(prompt).toMatch(/produto protagonista/i);
  });

  it("passes image and prompt to the real provider boundary", async () => {
    const { generateAutoReelVisual } = await loadVisualPipeline();
    const provider = {
      generate: vi.fn().mockResolvedValue({
        mediaUrl: "https://cdn.example.test/reel.mp4",
        durationSeconds: 10,
        width: 1080,
        height: 1920,
      }),
    };

    await generateAutoReelVisual({
      factualSnapshot,
      prompt: "demonstrative vertical reel",
      provider,
    });

    expect(provider.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrl: factualSnapshot.imageUrl,
        prompt: expect.any(String),
        aspectRatio: "9:16",
      }),
    );
  });

  it("rejects provider failures as failed", async () => {
    const { processAutoReelVisual } = await loadVisualPipeline();
    const provider = {
      generate: vi.fn().mockRejectedValue(new Error("provider unavailable")),
    };

    await expect(
      processAutoReelVisual({ factualSnapshot, provider }),
    ).resolves.toMatchObject({ status: "failed" });
  });

  it("rejects invalid provider output as failed", async () => {
    const { processAutoReelVisual } = await loadVisualPipeline();
    const provider = { generate: vi.fn().mockResolvedValue({ mediaUrl: "" }) };

    await expect(
      processAutoReelVisual({ factualSnapshot, provider }),
    ).resolves.toMatchObject({ status: "failed" });
  });

  it("persists valid media and advances only to analyzing", async () => {
    const { processAutoReelVisual } = await loadVisualPipeline();
    const persistMedia = vi.fn().mockResolvedValue({
      storagePath: "auto-reels/offer-visual-1/attempt-1.mp4",
    });
    const provider = {
      generate: vi.fn().mockResolvedValue({
        mediaUrl: "https://cdn.example.test/reel.mp4",
        durationSeconds: 10,
        width: 1080,
        height: 1920,
      }),
    };

    const result = await processAutoReelVisual({
      factualSnapshot,
      provider,
      persistMedia,
      attempt: 1,
    });

    expect(persistMedia).toHaveBeenCalled();
    expect(result).toMatchObject({
      status: "analyzing",
      attempt: 1,
      storagePath: "auto-reels/offer-visual-1/attempt-1.mp4",
    });
  });

  it("preserves the previous attempt when regenerating", async () => {
    const { regenerateAutoReelVisual } = await loadVisualPipeline();
    const previous = {
      id: "job-attempt-1",
      offerId: factualSnapshot.offerId,
      attempt: 1,
      status: "failed",
      mediaPath: "auto-reels/offer-visual-1/attempt-1.mp4",
    };

    const next = regenerateAutoReelVisual(previous);

    expect(next).toMatchObject({
      offerId: factualSnapshot.offerId,
      attempt: 2,
      status: "queued",
    });
    expect(next.id).not.toBe(previous.id);
    expect(previous.mediaPath).toBe("auto-reels/offer-visual-1/attempt-1.mp4");
  });
});
