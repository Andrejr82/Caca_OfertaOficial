import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  AUTO_REEL_FLUX_MODEL,
  buildFluxMultipart,
  generateFluxScene,
  planAutoReelScenes,
  processAutoReelScenes,
} from "@/lib/videos/auto-reel-scenes";

const factualSnapshot = {
  offerId: "offer-scenes-1",
  productName: "WAP Extratora Portátil Spot Cleaner W3",
  currentPrice: 438.99,
  platform: "Amazon",
  category: "Geral",
  imageUrl: "https://cdn.example.test/wap.jpg",
};

describe("Auto Reel visual scenes contract", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("plans exactly four required scenes with fixed seeds", () => {
    const scenes = planAutoReelScenes(factualSnapshot);
    expect(scenes).toHaveLength(4);
    expect(scenes.map((scene) => scene.kind)).toEqual(["presentation", "start", "use", "result"]);
    expect(scenes.map((scene) => scene.seed)).toEqual([101, 102, 103, 104]);
  });

  it("uses only factual offer data and fidelity constraints", () => {
    const scenes = planAutoReelScenes(factualSnapshot);
    for (const scene of scenes) {
      expect(scene.prompt).toContain(factualSnapshot.productName);
      expect(scene.prompt).toContain("exact product");
      expect(scene.prompt).toMatch(/preserve.*shape/i);
      expect(scene.prompt).toMatch(/no text/i);
      expect(scene.prompt).toMatch(/no watermark/i);
      expect(scene.prompt).not.toMatch(/discount|freight|rating|sale claim/i);
    }
  });

  it("builds the FLUX multipart request with the binary input image", () => {
    const form = buildFluxMultipart({
      image: new Blob(["image"], { type: "image/jpeg" }),
      prompt: "scene prompt",
      seed: 101,
    });
    expect(form.get("input_image_0")).toBeInstanceOf(File);
    expect(form.get("prompt")).toBe("scene prompt");
    expect(form.get("width")).toBe("768");
    expect(form.get("height")).toBe("1024");
    expect(form.get("seed")).toBe("101");
    expect(form.get("steps")).toBeNull();
  });

  it("uses the official FLUX 2 Klein model", () => {
    expect(AUTO_REEL_FLUX_MODEL).toBe("@cf/black-forest-labs/flux-2-klein-4b");
  });

  it("keeps the real source image on every planned scene", () => {
    expect(planAutoReelScenes(factualSnapshot).every((scene) => scene.imageUrl === factualSnapshot.imageUrl)).toBe(true);
  });

  it("gives each scene a distinct usability action", () => {
    const prompts = planAutoReelScenes(factualSnapshot).map((scene) => scene.prompt);
    expect(new Set(prompts).size).toBe(4);
    expect(prompts.join(" ")).toMatch(/identified|holding|actively performing|practical result/i);
  });

  it("does not send JSON or an alternate image field to FLUX", () => {
    const form = buildFluxMultipart({ image: new Blob(["image"]), prompt: "prompt", seed: 104 });
    expect(form.get("image")).toBeNull();
    expect(form.get("image_b64")).toBeNull();
    expect(form.get("steps")).toBeNull();
  });

  it("calls the official endpoint and parses the generated image", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: { image: "aGVsbG8=" } }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await generateFluxScene({ image: new Blob(["image"]), prompt: "prompt", seed: 101, accountId: "account", apiToken: "token" });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(AUTO_REEL_FLUX_MODEL), expect.objectContaining({ method: "POST", body: expect.any(FormData) }));
    expect(result.bytes.length).toBeGreaterThan(0);
  });

  it("persists four valid scene outputs and marks the job scenes_ready", async () => {
    const generate = vi.fn().mockResolvedValue({ bytes: new Uint8Array([1, 2, 3]), contentType: "image/jpeg", width: 768, height: 1024 });
    const persistScene = vi.fn().mockResolvedValue({ storagePath: "auto-reels/offer-scenes-1/scene-1.jpg" });
    const updateJob = vi.fn();

    const result = await processAutoReelScenes({
      jobId: "job-scenes-1",
      factualSnapshot,
      sourceImage: new Blob(["image"], { type: "image/jpeg" }),
      generate,
      persistScene,
      updateJob,
    });

    expect(generate).toHaveBeenCalledTimes(4);
    expect(persistScene).toHaveBeenCalledTimes(4);
    expect(result.status).toBe("scenes_ready");
    expect(updateJob).toHaveBeenLastCalledWith("job-scenes-1", "scenes_ready", expect.objectContaining({ scenes: expect.any(Array) }));
  });

  it("marks the job failed when Cloudflare returns an HTTP failure", async () => {
    const updateJob = vi.fn();
    const result = await processAutoReelScenes({
      jobId: "job-scenes-2",
      factualSnapshot,
      sourceImage: new Blob(["image"], { type: "image/jpeg" }),
      generate: vi.fn().mockRejectedValue(new Error("Cloudflare HTTP 429")),
      persistScene: vi.fn(),
      updateJob,
    });
    expect(result.status).toBe("failed");
    expect(updateJob).toHaveBeenLastCalledWith("job-scenes-2", "failed", expect.objectContaining({ error: expect.any(String) }));
    expect(result.error).toMatch(/Cloudflare HTTP 429/);
  });

  it("marks the job failed when a generated image is empty or invalid", async () => {
    const updateJob = vi.fn();
    const result = await processAutoReelScenes({
      jobId: "job-scenes-3",
      factualSnapshot,
      sourceImage: new Blob(["image"], { type: "image/jpeg" }),
      generate: vi.fn().mockResolvedValue({ bytes: new Uint8Array(), contentType: "image/jpeg", width: 768, height: 1024 }),
      persistScene: vi.fn(),
      updateJob,
    });
    expect(result.status).toBe("failed");
    expect(updateJob).toHaveBeenLastCalledWith("job-scenes-3", "failed", expect.objectContaining({ error: expect.any(String) }));
  });

  it("updates progress through planning and generating_visual", async () => {
    const updateJob = vi.fn();
    await processAutoReelScenes({
      jobId: "job-scenes-4",
      factualSnapshot,
      sourceImage: new Blob(["image"], { type: "image/jpeg" }),
      generate: vi.fn().mockResolvedValue({ bytes: new Uint8Array([1]), contentType: "image/jpeg", width: 768, height: 1024 }),
      persistScene: vi.fn().mockResolvedValue({ storagePath: "scene.jpg" }),
      updateJob,
    });
    expect(updateJob.mock.calls.map(([id, status]) => [id, status])).toEqual([
      ["job-scenes-4", "planning"],
      ["job-scenes-4", "generating_visual"],
      ["job-scenes-4", "scenes_ready"],
    ]);
  });
});
