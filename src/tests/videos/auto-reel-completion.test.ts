import { describe, expect, it, vi } from "vitest";

const snapshot = {
  offerId: "offer-complete-1",
  productName: "WAP Extratora Portátil Spot Cleaner W3",
  currentPrice: 399.9,
  platform: "Shopee",
  imageUrl: "https://cdn.example.test/wap.jpg",
};

const scenes = [1, 2, 3, 4].map((number) => ({
  number,
  kind: ["presentation", "start", "use", "result"][number - 1],
  seed: 100 + number,
  prompt: `scene ${number}`,
  imageUrl: `https://cdn.example.test/scene-${number}.jpg`,
  storagePath: `auto-reels/job-1/scene-${number}.jpg`,
}));

const job = {
  id: "job-1",
  stage: "scenes_ready" as const,
  status: "processing" as const,
  attempt: 1,
  metadata: { factualSnapshot: snapshot, visualScenes: scenes },
};

describe("Auto Reel completion contract", () => {
  it("advances scenes_ready through analyzing, dubbing and rendering", async () => {
    const { processAutoReelCompletion } = await import("@/lib/videos/auto-reel-completion");
    const updateJob = vi.fn();
    const result = await processAutoReelCompletion({
      job,
      updateJob,
      generateDubbing: vi.fn().mockResolvedValue({ script: "Confira o produto por R$ 399,90!", audioUrl: "https://cdn/audio.mp3", durationSeconds: 9 }),
      render: vi.fn().mockResolvedValue({ videoUrl: "https://cdn/video.mp4", durationSeconds: 9 }),
      persist: vi.fn().mockResolvedValue(undefined),
    });
    expect(result).toMatchObject({ status: "ready_for_review", videoUrl: "https://cdn/video.mp4" });
    expect(updateJob.mock.calls.map(([, stage]) => stage)).toEqual(["analyzing", "dubbing", "rendering", "ready_for_review"]);
  });

  it("builds Dubbing V2 payload only from persisted facts and visual context", async () => {
    const { buildAutoReelDubbingPayload } = await import("@/lib/videos/auto-reel-completion");
    const payload = buildAutoReelDubbingPayload(job);
    expect(payload).toEqual(expect.objectContaining({ productName: snapshot.productName, price: snapshot.currentPrice, marketplace: snapshot.platform }));
    expect(payload.visualScenes).toHaveLength(4);
    expect(payload).not.toHaveProperty("discount");
    expect(payload).not.toHaveProperty("benefits");
  });

  it("rejects invented facts in the Dubbing payload", async () => {
    const { buildAutoReelDubbingPayload } = await import("@/lib/videos/auto-reel-completion");
    expect(() => buildAutoReelDubbingPayload({ ...job, metadata: { ...job.metadata, visualConcept: { discount: "50% off" } } as typeof job.metadata })).not.toThrow();
    expect(buildAutoReelDubbingPayload(job)).not.toHaveProperty("visualConcept");
  });

  it("builds an ordered vertical render manifest with the existing CTA", async () => {
    const { buildAutoReelRenderPayload } = await import("@/lib/videos/auto-reel-completion");
    const payload = buildAutoReelRenderPayload(job, { audioUrl: "https://cdn/audio.mp3", durationSeconds: 9 });
    expect(payload).toMatchObject({ aspectRatio: "9:16", audioUrl: "https://cdn/audio.mp3", price: snapshot.currentPrice });
    expect(payload.scenes.map((scene) => scene.number)).toEqual([1, 2, 3, 4]);
    expect(payload.cta).toMatch(/Corre pra conferir/u);
  });

  it("persists audio, video, duration and metadata before ready_for_review", async () => {
    const { processAutoReelCompletion } = await import("@/lib/videos/auto-reel-completion");
    const persist = vi.fn().mockResolvedValue(undefined);
    await processAutoReelCompletion({ job, updateJob: vi.fn(), generateDubbing: vi.fn().mockResolvedValue({ script: "copy", audioUrl: "https://cdn/audio.mp3", durationSeconds: 9 }), render: vi.fn().mockResolvedValue({ videoUrl: "https://cdn/video.mp4", durationSeconds: 9 }), persist });
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({ audioUrl: "https://cdn/audio.mp3", videoUrl: "https://cdn/video.mp4", durationSeconds: 9, status: "ready_for_review" }));
  });

  it("marks Dubbing failure as failed", async () => {
    const { processAutoReelCompletion } = await import("@/lib/videos/auto-reel-completion");
    const updateJob = vi.fn();
    const result = await processAutoReelCompletion({ job, updateJob, generateDubbing: vi.fn().mockRejectedValue(new Error("tts unavailable")), render: vi.fn(), persist: vi.fn() });
    expect(result.status).toBe("failed");
    expect(updateJob).toHaveBeenLastCalledWith(job.id, "failed", expect.objectContaining({ error: "tts unavailable" }));
  });

  it("marks render failure as failed", async () => {
    const { processAutoReelCompletion } = await import("@/lib/videos/auto-reel-completion");
    const updateJob = vi.fn();
    const result = await processAutoReelCompletion({ job, updateJob, generateDubbing: vi.fn().mockResolvedValue({ script: "copy", audioUrl: "https://cdn/audio.mp3", durationSeconds: 9 }), render: vi.fn().mockRejectedValue(new Error("ffmpeg unavailable")), persist: vi.fn() });
    expect(result.status).toBe("failed");
    expect(updateJob).toHaveBeenLastCalledWith(job.id, "failed", expect.objectContaining({ error: "ffmpeg unavailable" }));
  });

  it("allows approval and rejection only from ready_for_review", async () => {
    const { approveAutoReelCompletion, rejectAutoReelCompletion } = await import("@/lib/videos/auto-reel-completion");
    expect(approveAutoReelCompletion({ ...job, stage: "ready_for_review" })).toMatchObject({ status: "approved", published: false });
    expect(rejectAutoReelCompletion({ ...job, stage: "ready_for_review" })).toMatchObject({ status: "rejected", published: false });
    expect(() => approveAutoReelCompletion(job)).toThrow();
  });

  it("regenerates as a clean visual attempt without deleting the previous attempt", async () => {
    const { regenerateAutoReelCompletion } = await import("@/lib/videos/auto-reel-completion");
    const previous = {
      ...job,
      stage: "failed",
      videoUrl: "https://cdn/old.mp4",
      metadata: {
        ...job.metadata,
        style: "demonstrative-reel",
        renderManifest: { scenes, audioUrl: "https://cdn/old.mp3" },
        audioUrl: "https://cdn/old.mp3",
        durationSeconds: 12,
        rendered: true,
        completionRequested: true,
      },
    };
    const next = regenerateAutoReelCompletion(previous as any) as { id: string; offerId?: string; attempt: number; stage: string; videoUrl: string | null; metadata: Record<string, unknown> };
    expect(next).toMatchObject({ offerId: snapshot.offerId, attempt: 2, status: "queued", stage: "queued", videoUrl: null });
    expect((next as { id: string }).id).not.toBe(job.id);
    expect(next.metadata).toEqual({ factualSnapshot: snapshot, style: "demonstrative-reel", attempt: 2, previousAttemptId: job.id });
    expect(next.metadata).not.toHaveProperty("visualScenes");
    expect(next.metadata).not.toHaveProperty("renderManifest");
    expect(next.metadata).not.toHaveProperty("audioUrl");
    expect(next.metadata).not.toHaveProperty("durationSeconds");
    expect(next.metadata).not.toHaveProperty("rendered");
    expect(next.metadata).not.toHaveProperty("completionRequested");
    expect(previous).toHaveProperty("metadata.visualScenes");
    const { planAutoReelScenes } = await import("@/lib/videos/auto-reel-scenes");
    expect(planAutoReelScenes(next.metadata.factualSnapshot as typeof snapshot)).toHaveLength(4);
  });

  it("keeps authorized-reel available", async () => {
    await expect(import("@/lib/videos/authorized-reel")).resolves.toBeDefined();
  });
});
