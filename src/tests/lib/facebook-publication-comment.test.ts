import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publishToFacebook } from "@/lib/platforms/facebook";

function graphResponse(data: unknown, ok = true, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
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

    const trackedUrl = "https://caca-oferta-oficial.vercel.app/go/fb_offer";
    const result = await publishToFacebook(
      `Texto da oferta\n\n👉 Veja a oferta no primeiro comentário. 👇\n\n👉 ${trackedUrl}\n\n#Oferta`,
      "https://images.example/produto.jpg",
      null,
      trackedUrl,
    );

    expect(result).toMatchObject({
      success: true,
      postId: "page-123_post-1",
      commentStatus: "published",
      commentId: "comment-1",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const [, publishRequest] = fetchMock.mock.calls[1];
    const publishPayload = JSON.parse(String(publishRequest?.body));
    expect(publishPayload.message).toContain("Veja a oferta no primeiro comentário");
    expect(publishPayload.message).toContain("#Oferta");
    expect(publishPayload.message).not.toContain(trackedUrl);

    const [commentUrl, commentRequest] = fetchMock.mock.calls[2];
    expect(String(commentUrl)).toContain("/page-123_post-1/comments");
    expect(JSON.parse(String(commentRequest?.body))).toEqual({
      message: `🛒 Compre aqui: ${trackedUrl}`,
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
