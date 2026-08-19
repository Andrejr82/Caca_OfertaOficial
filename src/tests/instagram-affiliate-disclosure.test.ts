import { beforeEach, describe, expect, it, vi } from "vitest";
import { publishToInstagram, publishVideoToInstagram } from "@/lib/instagram/client";

describe("Instagram affiliate disclosure", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.INSTAGRAM_ACCESS_TOKEN = "mock-token";
    process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID = "ig-business-99999";
    vi.spyOn(global, "setTimeout").mockImplementation(((callback: (...args: unknown[]) => void) => {
      callback();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);
  });

  it("marks feed media containers as paid partnership", async () => {
    let mediaPayload: Record<string, unknown> | undefined;

    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("fields=status_code")) {
        return new Response(JSON.stringify({ status_code: "FINISHED" }), { status: 200 });
      }
      if (url.endsWith("/media_publish")) {
        return new Response(JSON.stringify({ id: "published-post-777" }), { status: 200 });
      }
      if (url.endsWith("/media")) {
        mediaPayload = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ id: "container-888" }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });

    await publishToInstagram("https://example.com/product.jpg", "Oferta afiliada");

    expect(mediaPayload).toMatchObject({ is_paid_partnership: true });
  });

  it("marks Reel media containers as paid partnership", async () => {
    let mediaPayload: Record<string, unknown> | undefined;

    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (init?.method === "HEAD") {
        return new Response(null, {
          status: 200,
          headers: { "content-type": "video/mp4", "content-length": "1024" }
        });
      }
      if (url.includes("fields=status_code")) {
        return new Response(JSON.stringify({ status_code: "FINISHED" }), { status: 200 });
      }
      if (url.endsWith("/media_publish")) {
        return new Response(JSON.stringify({ id: "published-reel-777" }), { status: 200 });
      }
      if (url.endsWith("/media")) {
        mediaPayload = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ id: "container-reel-888" }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });

    await publishVideoToInstagram("https://example.com/product.mp4", "Oferta afiliada", {
      durationSeconds: 10,
      width: 1080,
      height: 1920,
      sizeBytes: 1024,
      mimeType: "video/mp4"
    });

    expect(mediaPayload).toMatchObject({ is_paid_partnership: true });
  });
});
