import { describe, expect, it } from "vitest";
import { resolveImportedVideoSource } from "@/lib/videos/import/source-resolver";

function response(body: string, init: ResponseInit = {}) {
  return new Response(body, init);
}

describe("imported video source resolver", () => {
  it("follows the approved Shopee chain and extracts an mp4 URL", async () => {
    const calls: string[] = [];
    const result = await resolveImportedVideoSource("https://br.shp.ee/fz1a34gu?smtt=0.0.9", {
      resolveHost: async () => ["203.0.113.10"],
      fetchImpl: async (input) => {
        const url = String(input);
        calls.push(url);
        if (url.includes("br.shp.ee")) return response("", { status: 301, headers: { location: "https://shopee.com.br/universal-link?redir=video" } });
        if (url.includes("shopee.com.br/universal-link")) return response("", { status: 301, headers: { location: "https://sv.shopee.com.br/share-video/id" } });
        return response('<html><script>window.VideoUrl="https://down-zl-br.vod.susercontent.com/video.mp4"</script></html>', { headers: { "content-type": "text/html" } });
      }
    });

    expect(result).toEqual({
      sourceUrl: "https://br.shp.ee/fz1a34gu?smtt=0.0.9",
      resolvedPageUrl: "https://sv.shopee.com.br/share-video/id",
      mediaUrl: "https://down-zl-br.vod.susercontent.com/video.mp4",
      sourcePlatform: "shopee",
      redirects: 2
    });
    expect(calls).toHaveLength(3);
  });

  it("rejects a redirect to an unauthorized host", async () => {
    await expect(resolveImportedVideoSource("https://br.shp.ee/video", {
      resolveHost: async () => ["203.0.113.10"],
      fetchImpl: async () => response("", { status: 302, headers: { location: "https://127.0.0.1/private.mp4" } })
    })).rejects.toMatchObject({ code: "REDIRECT_HOST_NOT_ALLOWED" });
  });

  it("rejects redirect loops beyond the configured maximum", async () => {
    await expect(resolveImportedVideoSource("https://br.shp.ee/video", {
      maxRedirects: 1,
      resolveHost: async () => ["203.0.113.10"],
      fetchImpl: async () => response("", { status: 302, headers: { location: "https://shopee.com.br/next" } })
    })).rejects.toMatchObject({ code: "REDIRECT_LIMIT" });
  });
});
