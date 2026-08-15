import { beforeEach, describe, expect, it, vi } from "vitest";

const { createServerSupabaseClient, createSupabaseAdminClient, getUser, adminFrom, generateFluxScene } = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  getUser: vi.fn(),
  adminFrom: vi.fn(),
  generateFluxScene: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient }));
vi.mock("@/lib/videos/auto-reel-scenes", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/videos/auto-reel-scenes")>(),
  generateFluxScene,
}));

import { POST } from "@/app/api/reels/scenes/route";

const user = { id: "user-scenes-1" };
const job = {
  id: "job-scenes-1", user_id: user.id, offer_id: "offer-scenes-1", status: "processing", stage: "generating_visual",
  metadata: {
    factualSnapshot: {
      offerId: "offer-scenes-1", productName: "Produto demonstrativo", currentPrice: 29.9, platform: "Shopee", imageUrl: "https://cdn.example.test/product.jpg",
    },
  },
};

function chain(result: unknown = { data: null, error: null }) {
  const builder: Record<string, ReturnType<typeof vi.fn>> & { error?: unknown } = {};
  for (const method of ["select", "eq", "update"]) builder[method] = vi.fn(() => builder);
  builder.maybeSingle = vi.fn().mockResolvedValue(result);
  return builder;
}

function request() {
  return new Request("http://localhost/api/reels/scenes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: job.id }) });
}

function configureAdmin(storage: { download: ReturnType<typeof vi.fn>; upload: ReturnType<typeof vi.fn>; getPublicUrl: ReturnType<typeof vi.fn> }, updateError?: { code: string; message: string; details: string; hint: string }) {
  let videoJobs = 0;
  adminFrom.mockImplementation((table: string) => {
    if (table !== "video_jobs") throw new Error(`unexpected table ${table}`);
    videoJobs += 1;
    const builder = chain(videoJobs === 1
      ? { data: job, error: null }
      : { data: { id: job.id, status: "processing", stage: "scenes_ready", metadata: {} }, error: null });
    if (updateError) builder.update.mockImplementation(() => {
      builder.error = updateError;
      return builder;
    });
    return builder;
  });
  createSupabaseAdminClient.mockReturnValue({ from: adminFrom, storage: { from: vi.fn(() => storage) } });
}

describe("POST /api/reels/scenes storage persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user } });
    createServerSupabaseClient.mockResolvedValue({ auth: { getUser } });
    generateFluxScene.mockResolvedValue({ bytes: new Uint8Array([1, 2, 3]), contentType: "image/jpeg", width: 768, height: 1024 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("image", { status: 200, headers: { "content-type": "image/jpeg" } })));
  });

  it("reconcilia a cena que aparece na segunda leitura após erro de upload sem falhar o job", async () => {
    const downloads = [
      { data: null, error: { message: "not found" } },
      { data: null, error: { message: "not found" } },
      { data: new Blob(["scene"]), error: null },
      { data: new Blob(["scene"]), error: null },
      { data: new Blob(["scene"]), error: null },
      { data: new Blob(["scene"]), error: null },
    ];
    const storage = {
      download: vi.fn(async () => downloads.shift()),
      upload: vi.fn().mockResolvedValue({ error: { code: "Duplicate", message: "object already exists", details: "race" } }),
      getPublicUrl: vi.fn(() => ({ data: { publicUrl: "https://cdn.example.test/scene.jpg" } })),
    };
    const updateCalls: unknown[] = [];
    configureAdmin(storage);
    adminFrom.mockImplementation((table: string) => {
      if (table !== "video_jobs") throw new Error(`unexpected table ${table}`);
      const result = adminFrom.mock.calls.filter(([name]) => name === "video_jobs").length === 1 ? { data: job, error: null } : { data: { id: job.id, status: "processing", stage: "scenes_ready", metadata: {} }, error: null };
      const builder = chain(result);
      builder.update.mockImplementation((value) => { updateCalls.push(value); return builder; });
      return builder;
    });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.result.status).toBe("scenes_ready");
    expect(storage.download).toHaveBeenCalledTimes(6);
    expect(storage.upload).toHaveBeenCalledWith("auto-reels/job-scenes-1/scene-1.jpg", expect.any(Buffer), expect.objectContaining({ upsert: false }));
    expect(updateCalls.some((value) => (value as { metadata?: { visualScenes?: unknown[] } }).metadata?.visualScenes?.length === 1)).toBe(true);
    expect(updateCalls.some((value) => (value as { stage?: string }).stage === "failed")).toBe(false);
  });

  it("persiste uploads normais e reutiliza objetos Storage existentes", async () => {
    const storage = {
      download: vi.fn()
        .mockResolvedValueOnce({ data: null, error: { message: "not found" } })
        .mockResolvedValueOnce({ data: new Blob(["scene"]), error: null })
        .mockResolvedValueOnce({ data: new Blob(["scene"]), error: null })
        .mockResolvedValueOnce({ data: new Blob(["scene"]), error: null }),
      upload: vi.fn().mockResolvedValue({ error: null }),
      getPublicUrl: vi.fn(() => ({ data: { publicUrl: "https://cdn.example.test/scene.jpg" } })),
    };
    configureAdmin(storage);

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.result.status).toBe("scenes_ready");
    expect(storage.upload).toHaveBeenCalledTimes(1);
    expect(storage.upload).toHaveBeenCalledWith(expect.any(String), expect.any(Buffer), expect.objectContaining({ upsert: false }));
    expect(generateFluxScene).toHaveBeenCalledTimes(4);
  });

  it("preserva o erro sanitizado do Storage quando as três reconciliações não encontram o objeto", async () => {
    const storage = {
      download: vi.fn().mockResolvedValue({ data: null, error: { message: "not found" } }),
      upload: vi.fn().mockResolvedValue({ error: { code: "Duplicate", message: "object already exists", details: "race" } }),
      getPublicUrl: vi.fn(() => ({ data: { publicUrl: "https://cdn.example.test/scene.jpg" } })),
    };
    configureAdmin(storage);

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(storage.download).toHaveBeenCalledTimes(4);
    expect(JSON.parse(body.result.error)).toEqual({ code: "Duplicate", message: "object already exists", details: "race" });
  });

  it("preserva o erro sanitizado do checkpoint", async () => {
    const storage = {
      download: vi.fn(), upload: vi.fn(), getPublicUrl: vi.fn(),
    };
    configureAdmin(storage, { code: "42501", message: "checkpoint denied", details: "row policy", hint: "verify owner" });

    await expect(POST(request())).rejects.toThrow('{"code":"42501","message":"checkpoint denied","details":"row policy","hint":"verify owner"}');
  });
});
