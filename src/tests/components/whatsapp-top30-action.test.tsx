import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prepareTop30WhatsappLegacyDraftsAction } from "@/app/(dashboard)/whatsapp/actions";
import { WhatsappTop30Action } from "@/components/whatsapp/whatsapp-top30-action";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/(dashboard)/whatsapp/actions", () => ({
  prepareTop30WhatsappLegacyDraftsAction: vi.fn(),
}));

describe("WhatsappTop30Action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prepara apenas drafts WhatsApp, mostra o resumo e atualiza a lista antiga", async () => {
    vi.mocked(prepareTop30WhatsappLegacyDraftsAction).mockResolvedValue({
      ok: true,
      windowUsed: "today_brt",
      created: 30,
      reusedTodayDrafts: 0,
      reused: 0,
      skippedAlreadyPosted: 0,
      skippedAlreadyApproved: 0,
      skippedAlreadySeenToday: 0,
      skippedOldDraft: 0,
      skippedNotFresh: 0,
      skippedAffiliateFailed: 0,
      skipped: 0,
      reasons: { telegram_blocked: 1 },
      selectedOfferIds: Array.from({ length: 30 }, (_, index) => `offer-${index}`),
    });

    render(<WhatsappTop30Action />);
    fireEvent.click(screen.getByRole("button", { name: "Atualizar melhores ofertas" }));

    await waitFor(() => expect(screen.getByText(/30 criados/)).toBeTruthy());
    expect(screen.getByText(/today_brt/)).toBeTruthy();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Telegram|Vídeos|Reels/i)).toBeNull();
  });
});
