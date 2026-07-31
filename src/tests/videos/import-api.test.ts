import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: { id: "user-1" } as { id: string } | null,
  offer: { id: "offer-1" } as { id: string } | null,
  existingJob: null as { id: string; status: string } | null,
  rpcError: null as { message: string } | null,
  updateCalls: [] as unknown[]
}));

function query(table: string) {
  const builder: Record<string, any> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    filter: vi.fn(() => builder),
    in: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({ data: table === "offers" ? state.offer : state.existingJob, error: null })),
    update: vi.fn((payload: unknown) => { state.updateCalls.push({ table, payload }); return builder; })
  };
  return builder;
}

const client = {
  auth: { getUser: vi.fn(async () => ({ data: { user: state.user } })) },
  from: vi.fn((table: string) => query(table)),
  rpc: vi.fn(async () => ({ data: { id: "job-1", status: "queued", stage: "queued" }, error: state.rpcError }))
};

vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn(async () => client) }));
vi.mock("@/lib/videos/job-policy", () => ({ getVideoJobPolicy: () => ({ dailyLimit: null, queueLimit: 3 }) }));

import { POST } from "@/app/api/videos/import/route";

function request(body: unknown) {
  return new Request("http://localhost/api/videos/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("POST /api/videos/import", () => {
  beforeEach(() => {
    state.user = { id: "user-1" };
    state.offer = { id: "offer-1" };
    state.existingJob = null;
    state.rpcError = null;
    state.updateCalls = [];
    vi.clearAllMocks();
  });

  it("rejects unauthenticated requests", async () => {
    state.user = null;
    const response = await POST(request({ offerId: "offer-1", sourceUrl: "https://br.shp.ee/video", channels: ["instagram"], rightsConfirmed: true }));
    expect(response.status).toBe(401);
  });

  it("creates an imported-video-v1 job with rights metadata", async () => {
    const response = await POST(request({ offerId: "offer-1", sourceUrl: "https://br.shp.ee/fz1a34gu?smtt=0.0.9", channels: ["instagram", "facebook"], rightsConfirmed: true }));
    expect(response.status).toBe(201);
    expect(client.rpc).toHaveBeenCalledWith("enqueue_video_job", expect.objectContaining({ _template_id: "imported-video-v1", _offer_id: "offer-1", _user_id: "user-1" }));
    expect(state.updateCalls).toHaveLength(1);
    expect(state.updateCalls[0]).toEqual(expect.objectContaining({ table: "video_jobs", payload: expect.objectContaining({ metadata: expect.objectContaining({ importedVideo: expect.objectContaining({ rightsConfirmed: true, channels: ["instagram", "facebook"] }) }) }) }));
  });

  it("blocks an existing simultaneous idempotent job", async () => {
    state.existingJob = { id: "job-existing", status: "queued" };
    const response = await POST(request({ offerId: "offer-1", sourceUrl: "https://br.shp.ee/video", channels: ["instagram"], rightsConfirmed: true }));
    expect(response.status).toBe(409);
    expect(client.rpc).not.toHaveBeenCalled();
  });
});
