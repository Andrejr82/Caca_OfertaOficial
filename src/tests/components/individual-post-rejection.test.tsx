import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WhatsappPostApprovalCard } from "@/components/whatsapp/whatsapp-actions";
import { TelegramPostApprovalCard } from "@/components/telegram/telegram-actions";
import { InstagramPostApprovalCard } from "@/components/instagram/instagram-actions";

const post = {
  id: "post-1",
  content: "Oferta de teste",
  status: "draft",
  created_at: "2026-07-15T12:00:00.000Z",
  offers: {
    id: "offer-1",
    status: "pending_manual_review",
    product_name: "Produto de teste",
    platform: "Amazon",
    current_price: 10,
    old_price: null,
    image_url: "https://example.com/product.jpg",
    original_url: "https://example.com/product",
    coupon: null,
    notes: null
  }
};

describe.each([
  ["whatsapp", WhatsappPostApprovalCard],
  ["telegram", TelegramPostApprovalCard],
  ["instagram", InstagramPostApprovalCard]
] as const)("official approval before publication on %s", (channel, Component) => {
  it("approves the offer before calling the publication endpoint", async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (url: string) => {
      calls.push(url);
      return {
        ok: true,
        json: async () => url === "/api/publication/approve"
          ? { ok: true, offerState: "approved" }
          : { ok: true, result: { status: "published" } }
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Component post={post} />);

    fireEvent.click(screen.getByRole("button", { name: /aprovar e (enviar|publicar)/i }));

    await waitFor(() => expect(calls).toEqual([
      "/api/publication/approve",
      `/api/${channel}/publish`
    ]));
  });

  it("does not call publication when official approval fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ ok: false, message: "Aprovação oficial falhou" })
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Component post={post} />);

    fireEvent.click(screen.getByRole("button", { name: /aprovar e (enviar|publicar)/i }));

    await waitFor(() => expect(screen.getByText("Aprovação oficial falhou")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/publication/approve", expect.any(Object));
  });
});

describe.each([
  ["whatsapp", WhatsappPostApprovalCard],
  ["telegram", TelegramPostApprovalCard],
  ["instagram", InstagramPostApprovalCard]
] as const)("individual rejection on %s", (channel, Component) => {
  it("sends the post and channel and releases loading after an error", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ message: "falha simulada" })
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Component post={post} />);

    const button = screen.getByRole("button", { name: /excluir sugestão/i });
    fireEvent.click(button);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/posts/reject", expect.objectContaining({
      body: JSON.stringify({ postId: "post-1", channel })
    })));
    await waitFor(() => expect(button).toHaveProperty("disabled", false));
    expect(screen.getByText("falha simulada")).toBeTruthy();
  });
});
