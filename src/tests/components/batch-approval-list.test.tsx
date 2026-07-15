import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>
}));
vi.mock("@/components/telegram/telegram-actions", () => ({ TelegramPostApprovalCard: () => <div>telegram card</div> }));
vi.mock("@/components/instagram/instagram-actions", () => ({ InstagramPostApprovalCard: () => <div>instagram card</div> }));
vi.mock("@/components/whatsapp/whatsapp-actions", () => ({ WhatsappPostApprovalCard: () => <div>whatsapp card</div> }));

import { BatchApprovalList } from "@/components/dashboard/batch-approval-list";

const posts = ["post-1", "post-2", "post-3"].map((id) => ({
  id,
  content: id,
  status: "draft",
  external_id: null,
  posted_at: null,
  created_at: "2026-07-15T12:00:00.000Z",
  offers: {
    id: `offer-${id}`,
    product_name: id,
    platform: "Amazon",
    current_price: 10,
    old_price: null,
    image_url: null,
    original_url: "https://example.com",
    coupon: null,
    notes: null
  }
}));

describe("BatchApprovalList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal("alert", vi.fn());
  });

  it("sends only the partially selected ids with the channel and refreshes after an intermediate failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 207,
      json: vi.fn().mockResolvedValue({
        ok: false,
        message: "2 publicação(ões) excluída(s); 1 falha(s).",
        successCount: 2,
        failureCount: 1
      })
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<BatchApprovalList posts={posts} channel="whatsapp" />);

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1]);
    fireEvent.click(checkboxes[3]);
    fireEvent.click(screen.getByRole("button", { name: /excluir selecionados/i }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/posts/bulk-reject", expect.objectContaining({
      body: JSON.stringify({ postIds: ["post-1", "post-3"], channel: "whatsapp" })
    }));
    expect(alert).toHaveBeenCalledWith("2 publicação(ões) excluída(s); 1 falha(s).");
    expect(screen.queryByRole("button", { name: /excluir selecionados/i })).toBeNull();
  });

  it("selects all visible posts and releases loading after an HTTP error", async () => {
    let resolveFetch!: (value: unknown) => void;
    const fetchMock = vi.fn(() => new Promise((resolve) => { resolveFetch = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    render(<BatchApprovalList posts={posts} channel="telegram" />);

    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    const button = screen.getByRole("button", { name: /excluir selecionados/i });
    fireEvent.click(button);

    expect(screen.getByRole("button", { name: /excluindo/i })).toHaveProperty("disabled", true);
    resolveFetch({
      ok: false,
      status: 500,
      json: vi.fn().mockResolvedValue({ message: "falha simulada" })
    });

    await waitFor(() => expect(screen.getByRole("button", { name: /excluir selecionados/i })).toHaveProperty("disabled", false));
    expect(fetchMock).toHaveBeenCalledWith("/api/posts/bulk-reject", expect.objectContaining({
      body: JSON.stringify({ postIds: ["post-1", "post-2", "post-3"], channel: "telegram" })
    }));
    expect(refresh).not.toHaveBeenCalled();
  });
});
