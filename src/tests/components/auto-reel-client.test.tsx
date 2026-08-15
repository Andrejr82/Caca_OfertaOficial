import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";

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

  it("retoma planning e completa automaticamente ao terminar as cenas", async () => {
    const job = { id: "job-planning", status: "processing" as AutoReelStatus, stage: "planning" as AutoReelStatus };
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ job: { ...job, stage: "scenes_ready" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ job: { ...job, status: "queued", stage: "queued" } }), { status: 200 }));

    render(<AutoReelClient offers={offers} initialJobs={[job]} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/reels/scenes", expect.objectContaining({ body: JSON.stringify({ jobId: job.id }) })));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/reels/complete", expect.objectContaining({ body: JSON.stringify({ jobId: job.id }) })));
  });

  it("retoma generating_visual sem depender do handler", async () => {
    const job = { id: "job-generating", status: "processing" as AutoReelStatus, stage: "generating_visual" as AutoReelStatus };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ job: { ...job, stage: "scenes_ready" } }), { status: 200 }));

    render(<AutoReelClient offers={offers} initialJobs={[job]} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/reels/scenes", expect.objectContaining({ body: JSON.stringify({ jobId: job.id }) })));
  });

  it("avança planning até queued pela sequência scenes e complete", async () => {
    const job = { id: "job-flow", status: "processing" as AutoReelStatus, stage: "planning" as AutoReelStatus };
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ job: { ...job, stage: "generating_visual" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ job: { ...job, stage: "scenes_ready" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ job: { ...job, status: "queued", stage: "queued" } }), { status: 200 }));

    render(<AutoReelClient offers={offers} initialJobs={[job]} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/reels/scenes", "/api/reels/scenes", "/api/reels/complete"]);
  });

  it("não reabre cenas para jobs queued ou terminais", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ job: { id: "job-queued", status: "queued", stage: "queued" } }), { status: 200 }));
    render(<AutoReelClient offers={offers} initialJobs={[{ id: "job-queued", status: "queued", stage: "queued" }]} pollingMs={10} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/reels/generate?jobId=job-queued"));
    expect(fetchMock).not.toHaveBeenCalledWith("/api/reels/scenes", expect.anything());
  });

  it("não chama scenes ou complete para job terminal", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    render(<AutoReelClient offers={offers} initialJobs={[{ id: "job-final", status: "approved", stage: "approved" }]} />);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("evita requests duplicados de scenes sob StrictMode", async () => {
    const job = { id: "job-once", status: "processing" as AutoReelStatus, stage: "planning" as AutoReelStatus };
    let resolveScenes: ((response: Response) => void) | undefined;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise<Response>((resolve) => { resolveScenes = resolve; }));

    render(<StrictMode><AutoReelClient offers={offers} initialJobs={[job]} /></StrictMode>);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    resolveScenes?.(new Response(JSON.stringify({ job: { ...job, stage: "scenes_ready" } }), { status: 200 }));
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
