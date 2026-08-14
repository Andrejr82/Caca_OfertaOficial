import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/dashboard/batch-approval-list", () => ({
  BatchApprovalList: ({ posts, onPostApproved }: { posts: Array<{ id: string }>; onPostApproved?: (postId: string) => void }) => (
    <div data-testid="batch-count">
      <span data-testid="batch-total">{posts.length}</span>
      {posts[0] && <button type="button" data-testid="approve-first" onClick={() => onPostApproved?.(posts[0].id)}>approve</button>}
    </div>
  ),
}));
vi.mock("@/components/dashboard/post-history-table", () => ({
  PostHistoryTable: ({ initialData }: { initialData: unknown[] }) => <div data-testid="history-count">{initialData.length}</div>,
}));

import { SocialChannelPostsView } from "@/components/dashboard/social-channel-posts-view";

describe("SocialChannelPostsView WhatsApp operational counters", () => {
  beforeEach(() => localStorage.clear());

  it("reflects the already-contained latest-cycle Top30 instead of raw drafts", () => {
    const draftPosts = Array.from({ length: 30 }, (_, index) => ({
      id: `post-${index}`,
      offers: {
        id: `offer-${index}`,
        platform: index < 30 ? "Shopee" : "Amazon",
        category: "Casa",
      },
    }));

    render(<SocialChannelPostsView channel="whatsapp" accentClassName="accent" draftPosts={draftPosts} historyData={[{
      id: "historical-post",
      date: "07/08/2026",
      time: "09:00",
      product: "Histórico",
      platform: "Shopee",
      marketplace: "Shopee",
      category: "Casa",
      link: "#",
      channel: "whatsapp",
      status: "published",
      clicks: 0,
      conversions: 0,
      revenue: 0,
    }]} />);

    expect(screen.getByText("Todos").parentElement?.textContent).toContain("30");
    expect(screen.getByText("Shopee").parentElement?.textContent).toContain("30");
    expect(screen.getByText("Aguardando Aprovação").parentElement?.textContent).toContain("30");
    expect(screen.getByTestId("batch-total").textContent).toBe("30");
  });

  it.each(["facebook", "instagram", "telegram", "whatsapp"] as const)(
    "counts only current drafts for %s, not historical posts",
    (channel) => {
      const marketplaceByIndex = ["Amazon", "Mercado Livre", "Shopee"] as const;
      const draftCounts = [20, 15, 17];
      const draftPosts = draftCounts.flatMap((count, marketplaceIndex) => Array.from({ length: count }, (_, index) => ({
        id: `draft-${marketplaceIndex}-${index}`,
        offers: { platform: marketplaceByIndex[marketplaceIndex], marketplace: marketplaceByIndex[marketplaceIndex], category: "Casa" },
      })));
      const historyData = Array.from({ length: 727 }, (_, index) => ({
        id: `history-${index}`,
        date: "07/08/2026", time: "09:00", product: "Histórico", platform: marketplaceByIndex[index % 3],
        marketplace: marketplaceByIndex[index % 3], category: "Casa", link: "#", channel, status: "published",
        clicks: 0, conversions: 0, revenue: 0,
      }));

      render(<SocialChannelPostsView channel={channel} accentClassName="accent" draftPosts={draftPosts} historyData={historyData} />);

      expect(screen.getByRole("button", { name: /Todos/ }).textContent).toContain("52");
      expect(screen.getByRole("button", { name: /Amazon/ }).textContent).toContain("20");
      expect(screen.getByRole("button", { name: /Mercado Livre/ }).textContent).toContain("15");
      expect(screen.getByRole("button", { name: /Shopee/ }).textContent).toContain("17");

      fireEvent.click(screen.getByRole("button", { name: /Amazon/ }));
      expect(screen.getByTestId("batch-total").textContent).toBe("20");
      expect(screen.getByTestId("history-count").textContent).toBe(String(Math.ceil(727 / 3)));

      fireEvent.click(screen.getByRole("button", { name: /Shopee/ }));
      expect(screen.getByTestId("batch-total").textContent).toBe("17");
    },
  );

  it.each(["facebook", "instagram", "telegram"] as const)(
    "removes only the approved draft from %s and keeps the active marketplace filter",
    (channel) => {
      const draftPosts = [
        ...Array.from({ length: 20 }, (_, index) => ({ id: `amazon-${index}`, offers: { platform: "Amazon", category: "Casa" } })),
        ...Array.from({ length: 15 }, (_, index) => ({ id: `ml-${index}`, offers: { platform: "Mercado Livre", category: "Casa" } })),
        ...Array.from({ length: 17 }, (_, index) => ({ id: `shopee-${index}`, offers: { platform: "Shopee", category: "Casa" } })),
      ];

      render(<SocialChannelPostsView channel={channel} accentClassName="accent" draftPosts={draftPosts} historyData={[]} />);
      expect(screen.getByTestId("batch-total").textContent).toContain("52");

      fireEvent.click(screen.getByRole("button", { name: /Shopee/ }));
      expect(screen.getByTestId("batch-total").textContent).toContain("17");
      fireEvent.click(screen.getByTestId("approve-first"));
      expect(screen.getByTestId("batch-total").textContent).toContain("16");
      expect(screen.getByRole("button", { name: /Shopee/ }).className).toContain("accent");
      fireEvent.click(screen.getByTestId("approve-first"));
      expect(screen.getByTestId("batch-total").textContent).toContain("15");
      fireEvent.click(screen.getByRole("button", { name: /Todos/ }));
      expect(screen.getByTestId("batch-total").textContent).toContain("50");
      expect(screen.getByRole("button", { name: /Amazon/ }).textContent).toContain("20");
      expect(screen.getByRole("button", { name: /Mercado Livre/ }).textContent).toContain("15");
    },
  );

  it("keeps the approved post available in history after refreshed props arrive", () => {
    const draft = { id: "draft-1", offers: { platform: "Amazon", category: "Casa" } };
    const historyPost = {
      id: "draft-1", date: "07/08/2026", time: "09:00", product: "Produto aprovado", platform: "Amazon",
      marketplace: "Amazon", category: "Casa", link: "#", channel: "facebook", status: "published",
      clicks: 0, conversions: 0, revenue: 0,
    };
    const view = render(<SocialChannelPostsView channel="facebook" accentClassName="accent" draftPosts={[draft]} historyData={[]} />);

    fireEvent.click(screen.getByTestId("approve-first"));
    expect(screen.getByTestId("batch-total").textContent).toBe("0");

    view.rerender(<SocialChannelPostsView channel="facebook" accentClassName="accent" draftPosts={[]} historyData={[historyPost]} />);
    expect(screen.getByTestId("history-count").textContent).toBe("1");
  });
});
