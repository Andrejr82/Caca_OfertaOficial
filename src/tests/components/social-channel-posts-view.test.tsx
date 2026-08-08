import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/dashboard/batch-approval-list", () => ({
  BatchApprovalList: ({ posts }: { posts: unknown[] }) => <div data-testid="batch-count">{posts.length}</div>,
}));
vi.mock("@/components/dashboard/post-history-table", () => ({
  PostHistoryTable: () => <div data-testid="history" />,
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
});
