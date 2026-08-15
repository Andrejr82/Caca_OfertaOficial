import { beforeEach, describe, expect, it, vi } from "vitest";

const { createServerSupabaseClient, createSupabaseAdminClient, getUser, adminFrom } = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  getUser: vi.fn(),
  adminFrom: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient }));

import { POST } from "@/app/api/reels/review/route";
import { canResumeAutoReelScenes } from "@/lib/videos/auto-reel-scenes";

const user = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
const factualSnapshot = {
  offerId: "11111111-1111-4111-8111-111111111111",
  productName: "Extratora portátil",
  currentPrice: 399.9,
  platform: "Shopee",
  imageUrl: "https://cdn.example.com/product.jpg",
};
const previousJob = {
  id: "22222222-2222-4222-8222-222222222222",
  user_id: user.id,
  offer_id: factualSnapshot.offerId,
  stage: "ready_for_review",
  metadata: {
    factualSnapshot,
    style: "demonstrative-reel",
    attempt: 1,
    visualScenes: [{ number: 1 }],
    completionRequested: true,
    renderManifest: { scenes: [] },
    audioUrl: "https://cdn.example.com/old.mp3",
    durationSeconds: 12,
    rendered: true,
  },
};

function chain(result: unknown) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["select", "eq", "update", "insert"]) builder[method] = vi.fn(() => builder);
  builder.maybeSingle = vi.fn().mockResolvedValue(result);
  builder.single = vi.fn().mockResolvedValue(result);
  return builder;
}

function request(action: "approve" | "reject" | "regenerate") {
  return new Request("http://localhost/api/reels/review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId: previousJob.id, action }),
  });
}

describe("POST /api/reels/review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user } });
    createServerSupabaseClient.mockResolvedValue({ auth: { getUser } });
    createSupabaseAdminClient.mockReturnValue({ from: adminFrom });
  });

  it("regenerates into the visual pipeline without exposing the generic worker queue", async () => {
    const inserted = chain({ data: { id: "new-attempt", status: "processing", stage: "planning" }, error: null });
    adminFrom.mockImplementationOnce(() => chain({ data: previousJob, error: null }));
    adminFrom.mockImplementationOnce(() => inserted);

    const response = await POST(request("regenerate"));

    expect(response.status).toBe(201);
    const payload = inserted.insert.mock.calls[0][0];
    expect(payload).toMatchObject({
      user_id: user.id,
      offer_id: factualSnapshot.offerId,
      status: "processing",
      stage: "planning",
      template_id: "auto-reel-v1",
      metadata: { factualSnapshot, attempt: 2, previousAttemptId: previousJob.id },
    });
    expect(payload.status).not.toBe("queued");
    expect(canResumeAutoReelScenes(payload.stage)).toBe(true);
    for (const key of ["visualScenes", "completionRequested", "renderManifest", "audioUrl", "durationSeconds", "rendered"]) {
      expect(payload.metadata).not.toHaveProperty(key);
    }
    expect(previousJob.metadata).toHaveProperty("visualScenes");
  });

  it("keeps approval and rejection constrained to ready_for_review", async () => {
    const updated = chain({ data: { ...previousJob, status: "approved", stage: "approved" }, error: null });
    adminFrom.mockImplementationOnce(() => chain({ data: previousJob, error: null }));
    adminFrom.mockImplementationOnce(() => updated);

    const response = await POST(request("approve"));

    expect(response.status).toBe(200);
    expect(updated.update).toHaveBeenCalledWith(expect.objectContaining({ status: "approved", stage: "approved" }));
  });
});
