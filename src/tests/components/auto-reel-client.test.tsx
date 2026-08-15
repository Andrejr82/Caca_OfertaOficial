import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AutoReelClient } from "@/app/(dashboard)/reels/AutoReelClient";

const offers = [{
  id: "11111111-1111-4111-8111-111111111111",
  product_name: "Tênis demonstrativo",
  current_price: 129.9,
  platform: "Shopee",
  image_url: "https://cdn.example.com/tenis.jpg",
}];

describe("AutoReelClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => cleanup());

  it("exibe oferta real, preview e estilo demonstrativo", () => {
    render(<AutoReelClient offers={offers} />);
    expect(screen.getByText("Tênis demonstrativo")).toBeTruthy();
    expect(screen.getByText("Shopee")).toBeTruthy();
    expect(screen.getByText("Estilo: Reel demonstrativo")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Tênis demonstrativo" }).getAttribute("src")).toBe(offers[0].image_url);
  });

  it("envia somente offerId e style e mostra o job na fila", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      job: { id: "job-1", status: "queued", stage: "queued" },
    }), { status: 201 }));
    render(<AutoReelClient offers={offers} />);
    fireEvent.click(screen.getByRole("button", { name: "Gerar Reel" }));

    await waitFor(() => expect(screen.getByText(/Na fila/)).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith("/api/reels/generate", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ offerId: offers[0].id, style: "demonstrative-reel" }),
    }));
  });

  it("atualiza o status por polling e exibe pronto para revisão", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ job: { id: "job-1", status: "queued", stage: "queued" } }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ job: { id: "job-1", status: "ready_for_review", stage: "ready_for_review" } }), { status: 200 }));
    render(<AutoReelClient offers={offers} pollingMs={10} />);
    fireEvent.click(screen.getByRole("button", { name: "Gerar Reel" }));

    await waitFor(() => expect(screen.getByText(/Na fila/)).toBeTruthy());
    await waitFor(() => expect(screen.getByText(/Pronto para revisão/)).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith("/api/reels/generate?jobId=job-1");
  });

  it("não exige qualquer fluxo de importação manual para gerar o Auto Reel", () => {
    render(<AutoReelClient offers={offers} />);
    expect(screen.queryByText("Importar criativo autorizado")).toBeNull();
  });
});
