import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WhatsappPostApprovalCard } from "@/components/whatsapp/whatsapp-actions";
import { TelegramPostApprovalCard } from "@/components/telegram/telegram-actions";
import { InstagramPostApprovalCard } from "@/components/instagram/instagram-actions";
import { FacebookPostApprovalCard } from "@/components/facebook/facebook-actions";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const post = {
  id: "post-1",
  content: "Oferta de teste",
  status: "draft",
  created_at: "2026-07-15T12:00:00.000Z",
  offers: {
    id: "offer-1",
    product_name: "Produto de teste",
    platform: "Amazon",
    current_price: 10,
    old_price: null,
    image_url: null,
    original_url: "https://example.com/product",
    coupon: null,
    notes: null
  }
};

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

describe.each([
  ["facebook", FacebookPostApprovalCard, /aprovar e publicar/i],
  ["instagram", InstagramPostApprovalCard, /aprovar e publicar no instagram/i],
  ["telegram", TelegramPostApprovalCard, /aprovar e publicar no telegram/i],
] as const)("individual approval on %s", (channel, Component, buttonName) => {
  it("notifies the list and refreshes without a full page reload", async () => {
    const onApproved = vi.fn();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue({ ok: true }) })
      .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<Component post={{ ...post, offers: { ...post.offers, image_url: "https://example.com/image.jpg" } }} onApproved={onApproved} />);

    fireEvent.click(screen.getByRole("button", { name: buttonName }));

    await waitFor(() => expect(onApproved).toHaveBeenCalledWith("post-1"));
    expect(refresh).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/posts/update-content", expect.anything());
    expect(fetchMock).toHaveBeenNthCalledWith(2, `/api/${channel}/publish`, expect.anything());
  });
});
