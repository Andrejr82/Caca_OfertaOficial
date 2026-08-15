import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseAdminClient, rpc, from } = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient }));

import { GET } from "@/app/api/videos/worker/next/route";

const workerId = "oracle-preflight";

function request(headers: HeadersInit = {}) {
  return new Request("http://localhost/api/videos/worker/next", {
    headers: {
      Authorization: "Bearer worker-token",
      "X-Video-Worker-Id": workerId,
      ...headers,
    },
  });
}

function claim(result: unknown) {
  rpc.mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue(result) });
}

describe("GET /api/videos/worker/next", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VIDEO_WORKER_TOKEN", "worker-token");
    createSupabaseAdminClient.mockReturnValue({ rpc, from });
  });

  it.each([null, { id: null }])("returns an empty queue without reading video_jobs for %j", async (claimed) => {
    claim({ data: claimed, error: null });

    const response = await GET(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ job: null });
    expect(from).not.toHaveBeenCalled();
  });

  it("keeps the normal claim flow for a valid UUID", async () => {
    const job = { id: "11111111-1111-4111-8111-111111111111", status: "processing" };
    claim({ data: { id: job.id }, error: null });
    const maybeSingle = vi.fn().mockResolvedValue({ data: job, error: null });
    const eq = vi.fn(() => ({ maybeSingle }));
    from.mockReturnValue({ select: vi.fn(() => ({ eq })) });

    const response = await GET(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ job });
    expect(eq).toHaveBeenCalledWith("id", job.id);
  });

  it("keeps worker authentication", async () => {
    const response = await GET(request({ Authorization: "Bearer invalid" }));

    expect(response.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
});
