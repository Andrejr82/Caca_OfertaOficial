import { beforeEach, describe, expect, it, vi } from "vitest";

const { createServerSupabaseClient, createSupabaseAdminClient, getUser, adminFrom } = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  getUser: vi.fn(),
  adminFrom: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient }));

import { POST } from "@/app/api/reels/complete/route";

const user = { id: "user-complete-route" };
const snapshot = {
  offerId: "offer-complete-route",
  productName: "Produto demonstrativo",
  currentPrice: 29.9,
  platform: "Shopee",
  imageUrl: "https://cdn.example.test/product.jpg",
};
const scenes = [1, 2, 3, 4].map((number) => ({
  number,
  kind: ["presentation", "start", "use", "result"][number - 1],
  prompt: `scene ${number}`,
  mediaUrl: `https://cdn.example.test/scene-${number}.jpg`,
}));
const job = {
  id: "job-complete-route",
  user_id: user.id,
  offer_id: snapshot.offerId,
  status: "processing",
  stage: "scenes_ready",
  attempt_count: 0,
  metadata: { factualSnapshot: snapshot, visualScenes: scenes, attempt: 1 },
};

function chain(result: unknown) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["select", "eq", "update"]) builder[method] = vi.fn(() => builder);
  builder.maybeSingle = vi.fn().mockResolvedValue(result);
  return builder;
}

function request() {
  return new Request("http://localhost/api/reels/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId: job.id }),
  });
}

describe("POST /api/reels/complete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user } });
    createServerSupabaseClient.mockResolvedValue({ auth: { getUser } });
  });

  it("enfileira somente a transição processing/scenes_ready", async () => {
    const initial = chain({ data: job, error: null });
    const queued = { ...job, status: "queued", stage: "queued" };
    const update = chain({ data: queued, error: null });
    adminFrom.mockImplementationOnce(() => initial).mockImplementationOnce(() => update);
    createSupabaseAdminClient.mockReturnValue({ from: adminFrom });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.job.stage).toBe("queued");
    expect(update.eq).toHaveBeenCalledWith("status", "processing");
    expect(update.eq).toHaveBeenCalledWith("stage", "scenes_ready");
    expect(update.update).toHaveBeenCalledWith(expect.objectContaining({
      status: "queued",
      stage: "queued",
      metadata: expect.objectContaining({ completionRequested: true, renderManifest: expect.any(Object) }),
    }));
  });

  it("falha fechado quando o manifest não tem mídia persistida", async () => {
    const invalidJob = {
      ...job,
      metadata: { ...job.metadata, visualScenes: scenes.map(({ mediaUrl: _mediaUrl, ...scene }) => scene) },
    };
    const initial = chain({ data: invalidJob, error: null });
    const failed = { ...invalidJob, status: "failed", stage: "failed" };
    const update = chain({ data: failed, error: null });
    adminFrom.mockImplementationOnce(() => initial).mockImplementationOnce(() => update);
    createSupabaseAdminClient.mockReturnValue({ from: adminFrom });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.job.stage).toBe("failed");
    expect(body.error).toMatch(/cena sem imagem persistida/i);
    expect(update.update).toHaveBeenCalledWith(expect.objectContaining({ status: "failed", stage: "failed" }));
  });
});
