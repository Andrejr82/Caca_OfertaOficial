import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/dashboard/batch-approval-list", () => ({
  BatchApprovalList: ({ posts }: { posts: unknown[] }) => <div data-testid="batch-count">{posts.length}</div>,
}));
vi.mock("@/components/dashboard/post-history-table", () => ({
  PostHistoryTable: ({ initialData }: { initialData: unknown[] }) => <div data-testid="history-count">{initialData.length}</div>,
}));

import { SocialChannelPostsView } from "@/components/dashboard/social-channel-posts-view";

describe("SocialChannelPostsView WhatsApp operational counters", () => {
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
    expect(screen.getByTestId("batch-count").textContent).toBe("30");
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
      expect(screen.getByTestId("batch-count").textContent).toBe("20");
      expect(screen.getByTestId("history-count").textContent).toBe(String(Math.ceil(727 / 3)));

      fireEvent.click(screen.getByRole("button", { name: /Shopee/ }));
      expect(screen.getByTestId("batch-count").textContent).toBe("17");
    },
  );
});
