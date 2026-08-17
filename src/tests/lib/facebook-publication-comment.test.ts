import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publishToFacebook } from "@/lib/platforms/facebook";

function graphResponse(data: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(data),
  } as Response;
}

describe("Facebook publication first comment", () => {
  beforeEach(() => {
    vi.stubEnv("FACEBOOK_PAGE_ID", "page-123");
    vi.stubEnv("FACEBOOK_ACCESS_TOKEN", "user-token");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("publica o primeiro comentário com o tracked link usando o Page Token resolvido", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(graphResponse({ access_token: "page-token" }))
      .mockResolvedValueOnce(graphResponse({ id: "photo-1", post_id: "page-123_post-1" }))
      .mockResolvedValueOnce(graphResponse({ id: "comment-1" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await publishToFacebook(
      "Texto da oferta",
      "https://images.example/produto.jpg",
      null,
      "https://caca-oferta-oficial.vercel.app/go/fb_offer",
    );

    expect(result).toMatchObject({
      success: true,
      postId: "page-123_post-1",
      commentStatus: "published",
      commentId: "comment-1",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const [commentUrl, commentRequest] = fetchMock.mock.calls[2];
    expect(String(commentUrl)).toContain("/page-123_post-1/comments");
    expect(JSON.parse(String(commentRequest?.body))).toEqual({
      message: "🛒 Compre aqui: https://caca-oferta-oficial.vercel.app/go/fb_offer",
      access_token: "page-token",
    });
  });

  it("não tenta comentário quando a publicação não possui affiliate link", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(graphResponse({ access_token: "page-token" }))
      .mockResolvedValueOnce(graphResponse({ id: "page-123_post-2" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await publishToFacebook("Texto sem link");

    expect(result).toMatchObject({ success: true, postId: "page-123_post-2", commentStatus: "not_requested" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("não falha a publicação já criada quando o comentário falha", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(graphResponse({ access_token: "page-token" }))
      .mockResolvedValueOnce(graphResponse({ id: "page-123_post-3" }))
      .mockResolvedValueOnce(graphResponse({ error: { message: "comment denied" } }, false, 403));
    vi.stubGlobal("fetch", fetchMock);

    const result = await publishToFacebook(
      "Texto da oferta",
      null,
      null,
      "https://caca-oferta-oficial.vercel.app/go/fb_offer",
    );

    expect(result).toMatchObject({
      success: true,
      postId: "page-123_post-3",
      commentStatus: "failed",
    });
    expect(result.commentError).toMatch(/comment denied/i);
  });
});
