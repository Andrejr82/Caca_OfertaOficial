import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { rotateNextWhatsappEditorialBatchAction } from "@/app/(dashboard)/whatsapp/actions";
import { WhatsappTop30Action } from "@/components/whatsapp/whatsapp-top30-action";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/(dashboard)/whatsapp/actions", () => ({
  rotateNextWhatsappEditorialBatchAction: vi.fn(),
}));

describe("WhatsappTop30Action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prepara apenas drafts WhatsApp, mostra o resumo e atualiza a lista antiga", async () => {
    vi.mocked(rotateNextWhatsappEditorialBatchAction).mockResolvedValue({
      ok: true,
      mode: "next-batch",
      status: "selected",
      selectedCount: 30,
      availableBeforeSelection: 60,
      selectedOfferIds: Array.from({ length: 30 }, (_, index) => `offer-${index}`),
      message: "Novo lote editorial WhatsApp selecionado.",
    });

    render(<WhatsappTop30Action />);
    fireEvent.click(screen.getByRole("button", { name: "Atualizar melhores ofertas" }));

    await waitFor(() => expect(screen.getByText("30 novas ofertas carregadas")).toBeTruthy());
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Telegram|Vídeos|Reels/i)).toBeNull();
  });

  it("informa quando o dia editorial está esgotado sem sugerir criação de drafts", async () => {
    vi.mocked(rotateNextWhatsappEditorialBatchAction).mockResolvedValue({
      ok: true,
      mode: "next-batch",
      status: "exhausted",
      selectedCount: 0,
      availableBeforeSelection: 0,
      selectedOfferIds: [],
      message: "Não há mais ofertas editoriais disponíveis hoje.",
    });

    render(<WhatsappTop30Action />);
    fireEvent.click(screen.getByRole("button", { name: "Atualizar melhores ofertas" }));

    await waitFor(() => expect(screen.getByText("0 novas ofertas disponíveis hoje")).toBeTruthy());
  });
});
