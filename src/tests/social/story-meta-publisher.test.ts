import { afterEach, describe, expect, it, vi } from "vitest";
import { publishFacebookStory, publishInstagramStory } from "@/lib/social/story-meta-publisher";

const originalEnv = { ...process.env };
afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe("story Meta publisher", () => {
  it("publica Story do Facebook em duas etapas sem criar feed post", async () => {
    process.env.FACEBOOK_PAGE_ID = "page-1";
    process.env.FACEBOOK_ACCESS_TOKEN = "token";
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "photo-1" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, post_id: "story-1" }), { status: 200 }));

    await expect(publishFacebookStory("https://example.com/story.jpg", fetcher as typeof fetch)).resolves.toBe("story-1");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][0]).toMatch(/\/page-1\/photos$/u);
    expect(fetcher.mock.calls[1][0]).toMatch(/\/page-1\/photo_stories$/u);
    expect(String(fetcher.mock.calls[0][0])).not.toContain("/feed");
  });

  it("publica Story do Instagram com container STORIES e media_publish", async () => {
    process.env.INSTAGRAM_ACCESS_TOKEN = "token";
    process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID = "ig-1";
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "container-1" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status_code: "FINISHED" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "ig-story-1" }), { status: 200 }));

    await expect(publishInstagramStory("https://example.com/story.jpg", fetcher as typeof fetch)).resolves.toBe("ig-story-1");
    const containerBody = JSON.parse(fetcher.mock.calls[0][1]?.body as string);
    expect(containerBody).toMatchObject({ media_type: "STORIES", image_url: "https://example.com/story.jpg" });
    expect(fetcher.mock.calls[2][0]).toMatch(/\/ig-1\/media_publish$/u);
  });

  it("bloqueia publicação sem credenciais", async () => {
    delete process.env.FACEBOOK_PAGE_ID;
    delete process.env.FACEBOOK_ACCESS_TOKEN;
    delete process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
    await expect(publishFacebookStory("https://example.com/story.jpg", vi.fn() as unknown as typeof fetch)).rejects.toThrow("FACEBOOK_PAGE_ID");
  });
});
