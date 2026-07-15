import { beforeEach, describe, expect, it, vi } from "vitest";

const { createServerSupabaseClient, getUser, from } = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  getUser: vi.fn(),
  from: vi.fn()
}));

vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient }));

import { POST as rejectPost } from "@/app/api/posts/reject/route";
import { POST as bulkRejectPosts } from "@/app/api/posts/bulk-reject/route";

type MutationResult = { data: { id: string } | null; error: { message: string } | null };

function postRequest(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

function installMutationResults(...results: MutationResult[]) {
  const builders: Array<{
    update: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
  }> = [];

  from.mockImplementation((table: string) => {
    expect(table).toBe("posts");
    const result = results[builders.length] ?? { data: null, error: { message: "unexpected mutation" } };
    const builder = {
      update: vi.fn(),
      eq: vi.fn(),
      select: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue(result)
    };
    builder.update.mockReturnValue(builder);
    builder.eq.mockReturnValue(builder);
    builder.select.mockReturnValue(builder);
    builders.push(builder);
    return builder;
  });

  return builders;
}

describe("post draft rejection routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: "tenant-1" } } });
    createServerSupabaseClient.mockResolvedValue({ auth: { getUser }, from });
  });

  it("soft-deletes one draft only for the authenticated tenant and requested channel", async () => {
    const builders = installMutationResults({ data: { id: "post-1" }, error: null });

    const response = await rejectPost(postRequest("/api/posts/reject", {
      postId: "post-1",
      channel: "whatsapp"
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, successCount: 1, failureCount: 0 });
    expect(builders[0].update).toHaveBeenCalledWith(expect.objectContaining({
      status: "deleted",
      deleted_by: "tenant-1",
      deleted_at: expect.any(String)
    }));
    expect(builders[0].eq.mock.calls).toEqual([
      ["id", "post-1"],
      ["user_id", "tenant-1"],
      ["channel", "whatsapp"],
      ["status", "draft"]
    ]);
  });

  it("does not alter a post from another tenant, channel, or non-draft state", async () => {
    installMutationResults({ data: null, error: null });

    const response = await rejectPost(postRequest("/api/posts/reject", {
      postId: "foreign-post",
      channel: "telegram"
    }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ ok: false, successCount: 0, failureCount: 1 });
  });

  it("rejects an unsupported channel without writing", async () => {
    const response = await rejectPost(postRequest("/api/posts/reject", {
      postId: "post-1",
      channel: "facebook"
    }));

    expect(response.status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });

  it("soft-deletes every selected draft and no unselected post", async () => {
    const builders = installMutationResults(
      { data: { id: "post-1" }, error: null },
      { data: { id: "post-3" }, error: null }
    );

    const response = await bulkRejectPosts(postRequest("/api/posts/bulk-reject", {
      postIds: ["post-1", "post-3"],
      channel: "instagram"
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, successCount: 2, failureCount: 0 });
    expect(builders).toHaveLength(2);
    expect(builders.flatMap((builder) => builder.eq.mock.calls.filter(([field]) => field === "id")))
      .toEqual([["id", "post-1"], ["id", "post-3"]]);
    expect(builders.every((builder) => builder.eq.mock.calls.some(
      ([field, value]) => field === "channel" && value === "instagram"
    ))).toBe(true);
  });

  it("isolates an intermediate failure, processes the remaining ids, and returns counts", async () => {
    const builders = installMutationResults(
      { data: { id: "post-1" }, error: null },
      { data: null, error: { message: "simulated failure" } },
      { data: { id: "post-3" }, error: null }
    );

    const response = await bulkRejectPosts(postRequest("/api/posts/bulk-reject", {
      postIds: ["post-1", "post-2", "post-3"],
      channel: "whatsapp"
    }));
    const payload = await response.json();

    expect(response.status).toBe(207);
    expect(payload).toMatchObject({ ok: false, successCount: 2, failureCount: 1 });
    expect(payload.results).toEqual([
      { postId: "post-1", ok: true },
      { postId: "post-2", ok: false, message: "simulated failure" },
      { postId: "post-3", ok: true }
    ]);
    expect(builders).toHaveLength(3);
  });

  it("deduplicates ids so a selected post is never mutated twice", async () => {
    const builders = installMutationResults({ data: { id: "post-1" }, error: null });

    const response = await bulkRejectPosts(postRequest("/api/posts/bulk-reject", {
      postIds: ["post-1", "post-1"],
      channel: "telegram"
    }));

    expect(response.status).toBe(200);
    expect(builders).toHaveLength(1);
  });
});
