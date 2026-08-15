import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AutoReelClient } from "@/app/(dashboard)/reels/AutoReelClient";
import type { AutoReelStatus } from "@/lib/videos/auto-reel";

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
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ job: { id: "job-1", status: "processing", stage: "planning" } }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ job: { id: "job-1", status: "queued", stage: "queued" } }), { status: 200 }));
    render(<AutoReelClient offers={offers} />);
    fireEvent.click(screen.getByRole("button", { name: "Gerar Reel" }));

    await waitFor(() => expect(screen.getAllByText(/Na fila/).length).toBeGreaterThan(0));
    expect(fetchMock).toHaveBeenCalledWith("/api/reels/generate", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ offerId: offers[0].id, style: "demonstrative-reel" }),
    }));
  });

  it("atualiza o status por polling e exibe pronto para revisão", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ job: { id: "job-1", status: "processing", stage: "planning" } }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ job: { id: "job-1", status: "queued", stage: "queued" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ job: { id: "job-1", status: "ready_for_review", stage: "ready_for_review" } }), { status: 200 }));
    render(<AutoReelClient offers={offers} pollingMs={10} />);
    fireEvent.click(screen.getByRole("button", { name: "Gerar Reel" }));

    await waitFor(() => expect(screen.getAllByText(/Na fila/).length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.getAllByText(/Pronto para revisão/).length).toBeGreaterThan(0));
    expect(fetchMock).toHaveBeenCalledWith("/api/reels/generate?jobId=job-1");
  });

  it("retoma as cenas da nova tentativa antes de enfileirar o worker", async () => {
    const previousJob: { id: string; status: AutoReelStatus; stage: AutoReelStatus } = { id: "job-previous", status: "ready_for_review", stage: "ready_for_review" };
    const regeneratedJob = { id: "job-next", status: "processing", stage: "planning" };
    const scenesJob = { id: "job-next", status: "processing", stage: "scenes_ready" };
    const queuedJob = { id: "job-next", status: "queued", stage: "queued" };
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ job: regeneratedJob }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ job: scenesJob }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ job: queuedJob }), { status: 200 }));
    render(<AutoReelClient offers={offers} initialJobs={[previousJob]} />);

    fireEvent.click(screen.getByRole("button", { name: "Gerar novamente" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/reels/scenes", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ jobId: "job-next" }),
    })));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/reels/complete", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ jobId: "job-next" }),
    })));
  });

  it("não exige qualquer fluxo de importação manual para gerar o Auto Reel", () => {
    render(<AutoReelClient offers={offers} />);
    expect(screen.queryByText("Importar criativo autorizado")).toBeNull();
  });
});
