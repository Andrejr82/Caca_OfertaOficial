import { describe, expect, it, vi, beforeEach } from "vitest";
import { discoverInstagramBusinessId, publishToInstagram } from "@/lib/instagram/client";

describe("Instagram Meta Graph API Client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.INSTAGRAM_ACCESS_TOKEN = "mock-token";
    delete process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  });

  it("discovers Instagram Business Account ID correctly from Facebook pages", async () => {
    // Mock 1: GET /me/accounts lists facebook pages
    const mockPagesResponse = {
      data: [
        {
          name: "Caça Oferta Página FB",
          id: "page-12345"
        }
      ]
    };

    // Mock 2: GET /page-12345?fields=instagram_business_account returns IG account
    const mockIgResponse = {
      instagram_business_account: {
        id: "ig-business-99999"
      },
      id: "page-12345"
    };

    vi.spyOn(global, "fetch").mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("/me/accounts")) {
        return {
          ok: true,
          json: async () => mockPagesResponse
        } as Response;
      }
      if (urlStr.includes("/page-12345")) {
        return {
          ok: true,
          json: async () => mockIgResponse
        } as Response;
      }
      return { ok: false } as Response;
    });

    const businessId = await discoverInstagramBusinessId();
    expect(businessId).toBe("ig-business-99999");
  });

  it("publishes post in 2 stages correctly", async () => {
    process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID = "ig-business-99999";

    // Mock 1: POST /ig-business-99999/media creates container
    const mockContainerResponse = {
      id: "container-888"
    };

    // Mock 2: POST /ig-business-99999/media_publish publishes container
    const mockPublishResponse = {
      id: "published-post-777"
    };

    vi.spyOn(global, "fetch").mockImplementation(async (url) => {
      const urlStr = String(url);
      
      // Mock para Etapa 2 (Polling status) - precisa vir antes de /media
      if (urlStr.includes("fields=status_code")) {
        return {
          ok: true,
          text: async () => JSON.stringify({ status_code: "FINISHED" }),
          json: async () => ({ status_code: "FINISHED" })
        } as Response;
      }
      
      if (urlStr.includes("/media") && !urlStr.includes("/media_publish")) {
        return {
          ok: true,
          text: async () => JSON.stringify(mockContainerResponse),
          json: async () => mockContainerResponse
        } as Response;
      }
      if (urlStr.includes("/media_publish")) {
        return {
          ok: true,
          text: async () => JSON.stringify(mockPublishResponse),
          json: async () => mockPublishResponse
        } as Response;
      }
      return { ok: false } as Response;
    });

    const postId = await publishToInstagram("https://example.com/product.jpg", "Oferta Incrível!");
    expect(postId).toBe("published-post-777");
  });
});
