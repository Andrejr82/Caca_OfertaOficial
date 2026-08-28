// @vitest-environment node

import { describe, expect, it, vi, beforeEach } from "vitest";
import sharp from "sharp";

import {
  AUTO_REEL_FLUX_MODEL,
  buildFluxMultipart,
  canResumeAutoReelScenes,
  generateFluxScene,
  planAutoReelScenes,
  processAutoReelScenes,
  scenesToGenerate,
} from "@/lib/videos/auto-reel-scenes";

const factualSnapshot = {
  offerId: "offer-scenes-1",
  productName: "WAP Extratora Portátil Spot Cleaner W3",
  currentPrice: 438.99,
  platform: "Amazon",
  category: "Geral",
  imageUrl: "https://cdn.example.test/wap.jpg",
};

const persistedScene = (number: number) => ({
  ...planAutoReelScenes(factualSnapshot)[number - 1],
  storagePath: `auto-reels/offer-scenes-1/scene-${number}.jpg`,
});

async function imageBuffer(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: { r: 255, g: 255, b: 255 } } }).jpeg().toBuffer();
}

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
    const form = buildFluxMultipart({ image: new Blob(["image"], { type: "image/jpeg" }), prompt: "scene prompt", seed: 101 });
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

  it("normalizes oversized reference images below the Cloudflare 512px input limit", async () => {
    const output = await imageBuffer(768, 1024);
    let inputMetadata: { width?: number; height?: number } = {};
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      const form = init?.body as FormData;
      const file = form.get("input_image_0") as File;
      inputMetadata = await sharp(Buffer.from(await file.arrayBuffer())).metadata();
      return new Response(JSON.stringify({ result: { image: output.toString("base64") } }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const source = await imageBuffer(1200, 900);
    await generateFluxScene({ image: new Blob([source], { type: "image/jpeg" }), prompt: "prompt", seed: 101, accountId: "account", apiToken: "token" });
    expect(inputMetadata.width).toBeLessThan(512);
    expect(inputMetadata.height).toBeLessThan(512);
  });

  it("calls the official endpoint and validates the generated image dimensions", async () => {
    const output = await imageBuffer(768, 1024);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: { image: output.toString("base64") } }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const source = await imageBuffer(400, 400);
    const result = await generateFluxScene({ image: new Blob([source]), prompt: "prompt", seed: 101, accountId: "account", apiToken: "token" });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(AUTO_REEL_FLUX_MODEL), expect.objectContaining({ method: "POST", body: expect.any(FormData) }));
    expect(result.width).toBe(768);
    expect(result.height).toBe(1024);
  });

  it("preserves a sanitized Cloudflare provider error without exposing credentials", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ errors: [{ code: 3001, message: "input image too large" }] }), { status: 400, headers: { "content-type": "application/json", "cf-ray": "ray-test" } })));
    const source = await imageBuffer(400, 400);
    await expect(generateFluxScene({ image: new Blob([source]), prompt: "prompt", seed: 101, accountId: "account", apiToken: "secret-token" }))
      .rejects.toThrow('{"provider":"cloudflare","status":400,"code":3001,"message":"input image too large","requestId":"ray-test"}');
  });

  it("rejects a generated image with unexpected dimensions", async () => {
    const output = await imageBuffer(512, 512);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(output, { status: 200, headers: { "content-type": "image/jpeg" } })));
    const source = await imageBuffer(400, 400);
    await expect(generateFluxScene({ image: new Blob([source]), prompt: "prompt", seed: 101, accountId: "account", apiToken: "token" }))
      .rejects.toThrow(/Imagem visual inválida: 512x512/);
  });

  it("persists four valid scene outputs and marks the job scenes_ready", async () => {
    const generate = vi.fn().mockResolvedValue({ bytes: new Uint8Array([1, 2, 3]), contentType: "image/jpeg", width: 768, height: 1024 });
    const persistScene = vi.fn().mockResolvedValue({ storagePath: "auto-reels/offer-scenes-1/scene-1.jpg" });
    const updateJob = vi.fn();
    const result = await processAutoReelScenes({ jobId: "job-scenes-1", factualSnapshot, sourceImage: new Blob(["image"], { type: "image/jpeg" }), generate, persistScene, updateJob });
    expect(generate).toHaveBeenCalledTimes(4);
    expect(persistScene).toHaveBeenCalledTimes(4);
    expect(result.status).toBe("scenes_ready");
    expect(updateJob).toHaveBeenLastCalledWith("job-scenes-1", "scenes_ready", expect.objectContaining({ scenes: expect.any(Array) }));
  });

  it("marks the job failed when Cloudflare returns an HTTP failure", async () => {
    const updateJob = vi.fn();
    const result = await processAutoReelScenes({ jobId: "job-scenes-2", factualSnapshot, sourceImage: new Blob(["image"]), generate: vi.fn().mockRejectedValue(new Error("Cloudflare HTTP 429")), persistScene: vi.fn(), updateJob });
    expect(result.status).toBe("failed");
    expect(updateJob).toHaveBeenLastCalledWith("job-scenes-2", "failed", expect.objectContaining({ error: expect.any(String) }));
    expect(result.error).toMatch(/Cloudflare HTTP 429/);
  });

  it("does not hide the original failure if persisting failed also errors", async () => {
    const updateJob = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("checkpoint denied"));
    const result = await processAutoReelScenes({ jobId: "job-scenes-fail-update", factualSnapshot, sourceImage: new Blob(["image"]), generate: vi.fn().mockRejectedValue(new Error("Cloudflare HTTP 400")), persistScene: vi.fn(), updateJob });
    expect(result).toEqual(expect.objectContaining({ status: "failed", error: "Cloudflare HTTP 400", failureUpdateError: "checkpoint denied" }));
  });

  it("marks the job failed when a generated image is empty or invalid", async () => {
    const updateJob = vi.fn();
    const result = await processAutoReelScenes({ jobId: "job-scenes-3", factualSnapshot, sourceImage: new Blob(["image"]), generate: vi.fn().mockResolvedValue({ bytes: new Uint8Array(), contentType: "image/jpeg", width: 768, height: 1024 }), persistScene: vi.fn(), updateJob });
    expect(result.status).toBe("failed");
    expect(updateJob).toHaveBeenLastCalledWith("job-scenes-3", "failed", expect.objectContaining({ error: expect.any(String) }));
  });

  it("updates progress through planning and generating_visual", async () => {
    const updateJob = vi.fn();
    await processAutoReelScenes({ jobId: "job-scenes-4", factualSnapshot, sourceImage: new Blob(["image"]), generate: vi.fn().mockResolvedValue({ bytes: new Uint8Array([1]), contentType: "image/jpeg", width: 768, height: 1024 }), persistScene: vi.fn().mockResolvedValue({ storagePath: "scene.jpg" }), updateJob });
    expect(updateJob.mock.calls.map(([id, status]) => [id, status])).toEqual([
      ["job-scenes-4", "planning"], ["job-scenes-4", "generating_visual"],
      ["job-scenes-4", "generating_visual"], ["job-scenes-4", "generating_visual"],
      ["job-scenes-4", "generating_visual"], ["job-scenes-4", "generating_visual"],
      ["job-scenes-4", "scenes_ready"],
    ]);
  });

  it("saves a checkpoint after every persisted scene", async () => {
    const updateJob = vi.fn();
    await processAutoReelScenes({ jobId: "job-checkpoint", factualSnapshot, sourceImage: new Blob(["image"]), generate: vi.fn().mockResolvedValue({ bytes: new Uint8Array([1]), contentType: "image/jpeg", width: 768, height: 1024 }), persistScene: vi.fn().mockResolvedValue({ storagePath: "scene.jpg" }), updateJob });
    const checkpoints = updateJob.mock.calls.filter(([, stage, metadata]) => stage === "generating_visual" && metadata?.visualScenes).map(([, , metadata]) => metadata.visualScenes.length);
    expect(checkpoints).toEqual([1, 2, 3, 4]);
  });

  it.each([1, 2, 3])("resumes after %s persisted scene(s) without duplication", async (completed) => {
    const generate = vi.fn().mockResolvedValue({ bytes: new Uint8Array([1]), contentType: "image/jpeg", width: 768, height: 1024 });
    await processAutoReelScenes({ jobId: `job-resume-${completed}`, factualSnapshot, sourceImage: new Blob(["image"]), existingScenes: Array.from({ length: completed }, (_, index) => persistedScene(index + 1)), generate, persistScene: vi.fn().mockResolvedValue({ storagePath: "scene.jpg" }), updateJob: vi.fn() });
    expect(generate).toHaveBeenCalledTimes(4 - completed);
    expect(generate.mock.calls.map(([scene]) => scene.number)).toEqual(Array.from({ length: 4 - completed }, (_, index) => completed + index + 1));
  });

  it("resumes generating_visual with no persisted scenes", async () => {
    const generate = vi.fn().mockResolvedValue({ bytes: new Uint8Array([1]), contentType: "image/jpeg", width: 768, height: 1024 });
    const result = await processAutoReelScenes({ jobId: "job-resume-empty", factualSnapshot, sourceImage: new Blob(["image"]), existingScenes: [], generate, persistScene: vi.fn().mockResolvedValue({ storagePath: "scene.jpg" }), updateJob: vi.fn() });
    expect(generate).toHaveBeenCalledTimes(4);
    expect(result.status).toBe("scenes_ready");
  });

  it("resumes from the first missing scene", async () => {
    const generate = vi.fn().mockResolvedValue({ bytes: new Uint8Array([1]), contentType: "image/jpeg", width: 768, height: 1024 });
    await processAutoReelScenes({ jobId: "job-resume-two", factualSnapshot, sourceImage: new Blob(["image"]), existingScenes: [persistedScene(1), persistedScene(2)], generate, persistScene: vi.fn().mockResolvedValue({ storagePath: "scene.jpg" }), updateJob: vi.fn() });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls.map(([scene]) => scene.number)).toEqual([3, 4]);
  });

  it("does not duplicate already persisted scenes", () => {
    const planned = planAutoReelScenes(factualSnapshot);
    expect(scenesToGenerate(planned, [persistedScene(1), persistedScene(2)])).toEqual(planned.slice(2));
  });

  it("only resumes planning and generating_visual jobs", () => {
    expect(canResumeAutoReelScenes("planning")).toBe(true);
    expect(canResumeAutoReelScenes("generating_visual")).toBe(true);
    for (const stage of ["scenes_ready", "queued", "analyzing", "dubbing", "rendering", "ready_for_review", "failed"]) {
      expect(canResumeAutoReelScenes(stage)).toBe(false);
    }
  });

  it("marks a failed resume as failed without hiding the original error", async () => {
    const updateJob = vi.fn();
    const result = await processAutoReelScenes({ jobId: "job-resume-fail", factualSnapshot, sourceImage: new Blob(["image"]), existingScenes: [persistedScene(1), persistedScene(2)], generate: vi.fn().mockRejectedValue(new Error("Cloudflare HTTP 429")), persistScene: vi.fn(), updateJob });
    expect(result.status).toBe("failed");
    expect(result.error).toContain("Cloudflare HTTP 429");
    expect(updateJob).toHaveBeenLastCalledWith("job-resume-fail", "failed", expect.objectContaining({ error: "Cloudflare HTTP 429" }));
  });

  it("fails closed when Cloudflare credentials are missing", async () => {
    await expect(generateFluxScene({ image: new Blob(["image"]), prompt: "prompt", seed: 101, accountId: "", apiToken: "" })).rejects.toThrow("Cloudflare visual não configurado.");
  });
});
