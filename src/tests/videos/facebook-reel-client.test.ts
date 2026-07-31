import { afterEach, describe, expect, it, vi } from "vitest";
import { publishToFacebookReel } from "@/lib/platforms/facebook";

afterEach(() => vi.restoreAllMocks());

describe("Facebook Reel client", () => {
  it("uses hosted-video upload, polling and final publish without logging secrets", async () => {
    process.env.FACEBOOK_PAGE_ID = "page-1";
    process.env.FACEBOOK_ACCESS_TOKEN = "token-secret";
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ video_id: "video-1", upload_url: "https://rupload.facebook.com/video-upload/v19.0/video-1" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: { video_status: "ready" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, post_id: "post-1" }), { status: 200 }));

    await expect(publishToFacebookReel("https://storage.example/video.mp4", "Oferta", "https://shopee.com.br/track")).resolves.toMatchObject({ success: true, postId: "post-1" });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls.map(([url]) => String(url)).join(" ")).not.toContain("token-secret");
  });

  it("returns the Meta authentication diagnostic when Reel initialization fails", async () => {
    process.env.FACEBOOK_PAGE_ID = "page-1";
    process.env.FACEBOOK_ACCESS_TOKEN = "token-secret";
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      error: { message: "The session is invalid because the user logged out.", code: 190, error_subcode: 467 }
    }), { status: 400 }));

    await expect(publishToFacebookReel("https://storage.example/video.mp4", "Oferta"))
      .resolves.toMatchObject({
        success: false,
        message: "The session is invalid because the user logged out. (Meta 190/467)"
      });
  });
});
